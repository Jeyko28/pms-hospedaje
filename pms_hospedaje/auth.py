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
from dbengine import USA_POSTGRES

# --------------------------------------------------------------------------- #
#  Configuracion
# --------------------------------------------------------------------------- #
# Clave para firmar los JWT.
#  - Desarrollo: se genera una clave aleatoria al arrancar (cambia cada reinicio).
#  - Produccion: se DEBE definir PMS_SECRET_KEY. Si falta, la app no arranca.
import secrets as _secrets

_SECRET_DEFAULT = _secrets.token_urlsafe(48)
_SECRET_KEY_RAW = os.environ.get("PMS_SECRET_KEY", "")
_ES_PROD = os.environ.get("PMS_ENV") == "production"

if _ES_PROD and not _SECRET_KEY_RAW:
    raise RuntimeError(
        "PMS_SECRET_KEY no esta definida en produccion. "
        "Define una clave secreta robusta en las variables de entorno."
    )

SECRET_KEY = _SECRET_KEY_RAW or _SECRET_DEFAULT
ALGORITHM = "HS256"
TOKEN_HORAS = 2  # la sesion dura 2 horas (antes: 12h)

# Cupo de cambios del slug del link público por hospedaje. El link se comparte
# (WhatsApp, Instagram, Google); cambiarlo invalida los enlaces ya difundidos,
# por eso se limita a unas pocas oportunidades.
MAX_CAMBIOS_SLUG = 3

# ID de cliente de Google (para "Iniciar sesion con Google"). Se define como
# variable de entorno GOOGLE_CLIENT_ID. Si no esta, el login con Google se
# desactiva (pero el login normal sigue funcionando).
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")

# Contrasena inicial del admin por defecto (solo si no existe ningun usuario).
# En produccion se DEBE definir PMS_ADMIN_PASSWORD; si falta, la app no arranca.
_ADMIN_PASS_RAW = os.environ.get("PMS_ADMIN_PASSWORD", "")
if _ES_PROD and not _ADMIN_PASS_RAW:
    raise RuntimeError(
        "PMS_ADMIN_PASSWORD no esta definida en produccion. "
        "Define una contrasena segura para el admin en las variables de entorno."
    )
ADMIN_PASSWORD_INICIAL = _ADMIN_PASS_RAW or "cambia-esta-clave"

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
                email TEXT,                             -- para login con Google
                creado_en TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        # BDs antiguas: añadir columna email si falta (no rompe nada).
        cols = {row[1] if not USA_POSTGRES else row[0] for row in _columnas_usuarios(cursor)}
        if "email" not in cols:
            try:
                cursor.execute("ALTER TABLE usuarios ADD COLUMN email TEXT")
            except Exception:
                pass
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


def _columnas_usuarios(cursor):
    """Devuelve filas describiendo las columnas de 'usuarios' segun el motor."""
    if USA_POSTGRES:
        cursor.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name='usuarios'"
        )
        return cursor.fetchall()
    cursor.execute("PRAGMA table_info(usuarios)")
    return cursor.fetchall()


# --------------------------------------------------------------------------- #
#  Hash de contrasenas (bcrypt)
# --------------------------------------------------------------------------- #
def hashear_password(plano: str) -> str:
    return bcrypt.hashpw(plano.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verificar_password(plano: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plano.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
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


def buscar_por_email(email: str):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM usuarios WHERE email = ?", (email,))
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def verificar_token_google(credential: str) -> dict:
    """Verifica el token de Google y devuelve los datos del usuario
    (email, nombre). Lanza 401/503 si no es valido o si no esta configurado."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="El inicio de sesion con Google no esta configurado.",
        )
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

        info = id_token.verify_oauth2_token(
            credential, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Token de Google invalido.")

    email = info.get("email")
    if not email or not info.get("email_verified", False):
        raise HTTPException(status_code=401, detail="Correo de Google no verificado.")
    return {
        "email": email,
        "nombre": info.get("name") or email.split("@")[0],
    }


def estado_hospedaje(hospedaje_id):
    """Devuelve (estado, fecha_expira) del hospedaje, o (None, None) si no existe.
    El superadmin no depende de esto."""
    if hospedaje_id is None:
        return None, None
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT estado, fecha_expira FROM hospedajes WHERE id = ?", (hospedaje_id,)
        )
        row = cursor.fetchone()
        if not row:
            return None, None
        return row["estado"], row["fecha_expira"]
    finally:
        conn.close()


def verificar_acceso_hospedaje(usuario: dict):
    """Lanza 403 si el hospedaje del usuario no puede operar:
      - estado suspendido/cancelado (corte manual del proveedor), o
      - la suscripcion/prueba ya VENCIO (fecha_expira pasada).
    El superadmin siempre pasa. Se llama en el login y en cada peticion."""
    if usuario.get("rol") == "superadmin":
        return
    est, fecha_expira = estado_hospedaje(usuario.get("hospedaje_id"))
    if est in ("suspendido", "cancelado"):
        raise HTTPException(
            status_code=403,
            detail="Tu cuenta está suspendida. Contacta al proveedor para reactivarla.",
        )
    # Bloqueo automatico por vencimiento (prueba o suscripcion).
    if fecha_expira:
        hoy = datetime.now().strftime("%Y-%m-%d")
        if str(fecha_expira)[:10] < hoy:
            detalle = (
                "Tu prueba gratis terminó."
                if est == "prueba"
                else "Tu suscripción venció."
            )
            raise HTTPException(
                status_code=403,
                detail=f"{detalle} Renueva tu plan para seguir usando el sistema.",
            )


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
    # Bloquea el acceso si el hospedaje está suspendido/cancelado.
    verificar_acceso_hospedaje(u)
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


def solo_superadmin(actual: dict = Depends(usuario_actual)) -> dict:
    """Exige rol superadmin (el dueño del SaaS). Para gestionar hospedajes."""
    if actual["rol"] != "superadmin":
        raise HTTPException(
            status_code=403, detail="Solo el super administrador puede hacer esto."
        )
    return actual


def publico(usuario_dict: dict) -> dict:
    """Quita el hash antes de devolver un usuario al frontend.
    Incluye el slug y nombre del hospedaje (para el link publico de reservas)."""
    hid = usuario_dict.get("hospedaje_id")
    slug = None
    nombre_h = None
    slug_cambios = 0
    moneda = "PEN"
    monedas_aceptadas = ""
    if hid is not None:
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT slug, nombre, slug_cambios FROM hospedajes WHERE id = ?", (hid,))
            row = cursor.fetchone()
            if row:
                slug = row["slug"]
                nombre_h = row["nombre"]
                # La columna puede no existir en bases muy antiguas (pre-migración).
                try:
                    slug_cambios = row["slug_cambios"] or 0
                except (KeyError, IndexError):
                    slug_cambios = 0
            # Moneda base + monedas aceptadas del hospedaje (multi-moneda). Best-effort
            # por si las columnas aún no existen en una base muy antigua.
            try:
                cursor.execute(
                    "SELECT COALESCE(moneda,'PEN') AS moneda, COALESCE(monedas_aceptadas,'') AS aceptadas "
                    "FROM hospedajes WHERE id = ?",
                    (hid,),
                )
                r2 = cursor.fetchone()
                if r2:
                    moneda = r2["moneda"] or "PEN"
                    monedas_aceptadas = r2["aceptadas"] or ""
            except Exception:
                moneda = "PEN"
        finally:
            conn.close()
    return {
        "id": usuario_dict["id"],
        "usuario": usuario_dict["usuario"],
        "nombre": usuario_dict["nombre"],
        "rol": usuario_dict["rol"],
        "activo": bool(usuario_dict["activo"]),
        "hospedaje_id": hid,
        "hospedaje_slug": slug,
        "hospedaje_nombre": nombre_h,
        "moneda": moneda,
        "monedas_aceptadas": monedas_aceptadas,
        "slug_cambios": slug_cambios,
        "slug_cambios_max": MAX_CAMBIOS_SLUG,
    }
