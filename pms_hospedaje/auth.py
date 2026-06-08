"""
auth.py
Autenticacion y autorizacion del PMS.

Responsabilidades (separadas del resto de la API):
  - Tabla `usuarios` (con rol).
  - Hash de contrasenas con bcrypt (nunca se guarda la clave en texto plano).
  - Emision y verificacion de tokens JWT (sesion sin estado).
  - Dependencias de FastAPI para proteger rutas y exigir rol admin.

Roles:
  - "admin"     -> acceso total, incluida la gestion de usuarios.
  - "recepcion" -> operacion diaria (reservas, check-in/out, pagos) pero
                   sin gestionar usuarios ni eliminar entidades.
"""

import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

from database import get_connection

# --------------------------------------------------------------------------- #
#  Configuracion
# --------------------------------------------------------------------------- #
# Clave para firmar los JWT.
#  - Desarrollo: si no hay variable de entorno, se usa una clave por defecto
#    (solo local; NO sirve para produccion).
#  - Produccion: se DEBE definir PMS_SECRET_KEY. Si ademas se marca
#    PMS_ENV=production sin clave, la app no arranca (evita exponer la default).
_DEFAULT_DEV_KEY = "dev-only-cambia-esta-clave-pms-2026"
SECRET_KEY = os.environ.get("PMS_SECRET_KEY", _DEFAULT_DEV_KEY)

if os.environ.get("PMS_ENV") == "production" and SECRET_KEY == _DEFAULT_DEV_KEY:
    raise RuntimeError(
        "PMS_SECRET_KEY no esta definida en produccion. "
        "Define una clave secreta robusta en las variables de entorno."
    )

ALGORITHM = "HS256"
TOKEN_HORAS = 12  # la sesion dura 12 horas

# Contrasena inicial del admin por defecto (solo si no existe ningun usuario).
# En produccion conviene definir PMS_ADMIN_PASSWORD para no usar 'admin123'.
ADMIN_PASSWORD_INICIAL = os.environ.get("PMS_ADMIN_PASSWORD", "admin123")

# tokenUrl es solo informativo para la doc; el login real esta en /api/auth/login
oauth2 = OAuth2PasswordBearer(tokenUrl="api/auth/login")


# --------------------------------------------------------------------------- #
#  Tabla de usuarios + usuario admin por defecto
# --------------------------------------------------------------------------- #
def crear_tabla_usuarios():
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario TEXT UNIQUE NOT NULL,
                nombre TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                rol TEXT NOT NULL DEFAULT 'recepcion',  -- 'superadmin'|'admin'|'recepcion'
                activo INTEGER DEFAULT 1,
                hospedaje_id INTEGER DEFAULT 1,         -- a qué hospedaje pertenece
                creado_en TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        # Si no hay ningun usuario, crear un admin por defecto para el primer acceso.
        cursor.execute("SELECT COUNT(*) AS n FROM usuarios")
        if cursor.fetchone()["n"] == 0:
            cursor.execute(
                "INSERT INTO usuarios (usuario, nombre, password_hash, rol, hospedaje_id) VALUES (?, ?, ?, ?, ?)",
                ("admin", "Administrador", hashear_password(ADMIN_PASSWORD_INICIAL), "admin", 1),
            )
        conn.commit()
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
#  Hash de contrasenas (bcrypt)
# --------------------------------------------------------------------------- #
def hashear_password(plano: str) -> str:
    return bcrypt.hashpw(plano.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verificar_password(plano: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plano.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# --------------------------------------------------------------------------- #
#  Tokens JWT
# --------------------------------------------------------------------------- #
def crear_token(usuario: dict) -> str:
    expira = datetime.now(timezone.utc) + timedelta(hours=TOKEN_HORAS)
    payload = {
        "sub": str(usuario["id"]),
        "usuario": usuario["usuario"],
        "nombre": usuario["nombre"],
        "rol": usuario["rol"],
        # A qué hospedaje pertenece el usuario (multi-tenant). El superadmin
        # puede no tener uno fijo (None).
        "hospedaje_id": usuario.get("hospedaje_id"),
        "exp": expira,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _decodificar_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="La sesion expiro. Inicia sesion de nuevo.")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token invalido.")


# --------------------------------------------------------------------------- #
#  Operaciones sobre usuarios
# --------------------------------------------------------------------------- #
def buscar_por_usuario(usuario: str):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM usuarios WHERE usuario = ?", (usuario,))
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def buscar_por_id(uid: int):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM usuarios WHERE id = ?", (uid,))
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def autenticar(usuario: str, password: str):
    """Devuelve el dict del usuario si las credenciales son validas, o None."""
    u = buscar_por_usuario(usuario)
    if not u or not u["activo"]:
        return None
    if not verificar_password(password, u["password_hash"]):
        return None
    return u


# --------------------------------------------------------------------------- #
#  Dependencias de FastAPI (protegen rutas)
# --------------------------------------------------------------------------- #
def usuario_actual(token: str = Depends(oauth2)) -> dict:
    """Valida el token y devuelve los datos del usuario logueado.
    Usar en rutas que requieren estar autenticado."""
    payload = _decodificar_token(token)
    uid = payload.get("sub")
    u = buscar_por_id(int(uid)) if uid else None
    if not u or not u["activo"]:
        raise HTTPException(status_code=401, detail="Usuario no valido.")
    return u


def solo_admin(actual: dict = Depends(usuario_actual)) -> dict:
    """Exige rol admin o superadmin. Para rutas sensibles (gestion de usuarios)."""
    if actual["rol"] not in ("admin", "superadmin"):
        raise HTTPException(
            status_code=403, detail="Necesitas permisos de administrador."
        )
    return actual


def hospedaje_actual(actual: dict = Depends(usuario_actual)) -> int:
    """Devuelve el hospedaje_id del usuario logueado. Es la pieza central del
    aislamiento multi-tenant: cada endpoint filtra por este id.

    El usuario siempre debe tener un hospedaje (salvo el superadmin, que se
    maneja aparte). Si por algún motivo no lo tiene, se bloquea por seguridad."""
    hid = actual.get("hospedaje_id")
    if hid is None:
        raise HTTPException(
            status_code=403,
            detail="Tu usuario no está asociado a ningún hospedaje.",
        )
    return hid


def publico(usuario_dict: dict) -> dict:
    """Quita el hash antes de devolver un usuario al frontend."""
    return {
        "id": usuario_dict["id"],
        "usuario": usuario_dict["usuario"],
        "nombre": usuario_dict["nombre"],
        "rol": usuario_dict["rol"],
        "activo": bool(usuario_dict["activo"]),
        "hospedaje_id": usuario_dict.get("hospedaje_id"),
    }
