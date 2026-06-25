"""
api.py
Capa API REST del PMS, construida con FastAPI.

Reutiliza TODA la logica de negocio existente (modelos.py, database.py, utils.py)
sin reescribirla: aqui solo la "exponemos" como endpoints JSON para que el
frontend web (React) la consuma.

Como ejecutar (desde la carpeta pms_hospedaje):
    pip install -r requirements-api.txt
    uvicorn api:app --reload --port 8000

Documentacion interactiva automatica en:  http://localhost:8000/docs
"""

import calendar
import csv
import io
from datetime import datetime, timedelta

import os

# Cargar variables de un archivo .env.local si existe (desarrollo local).
# Asi GOOGLE_CLIENT_ID, etc. quedan disponibles sin definirlas a mano cada vez.
# En produccion (Render) las variables se definen en el panel, no con archivo.
def _cargar_env_local():
    ruta = os.path.join(os.path.dirname(__file__), ".env.local")
    if not os.path.exists(ruta):
        return
    with open(ruta, encoding="utf-8") as f:
        for linea in f:
            linea = linea.strip()
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            clave, _, valor = linea.partition("=")
            clave = clave.strip()
            valor = valor.strip().strip('"').strip("'")
            # No pisar variables ya definidas en el entorno real.
            os.environ.setdefault(clave, valor)

_cargar_env_local()

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

import database
import auth
import sunat
from database import get_connection
from modelos import Habitacion, Huesped, Reserva, Estancia, Factura, Pago
from utils import generar_factura_pdf

# Al importar database se crean las tablas y los datos de ejemplo si faltan.
database.crear_tablas()
# Crear tabla de usuarios y un admin por defecto si no existe ninguno.
auth.crear_tabla_usuarios()
# Crear tablas de facturación electrónica (SUNAT) si faltan.
sunat.crear_tablas_sunat()

app = FastAPI(
    title="PMS Hospedaje API",
    description="API del sistema de gestion para pequenos hospedajes.",
    version="0.4.0",
)

# Origenes permitidos (CORS).
#  - En desarrollo: localhost en sus puertos habituales.
#  - En produccion: se anaden los dominios definidos en la variable de entorno
#    CORS_ORIGINS (separados por coma), p.ej. la URL del frontend en Vercel.
_origenes = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5190",
    "http://127.0.0.1:5190",
]
_extra = os.environ.get("CORS_ORIGINS", "")
if _extra:
    _origenes += [o.strip() for o in _extra.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origenes,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):51\d\d",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _a_dict(obj):
    """Convierte un objeto de modelo (Habitacion, Huesped...) en dict."""
    return vars(obj)


def _slugify(texto: str) -> str:
    """Convierte 'Hostal El Sol' -> 'hostal-el-sol' (para URLs públicas)."""
    import re
    import unicodedata

    # Quitar acentos.
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    t = t.lower().strip()
    t = re.sub(r"[^a-z0-9]+", "-", t)      # espacios/simbolos -> guion
    t = re.sub(r"-+", "-", t).strip("-")   # colapsar guiones
    return t or "hospedaje"


def _slug_unico(cursor, base: str, excluir_id=None) -> str:
    """Devuelve un slug único: si 'hostal-sol' existe, prueba 'hostal-sol-2', etc."""
    slug = base
    i = 1
    while True:
        if excluir_id is not None:
            cursor.execute(
                "SELECT id FROM hospedajes WHERE slug = ? AND id != ?", (slug, excluir_id)
            )
        else:
            cursor.execute("SELECT id FROM hospedajes WHERE slug = ?", (slug,))
        if not cursor.fetchone():
            return slug
        i += 1
        slug = f"{base}-{i}"


# --------------------------------------------------------------------------- #
#  Esquemas de entrada (lo que el frontend envia). Pydantic valida tipos.
# --------------------------------------------------------------------------- #
class ReservaNueva(BaseModel):
    huesped_id: int
    habitacion_id: int
    fecha_entrada: str = Field(..., description="Formato YYYY-MM-DD")
    fecha_salida: str = Field(..., description="Formato YYYY-MM-DD")
    notas: str = ""


class MoverReserva(BaseModel):
    # Cambiar una reserva a otra habitacion (arrastre en el calendario).
    habitacion_id: int


class ReservaEdit(BaseModel):
    # Editar fechas/notas de una reserva (no cambia habitacion ni huesped).
    fecha_entrada: str
    fecha_salida: str
    notas: str = ""


class ReservaPublica(BaseModel):
    # Lo que un huesped envia desde la pagina publica de reservas.
    habitacion_id: int
    fecha_entrada: str
    fecha_salida: str
    nombre: str
    email: str = ""
    telefono: str = ""
    notas: str = ""


class HuespedDatos(BaseModel):
    nombre: str
    email: str = ""
    telefono: str = ""
    documento: str = ""
    direccion: str = ""
    tipo_documento: str = "DNI"  # DNI | CE | Pasaporte


class HabitacionDatos(BaseModel):
    numero: str
    tipo: str
    precio_base: float
    estado_limpieza: str = "Limpia"
    estado: str = "disponible"


class BloqueoNuevo(BaseModel):
    habitacion_id: int
    fecha_inicio: str  # YYYY-MM-DD (inclusive)
    fecha_fin: str     # YYYY-MM-DD (exclusivo, igual que salida de reserva)
    motivo: str = ""


class CheckinIn(BaseModel):
    reserva_id: int
    # Fecha real de entrada (YYYY-MM-DD). Si va vacía se usa hoy. Permite
    # registrar un check-in adelantado/atrasado y cobrar por las noches reales.
    fecha_entrada_real: str = ""


class CheckoutIn(BaseModel):
    estancia_id: int
    # Fecha real de salida (YYYY-MM-DD). Si va vacía se usa hoy. Permite cerrar
    # con la estadía real (salida adelantada o extendida) y cobrar correcto.
    fecha_checkout_real: str = ""
    # Descuento/cortesía opcional aplicado en el COBRO (lo usa /recalcular).
    descuento: float = 0
    descuento_motivo: str = ""


class PagoNuevo(BaseModel):
    factura_id: int
    monto: float
    metodo: str = "efectivo"
    referencia: str = ""


class SunatConfigDatos(BaseModel):
    ruc: str = ""
    razon_social: str = ""
    direccion: str = ""
    serie_boleta: str = "B001"
    modo: str = "sandbox"
    activo: bool = False


class LoginIn(BaseModel):
    usuario: str
    password: str


class GoogleLoginIn(BaseModel):
    # El frontend obtiene este 'credential' (JWT) del botón de Google.
    credential: str


class UsuarioNuevo(BaseModel):
    usuario: str
    nombre: str
    password: str
    rol: str = "recepcion"  # 'admin' | 'recepcion'


class UsuarioEdit(BaseModel):
    nombre: str
    rol: str
    activo: bool = True
    password: str = ""  # vacio = no cambiar la contrasena


class HospedajeNuevo(BaseModel):
    # Datos del hospedaje + su usuario administrador inicial.
    nombre: str
    plan: str = "trial"          # 'trial' | 'basico' | 'pro'
    estado: str = "activo"       # 'prueba' | 'activo' | 'suspendido' | 'cancelado'
    fecha_expira: str = ""       # YYYY-MM-DD (vacio = sin fecha)
    admin_usuario: str           # usuario del admin de ese hospedaje
    admin_nombre: str
    admin_password: str


class HospedajeEdit(BaseModel):
    nombre: str
    plan: str
    estado: str
    fecha_expira: str = ""


class SlugNuevo(BaseModel):
    # El admin personaliza el slug de su link público de reservas.
    slug: str


class RegistroPublico(BaseModel):
    # Lo que un cliente nuevo llena en la pagina publica de registro.
    hospedaje_nombre: str
    nombre: str          # nombre de la persona (su admin)
    email: str           # correo de contacto del cliente
    usuario: str         # usuario para iniciar sesion
    password: str


# --------------------------------------------------------------------------- #
#  Autenticacion y gestion de usuarios
# --------------------------------------------------------------------------- #
@app.post("/api/auth/login")
def login(datos: LoginIn):
    u = auth.autenticar(datos.usuario.strip(), datos.password)
    if not u:
        raise HTTPException(status_code=401, detail="Usuario o contrasena incorrectos.")
    # Bloquea el login si el hospedaje está suspendido/cancelado.
    auth.verificar_acceso_hospedaje(u)
    token = auth.crear_token(u)
    return {"token": token, "usuario": auth.publico(u)}


@app.post("/api/auth/registro", status_code=201)
def registro_publico(datos: RegistroPublico):
    """Registro SELF-SERVICE: un cliente nuevo crea su hospedaje + su usuario
    admin con una prueba gratis de 14 dias. Endpoint PUBLICO (sin login).
    Al terminar, devuelve el token para entrar directo a la app."""
    nombre_h = datos.hospedaje_nombre.strip()
    nombre = datos.nombre.strip()
    usuario = datos.usuario.strip()
    email = datos.email.strip()
    if not nombre_h or not nombre or not usuario or not email:
        raise HTTPException(status_code=422, detail="Todos los campos son obligatorios.")
    # Validacion basica de correo.
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=422, detail="Escribe un correo valido.")
    if len(datos.password) < 6:
        raise HTTPException(
            status_code=422, detail="La contrasena debe tener al menos 6 caracteres."
        )
    if auth.buscar_por_usuario(usuario):
        raise HTTPException(status_code=409, detail="Ese nombre de usuario ya esta en uso.")

    from datetime import timedelta as _td
    fecha_expira = (datetime.now() + _td(days=14)).strftime("%Y-%m-%d")

    conn = get_connection()
    try:
        cursor = conn.cursor()
        slug = _slug_unico(cursor, _slugify(nombre_h))
        cursor.execute(
            "INSERT INTO hospedajes (nombre, slug, plan, estado, fecha_expira) VALUES (?, ?, ?, ?, ?)",
            (nombre_h, slug, "trial", "prueba", fecha_expira),
        )
        nuevo_hid = cursor.lastrowid
        cursor.execute(
            "INSERT INTO usuarios (usuario, nombre, password_hash, rol, hospedaje_id, email) VALUES (?, ?, ?, ?, ?, ?)",
            (usuario, nombre, auth.hashear_password(datos.password), "admin", nuevo_hid, email),
        )
        conn.commit()
    finally:
        conn.close()

    # Entrar directo: emitir token del nuevo admin.
    u = auth.buscar_por_usuario(usuario)
    token = auth.crear_token(u)
    return {
        "token": token,
        "usuario": auth.publico(u),
        "fecha_expira": fecha_expira,
    }


@app.post("/api/auth/google")
def login_google(datos: GoogleLoginIn):
    """Inicia sesion con Google. Verifica el token, y:
      - Si el correo ya tiene cuenta -> entra (respeta suspension).
      - Si no -> crea un hospedaje nuevo con trial de 14 dias (onboarding).
    Endpoint PUBLICO."""
    info = auth.verificar_token_google(datos.credential)
    email = info["email"]
    nombre = info["nombre"]

    u = auth.buscar_por_email(email)
    if u:
        if not u["activo"]:
            raise HTTPException(status_code=403, detail="Tu usuario esta inactivo.")
        auth.verificar_acceso_hospedaje(u)
        token = auth.crear_token(u)
        return {"token": token, "usuario": auth.publico(u), "nuevo": False}

    # No existe: crear hospedaje + usuario admin (login social = onboarding).
    from datetime import timedelta as _td
    fecha_expira = (datetime.now() + _td(days=14)).strftime("%Y-%m-%d")
    # Usuario de login derivado del email, garantizando unicidad.
    base = email.split("@")[0]
    usuario_login = base
    i = 1
    while auth.buscar_por_usuario(usuario_login):
        i += 1
        usuario_login = f"{base}{i}"

    conn = get_connection()
    try:
        cursor = conn.cursor()
        nombre_h = f"Hospedaje de {nombre}"
        slug = _slug_unico(cursor, _slugify(nombre_h))
        cursor.execute(
            "INSERT INTO hospedajes (nombre, slug, plan, estado, fecha_expira) VALUES (?, ?, ?, ?, ?)",
            (nombre_h, slug, "trial", "prueba", fecha_expira),
        )
        nuevo_hid = cursor.lastrowid
        # Sin contrasena utilizable: entra solo por Google (hash de un valor aleatorio).
        import secrets
        cursor.execute(
            "INSERT INTO usuarios (usuario, nombre, password_hash, rol, hospedaje_id, email) VALUES (?, ?, ?, ?, ?, ?)",
            (
                usuario_login,
                nombre,
                auth.hashear_password(secrets.token_urlsafe(16)),
                "admin",
                nuevo_hid,
                email,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    u = auth.buscar_por_email(email)
    token = auth.crear_token(u)
    return {"token": token, "usuario": auth.publico(u), "nuevo": True}


@app.get("/api/auth/yo")
def quien_soy(actual: dict = Depends(auth.usuario_actual)):
    """Devuelve los datos del usuario logueado (para que el frontend sepa
    quien es al recargar con un token guardado)."""
    return auth.publico(actual)


@app.put("/api/mi-hospedaje/slug")
def cambiar_slug(datos: SlugNuevo, admin: dict = Depends(auth.solo_admin)):
    """Personaliza el slug del link público de reservas del hospedaje del admin.

    Reglas (UX + integridad del link compartido):
      - Solo el admin (no recepción).
      - Cupo limitado: MAX_CAMBIOS_SLUG cambios efectivos por hospedaje.
      - Si el slug pedido es igual al actual, no consume cupo (no-op amable).
      - Debe ser único entre todos los hospedajes.
    """
    hid = admin["hospedaje_id"]

    # Normalizamos a un slug seguro para URL (mismo criterio que en el alta).
    nuevo = _slugify(datos.slug or "")
    if len(nuevo) < 3:
        raise HTTPException(
            status_code=422,
            detail="El link debe tener al menos 3 caracteres (letras, números o guiones).",
        )
    if len(nuevo) > 40:
        raise HTTPException(status_code=422, detail="El link es demasiado largo (máx. 40 caracteres).")

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT slug, COALESCE(slug_cambios, 0) AS slug_cambios FROM hospedajes WHERE id = ?",
            (hid,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Hospedaje no encontrado.")

        actual_slug = row["slug"]
        usados = row["slug_cambios"] or 0

        # No-op amable: pedir el mismo slug no gasta un cambio.
        if nuevo == actual_slug:
            return {
                "slug": actual_slug,
                "cambios_usados": usados,
                "cambios_max": auth.MAX_CAMBIOS_SLUG,
                "cambios_restantes": max(0, auth.MAX_CAMBIOS_SLUG - usados),
                "sin_cambio": True,
            }

        if usados >= auth.MAX_CAMBIOS_SLUG:
            raise HTTPException(
                status_code=409,
                detail=f"Ya usaste tus {auth.MAX_CAMBIOS_SLUG} cambios de link. "
                "Si necesitas otro, escríbenos para ayudarte.",
            )

        # Unicidad global del slug (excluyendo el propio hospedaje).
        cursor.execute(
            "SELECT id FROM hospedajes WHERE slug = ? AND id != ?", (nuevo, hid)
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=409,
                detail="Ese link ya está en uso por otro hospedaje. Prueba con otro.",
            )

        cursor.execute(
            "UPDATE hospedajes SET slug = ?, slug_cambios = ? WHERE id = ?",
            (nuevo, usados + 1, hid),
        )
        conn.commit()
    finally:
        conn.close()

    usados_final = usados + 1
    return {
        "slug": nuevo,
        "cambios_usados": usados_final,
        "cambios_max": auth.MAX_CAMBIOS_SLUG,
        "cambios_restantes": max(0, auth.MAX_CAMBIOS_SLUG - usados_final),
        "sin_cambio": False,
    }


@app.get("/api/usuarios")
def listar_usuarios(admin: dict = Depends(auth.solo_admin)):
    # Cada admin SOLO ve los usuarios de su propio hospedaje (aislamiento).
    hid = admin["hospedaje_id"]
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, usuario, nombre, rol, activo FROM usuarios WHERE hospedaje_id = ? ORDER BY id",
            (hid,),
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


@app.post("/api/usuarios", status_code=201)
def crear_usuario(datos: UsuarioNuevo, admin: dict = Depends(auth.solo_admin)):
    hid = admin["hospedaje_id"]
    if not datos.usuario.strip() or not datos.nombre.strip():
        raise HTTPException(status_code=422, detail="Usuario y nombre son obligatorios.")
    if len(datos.password) < 6:
        raise HTTPException(
            status_code=422, detail="La contrasena debe tener al menos 6 caracteres."
        )
    # Un admin de hospedaje solo crea admin/recepcion (no superadmin).
    if datos.rol not in ("admin", "recepcion"):
        raise HTTPException(status_code=422, detail="Rol invalido.")
    # El nombre de usuario es global-unico (es la llave de login).
    if auth.buscar_por_usuario(datos.usuario.strip()):
        raise HTTPException(status_code=409, detail="Ese nombre de usuario ya existe.")

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO usuarios (usuario, nombre, password_hash, rol, hospedaje_id) VALUES (?, ?, ?, ?, ?)",
            (
                datos.usuario.strip(),
                datos.nombre.strip(),
                auth.hashear_password(datos.password),
                datos.rol,
                hid,
            ),
        )
        conn.commit()
        nuevo_id = cursor.lastrowid
    finally:
        conn.close()
    return auth.publico(auth.buscar_por_id(nuevo_id))


def _usuario_de_mi_hospedaje(usuario_id, hid):
    """Devuelve el usuario solo si pertenece al hospedaje hid (o None)."""
    u = auth.buscar_por_id(usuario_id)
    if not u or u.get("hospedaje_id") != hid:
        return None
    return u


@app.put("/api/usuarios/{usuario_id}")
def editar_usuario(
    usuario_id: int, datos: UsuarioEdit, admin: dict = Depends(auth.solo_admin)
):
    hid = admin["hospedaje_id"]
    u = _usuario_de_mi_hospedaje(usuario_id, hid)
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if not datos.nombre.strip():
        raise HTTPException(status_code=422, detail="El nombre es obligatorio.")
    if datos.rol not in ("admin", "recepcion"):
        raise HTTPException(status_code=422, detail="Rol invalido.")
    if datos.password and len(datos.password) < 6:
        raise HTTPException(
            status_code=422, detail="La contrasena debe tener al menos 6 caracteres."
        )

    conn = get_connection()
    try:
        cursor = conn.cursor()
        if datos.password:
            cursor.execute(
                "UPDATE usuarios SET nombre=?, rol=?, activo=?, password_hash=? WHERE id=?",
                (
                    datos.nombre.strip(),
                    datos.rol,
                    1 if datos.activo else 0,
                    auth.hashear_password(datos.password),
                    usuario_id,
                ),
            )
        else:
            cursor.execute(
                "UPDATE usuarios SET nombre=?, rol=?, activo=? WHERE id=?",
                (datos.nombre.strip(), datos.rol, 1 if datos.activo else 0, usuario_id),
            )
        conn.commit()
    finally:
        conn.close()
    return auth.publico(auth.buscar_por_id(usuario_id))


@app.delete("/api/usuarios/{usuario_id}")
def eliminar_usuario(usuario_id: int, admin: dict = Depends(auth.solo_admin)):
    hid = admin["hospedaje_id"]
    u = _usuario_de_mi_hospedaje(usuario_id, hid)
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    # No permitir que un admin se borre a si mismo (evita quedarse sin acceso).
    if usuario_id == admin["id"]:
        raise HTTPException(
            status_code=409, detail="No puedes eliminar tu propio usuario."
        )
    # No permitir borrar el ultimo admin activo DE ESTE hospedaje.
    if u["rol"] == "admin":
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT COUNT(*) AS n FROM usuarios WHERE rol='admin' AND activo=1 AND hospedaje_id=? AND id!=?",
                (hid, usuario_id),
            )
            otros = cursor.fetchone()["n"]
        finally:
            conn.close()
        if otros == 0:
            raise HTTPException(
                status_code=409, detail="No puedes eliminar el unico administrador."
            )

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM usuarios WHERE id=?", (usuario_id,))
        conn.commit()
    finally:
        conn.close()
    return {"id": usuario_id, "eliminado": True}


# --------------------------------------------------------------------------- #
#  Hospedajes (SOLO super admin) — panel de gestion del SaaS
# --------------------------------------------------------------------------- #
@app.get("/api/hospedajes")
def listar_hospedajes(_sa: dict = Depends(auth.solo_superadmin)):
    """Lista todos los hospedajes con un conteo de sus usuarios."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT h.id, h.nombre, h.slug, h.plan, h.estado,
                   h.fecha_inicio, h.fecha_expira,
                   (SELECT COUNT(*) FROM usuarios u WHERE u.hospedaje_id = h.id) AS usuarios,
                   (SELECT COUNT(*) FROM habitaciones hb WHERE hb.hospedaje_id = h.id) AS habitaciones
            FROM hospedajes h
            ORDER BY h.id
            """
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


@app.post("/api/hospedajes", status_code=201)
def crear_hospedaje(datos: HospedajeNuevo, _sa: dict = Depends(auth.solo_superadmin)):
    """Da de alta un cliente nuevo: crea el hospedaje + su usuario admin."""
    if not datos.nombre.strip():
        raise HTTPException(status_code=422, detail="El nombre del hospedaje es obligatorio.")
    if not datos.admin_usuario.strip() or not datos.admin_nombre.strip():
        raise HTTPException(status_code=422, detail="Usuario y nombre del admin son obligatorios.")
    if len(datos.admin_password) < 6:
        raise HTTPException(status_code=422, detail="La contrasena debe tener al menos 6 caracteres.")
    if datos.plan not in ("trial", "basico", "pro"):
        raise HTTPException(status_code=422, detail="Plan invalido.")
    if datos.estado not in ("prueba", "activo", "suspendido", "cancelado"):
        raise HTTPException(status_code=422, detail="Estado invalido.")
    if auth.buscar_por_usuario(datos.admin_usuario.strip()):
        raise HTTPException(status_code=409, detail="Ese nombre de usuario ya existe.")

    conn = get_connection()
    try:
        cursor = conn.cursor()
        slug = _slug_unico(cursor, _slugify(datos.nombre.strip()))
        cursor.execute(
            "INSERT INTO hospedajes (nombre, slug, plan, estado, fecha_expira) VALUES (?, ?, ?, ?, ?)",
            (datos.nombre.strip(), slug, datos.plan, datos.estado, datos.fecha_expira or None),
        )
        nuevo_hid = cursor.lastrowid
        # Crear el usuario admin de ese hospedaje.
        cursor.execute(
            "INSERT INTO usuarios (usuario, nombre, password_hash, rol, hospedaje_id) VALUES (?, ?, ?, ?, ?)",
            (
                datos.admin_usuario.strip(),
                datos.admin_nombre.strip(),
                auth.hashear_password(datos.admin_password),
                "admin",
                nuevo_hid,
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return {"id": nuevo_hid, "nombre": datos.nombre.strip(), "estado": datos.estado}


@app.put("/api/hospedajes/{hospedaje_id}")
def editar_hospedaje(
    hospedaje_id: int, datos: HospedajeEdit, _sa: dict = Depends(auth.solo_superadmin)
):
    """Cambia nombre, plan, estado (activar/suspender) y vencimiento."""
    if datos.plan not in ("trial", "basico", "pro"):
        raise HTTPException(status_code=422, detail="Plan invalido.")
    if datos.estado not in ("prueba", "activo", "suspendido", "cancelado"):
        raise HTTPException(status_code=422, detail="Estado invalido.")
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM hospedajes WHERE id = ?", (hospedaje_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Hospedaje no encontrado.")
        cursor.execute(
            "UPDATE hospedajes SET nombre=?, plan=?, estado=?, fecha_expira=? WHERE id=?",
            (datos.nombre.strip(), datos.plan, datos.estado, datos.fecha_expira or None, hospedaje_id),
        )
        conn.commit()
    finally:
        conn.close()
    return {"id": hospedaje_id, "estado": datos.estado}


# --------------------------------------------------------------------------- #
#  Salud / raiz
# --------------------------------------------------------------------------- #
@app.get("/")
def raiz():
    return {"servicio": "PMS Hospedaje API", "estado": "ok", "docs": "/docs"}


@app.get("/api/config")
def config_publica():
    """Config publica para el frontend (sin secretos). Indica si el login con
    Google esta disponible y con que client id mostrar el boton."""
    return {
        "google_login": bool(auth.GOOGLE_CLIENT_ID),
        "google_client_id": auth.GOOGLE_CLIENT_ID,
    }


# --------------------------------------------------------------------------- #
#  Motor de reservas PUBLICO (Fase B) — sin login.
#  El huesped accede por el slug del hospedaje: /reservar/<slug>.
# --------------------------------------------------------------------------- #
@app.get("/api/publico/hospedaje/{slug}")
def hospedaje_publico(slug: str):
    """Info publica de un hospedaje + sus habitaciones (para la pagina de
    reservas que ve el huesped). Solo si el hospedaje puede operar."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, nombre, slug, estado FROM hospedajes WHERE slug = ?", (slug,)
        )
        h = cursor.fetchone()
        if not h:
            raise HTTPException(status_code=404, detail="Hospedaje no encontrado.")
        h = dict(h)
        # No mostrar la pagina si la cuenta no esta operativa.
        if h["estado"] in ("suspendido", "cancelado"):
            raise HTTPException(
                status_code=404, detail="Este hospedaje no esta disponible."
            )

        # Registrar la visita (alimenta el "Visitors Chart" del dashboard).
        # Best-effort: un fallo aqui NUNCA debe romper la pagina publica.
        try:
            cursor.execute("INSERT INTO visitas (hospedaje_id) VALUES (?)", (h["id"],))
            conn.commit()
        except Exception:
            pass

        # Habitaciones activas del hospedaje (datos minimos, sin info interna).
        cursor.execute(
            """
            SELECT id, numero, tipo, precio_base
            FROM habitaciones
            WHERE hospedaje_id = ? AND activa = 1
            ORDER BY precio_base
            """,
            (h["id"],),
        )
        habitaciones = [dict(r) for r in cursor.fetchall()]
        return {
            "hospedaje": {"nombre": h["nombre"], "slug": h["slug"]},
            "habitaciones": habitaciones,
        }
    finally:
        conn.close()


@app.get("/api/publico/disponibilidad/{slug}")
def disponibilidad_publica(slug: str, fecha_entrada: str, fecha_salida: str):
    """Devuelve las habitaciones LIBRES del hospedaje en el rango de fechas."""
    try:
        fe = datetime.strptime(fecha_entrada, "%Y-%m-%d")
        fs = datetime.strptime(fecha_salida, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="Fechas con formato YYYY-MM-DD.")
    if fs <= fe:
        raise HTTPException(
            status_code=422, detail="La salida debe ser posterior a la entrada."
        )

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, estado FROM hospedajes WHERE slug = ?", (slug,))
        h = cursor.fetchone()
        if not h or h["estado"] in ("suspendido", "cancelado"):
            raise HTTPException(status_code=404, detail="Hospedaje no disponible.")
        hid = h["id"]

        # Habitaciones del hospedaje LIBRES: sin reserva que se solape Y sin
        # estancia activa (huésped físicamente dentro) que se solape. Lo 2º
        # cubre check-ins adelantados / estadías cuyas fechas reales difieren
        # de la reserva (evita ofrecer una habitación realmente ocupada).
        cursor.execute(
            """
            SELECT id, numero, tipo, precio_base
            FROM habitaciones
            WHERE hospedaje_id = ? AND activa = 1
            AND id NOT IN (
                SELECT habitacion_id FROM reservas
                WHERE hospedaje_id = ? AND estado NOT IN ('Cancelada', 'Check-out')
                AND fecha_entrada < ? AND fecha_salida > ?
            )
            AND id NOT IN (
                SELECT habitacion_id FROM estancias
                WHERE hospedaje_id = ? AND estado = 'activa'
                AND fecha_checkin < ? AND fecha_checkout_esperado > ?
            )
            ORDER BY precio_base
            """,
            (hid, hid, fecha_salida, fecha_entrada, hid, fecha_salida, fecha_entrada),
        )
        libres = [dict(r) for r in cursor.fetchall()]
        noches = (fs - fe).days
        for r in libres:
            r["total"] = round(r["precio_base"] * noches, 2)
        return {"noches": noches, "habitaciones": libres}
    finally:
        conn.close()


@app.post("/api/publico/reservar/{slug}", status_code=201)
def crear_reserva_publica(slug: str, datos: ReservaPublica):
    """Crea una reserva desde la pagina publica. Registra al huesped (si es
    nuevo) y crea la reserva en estado 'Pendiente' (a confirmar/pagar)."""
    try:
        fe = datetime.strptime(datos.fecha_entrada, "%Y-%m-%d")
        fs = datetime.strptime(datos.fecha_salida, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="Fechas con formato YYYY-MM-DD.")
    if fs <= fe:
        raise HTTPException(
            status_code=422, detail="La salida debe ser posterior a la entrada."
        )
    if not datos.nombre.strip():
        raise HTTPException(status_code=422, detail="El nombre es obligatorio.")
    # Al menos una forma de contacto (correo o telefono) para poder ubicar al huesped.
    email = datos.email.strip()
    telefono = datos.telefono.strip()
    if not email and not telefono:
        raise HTTPException(
            status_code=422,
            detail="Indica un correo o un teléfono para que el hospedaje pueda contactarte.",
        )
    if email and ("@" not in email or "." not in email.split("@")[-1]):
        raise HTTPException(status_code=422, detail="Escribe un correo válido.")

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, estado FROM hospedajes WHERE slug = ?", (slug,))
        h = cursor.fetchone()
        if not h or h["estado"] in ("suspendido", "cancelado"):
            raise HTTPException(status_code=404, detail="Hospedaje no disponible.")
        hid = h["id"]

        # La habitacion debe pertenecer al hospedaje.
        cursor.execute(
            "SELECT precio_base FROM habitaciones WHERE id = ? AND hospedaje_id = ? AND activa = 1",
            (datos.habitacion_id, hid),
        )
        hab = cursor.fetchone()
        if not hab:
            raise HTTPException(status_code=404, detail="Habitacion no encontrada.")

        # Disponibilidad (evita doble reserva). Usa la función central, que
        # considera reservas Y estancias activas (ocupación física real).
        if not Reserva.verificar_disponibilidad(
            datos.habitacion_id, datos.fecha_entrada, datos.fecha_salida
        ):
            raise HTTPException(
                status_code=409, detail="Esa habitacion ya no esta disponible en esas fechas."
            )

        # Registrar al huesped (publico) en el hospedaje.
        cursor.execute(
            "INSERT INTO huespedes (nombre, email, telefono, hospedaje_id) VALUES (?, ?, ?, ?)",
            (datos.nombre.strip(), email, telefono, hid),
        )
        huesped_id = cursor.lastrowid

        noches = (fs - fe).days
        total = round(hab["precio_base"] * noches, 2)

        # Reserva en estado 'Pendiente' (la confirma/paga despues). origen
        # 'publico' = llegó por el link del motor de reservas.
        cursor.execute(
            """
            INSERT INTO reservas (huesped_id, habitacion_id, fecha_entrada, fecha_salida, estado, total, notas, hospedaje_id, origen)
            VALUES (?, ?, ?, ?, 'Pendiente', ?, ?, ?, 'publico')
            """,
            (huesped_id, datos.habitacion_id, datos.fecha_entrada, datos.fecha_salida,
             total, datos.notas, hid),
        )
        reserva_id = cursor.lastrowid
        conn.commit()
        return {
            "reserva_id": reserva_id,
            "total": total,
            "noches": noches,
            "estado": "Pendiente",
        }
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
#  Habitaciones (CRUD)
# --------------------------------------------------------------------------- #
def _ocupacion_hoy(hid: int) -> dict:
    """Estado de ocupacion de HOY por habitacion, DERIVADO del calendario (no
    del flag manual): mira estancias activas y reservas que cubren hoy.

    Devuelve {habitacion_id: {"estado": "ocupada"|"reservada"|"libre"|
    "mantenimiento", "salida_vencida": bool}}.
      - ocupada:   hay un huesped con check-in (estancia activa).
      - reservada: hay una reserva (Pendiente/Confirmada) que cubre hoy pero
                   el huesped aun no hizo check-in (llega hoy / esperado).
      - libre:     nada cubre hoy.
      - salida_vencida: el huesped sigue con check-in pero su salida esperada
                   ya paso (recordatorio para cerrar la estancia)."""
    hoy = datetime.now().strftime("%Y-%m-%d")
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, estado FROM habitaciones WHERE activa = 1 AND hospedaje_id = ?",
            (hid,),
        )
        habs = {r["id"]: r["estado"] for r in cursor.fetchall()}

        cursor.execute(
            "SELECT habitacion_id, fecha_checkout_esperado FROM estancias WHERE estado = 'activa' AND hospedaje_id = ?",
            (hid,),
        )
        estancias = {r["habitacion_id"]: r["fecha_checkout_esperado"] for r in cursor.fetchall()}

        cursor.execute(
            """
            SELECT DISTINCT habitacion_id FROM reservas
            WHERE hospedaje_id = ? AND estado IN ('Pendiente', 'Confirmada')
            AND fecha_entrada <= ? AND fecha_salida > ?
            """,
            (hid, hoy, hoy),
        )
        reservadas = {r["habitacion_id"] for r in cursor.fetchall()}
    finally:
        conn.close()

    out = {}
    for hab_id, estado_manual in habs.items():
        if estado_manual == "mantenimiento":
            out[hab_id] = {"estado": "mantenimiento", "salida_vencida": False}
        elif hab_id in estancias:
            esp = estancias[hab_id]
            out[hab_id] = {"estado": "ocupada", "salida_vencida": bool(esp) and esp < hoy}
        elif hab_id in reservadas:
            out[hab_id] = {"estado": "reservada", "salida_vencida": False}
        else:
            out[hab_id] = {"estado": "libre", "salida_vencida": False}
    return out


@app.get("/api/habitaciones")
def listar_habitaciones(solo_activas: bool = True, hid: int = Depends(auth.hospedaje_actual)):
    habs = [
        _a_dict(h)
        for h in Habitacion.obtener_todas(solo_activas=solo_activas, hospedaje_id=hid)
    ]
    ocup = _ocupacion_hoy(hid)
    for h in habs:
        info = ocup.get(h["id"], {"estado": "libre", "salida_vencida": False})
        h["ocupacion_hoy"] = info["estado"]
        h["salida_vencida"] = info["salida_vencida"]
    return habs


def _buscar_habitacion(habitacion_id, hid):
    # Solo busca dentro del hospedaje indicado (aislamiento).
    return next(
        (
            h
            for h in Habitacion.obtener_todas(solo_activas=False, hospedaje_id=hid)
            if h.id == habitacion_id
        ),
        None,
    )


@app.post("/api/habitaciones", status_code=201)
def crear_habitacion(datos: HabitacionDatos, hid: int = Depends(auth.hospedaje_actual)):
    if not datos.numero.strip() or not datos.tipo.strip():
        raise HTTPException(status_code=422, detail="Numero y tipo son obligatorios.")
    if datos.precio_base < 0:
        raise HTTPException(status_code=422, detail="El precio no puede ser negativo.")
    # El número es único DENTRO del hospedaje (otro hospedaje sí puede tener "101").
    if any(
        h.numero == datos.numero.strip()
        for h in Habitacion.obtener_todas(solo_activas=False, hospedaje_id=hid)
    ):
        raise HTTPException(
            status_code=409, detail=f"Ya existe una habitacion con el numero {datos.numero}."
        )
    hab = Habitacion(
        numero=datos.numero.strip(),
        tipo=datos.tipo.strip(),
        precio_base=datos.precio_base,
        estado_limpieza=datos.estado_limpieza,
        estado=datos.estado,
        hospedaje_id=hid,
    )
    hab.guardar()
    return _a_dict(hab)


@app.put("/api/habitaciones/{habitacion_id}")
def editar_habitacion(
    habitacion_id: int, datos: HabitacionDatos, hid: int = Depends(auth.hospedaje_actual)
):
    hab = _buscar_habitacion(habitacion_id, hid)
    if not hab:
        raise HTTPException(status_code=404, detail="Habitacion no encontrada.")
    if not datos.numero.strip() or not datos.tipo.strip():
        raise HTTPException(status_code=422, detail="Numero y tipo son obligatorios.")
    if datos.precio_base < 0:
        raise HTTPException(status_code=422, detail="El precio no puede ser negativo.")
    if any(
        h.numero == datos.numero.strip() and h.id != habitacion_id
        for h in Habitacion.obtener_todas(solo_activas=False, hospedaje_id=hid)
    ):
        raise HTTPException(
            status_code=409, detail=f"Ya existe una habitacion con el numero {datos.numero}."
        )
    hab.numero = datos.numero.strip()
    hab.tipo = datos.tipo.strip()
    hab.precio_base = datos.precio_base
    hab.estado_limpieza = datos.estado_limpieza
    hab.estado = datos.estado
    hab.guardar()
    return _a_dict(hab)


@app.delete("/api/habitaciones/{habitacion_id}")
def eliminar_habitacion(
    habitacion_id: int,
    _admin: dict = Depends(auth.solo_admin),
    hid: int = Depends(auth.hospedaje_actual),
):
    hab = _buscar_habitacion(habitacion_id, hid)
    if not hab:
        raise HTTPException(status_code=404, detail="Habitacion no encontrada.")
    if hab.estado == "ocupada":
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar una habitacion ocupada. Haz el check-out primero.",
        )
    hab.eliminar()
    return {"id": habitacion_id, "eliminada": True}


# --------------------------------------------------------------------------- #
#  Huespedes (CRUD)
# --------------------------------------------------------------------------- #
@app.get("/api/huespedes")
def listar_huespedes(hid: int = Depends(auth.hospedaje_actual)):
    return [_a_dict(h) for h in Huesped.obtener_todos(hospedaje_id=hid)]


def _validar_documento(tipo, numero):
    """Normaliza el tipo (DNI/CE/Pasaporte) y valida el número si se proporcionó.
    Documento opcional: si va vacío, no valida. Devuelve el tipo normalizado."""
    tipo = (tipo or "DNI").strip()
    if tipo not in ("DNI", "CE", "Pasaporte"):
        tipo = "DNI"
    num = (numero or "").strip()
    if num:
        if tipo == "DNI" and not (num.isdigit() and len(num) == 8):
            raise HTTPException(status_code=422, detail="El DNI debe tener 8 dígitos.")
        if tipo in ("CE", "Pasaporte") and not (num.isalnum() and 6 <= len(num) <= 15):
            raise HTTPException(status_code=422, detail=f"El número de {tipo} no es válido (6-15 caracteres).")
    return tipo


@app.post("/api/huespedes", status_code=201)
def crear_huesped(datos: HuespedDatos, hid: int = Depends(auth.hospedaje_actual)):
    if not datos.nombre.strip():
        raise HTTPException(status_code=422, detail="El nombre es obligatorio.")
    tipo_doc = _validar_documento(datos.tipo_documento, datos.documento)
    huesped = Huesped(
        nombre=datos.nombre.strip(),
        email=datos.email.strip(),
        telefono=datos.telefono.strip(),
        documento=datos.documento.strip(),
        direccion=datos.direccion.strip(),
        hospedaje_id=hid,
        tipo_documento=tipo_doc,
    )
    huesped.guardar()
    return _a_dict(huesped)


@app.put("/api/huespedes/{huesped_id}")
def editar_huesped(huesped_id: int, datos: HuespedDatos, hid: int = Depends(auth.hospedaje_actual)):
    huesped = Huesped.obtener_por_id(huesped_id, hospedaje_id=hid)
    if not huesped:
        raise HTTPException(status_code=404, detail="Huesped no encontrado.")
    if not datos.nombre.strip():
        raise HTTPException(status_code=422, detail="El nombre es obligatorio.")
    tipo_doc = _validar_documento(datos.tipo_documento, datos.documento)
    huesped.nombre = datos.nombre.strip()
    huesped.email = datos.email.strip()
    huesped.telefono = datos.telefono.strip()
    huesped.documento = datos.documento.strip()
    huesped.direccion = datos.direccion.strip()
    huesped.tipo_documento = tipo_doc
    huesped.guardar()
    return _a_dict(huesped)


@app.delete("/api/huespedes/{huesped_id}")
def eliminar_huesped(
    huesped_id: int,
    _admin: dict = Depends(auth.solo_admin),
    hid: int = Depends(auth.hospedaje_actual),
):
    huesped = Huesped.obtener_por_id(huesped_id, hospedaje_id=hid)
    if not huesped:
        raise HTTPException(status_code=404, detail="Huesped no encontrado.")
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) AS n FROM reservas WHERE huesped_id = ? AND estado != 'Cancelada' AND hospedaje_id = ?",
            (huesped_id, hid),
        )
        activas = cursor.fetchone()["n"]
    finally:
        conn.close()
    if activas > 0:
        raise HTTPException(
            status_code=409,
            detail=f"No se puede eliminar: el huesped tiene {activas} reserva(s) activa(s).",
        )
    huesped.eliminar()
    return {"id": huesped_id, "eliminado": True}


# --------------------------------------------------------------------------- #
#  Reservas
# --------------------------------------------------------------------------- #
@app.get("/api/reservas")
def listar_reservas(hid: int = Depends(auth.hospedaje_actual)):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT r.id, r.huesped_id, r.habitacion_id,
                   r.fecha_entrada, r.fecha_salida, r.estado, r.total,
                   h.nombre AS huesped, h.telefono AS telefono,
                   hab.numero AS habitacion, hab.tipo AS tipo
            FROM reservas r
            JOIN huespedes h    ON r.huesped_id = h.id
            JOIN habitaciones hab ON r.habitacion_id = hab.id
            WHERE r.hospedaje_id = ?
            ORDER BY r.fecha_entrada DESC
            """,
            (hid,),
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


@app.get("/api/reservas/calendario")
def reservas_calendario(
    desde: str, hasta: str, hid: int = Depends(auth.hospedaje_actual)
):
    """Datos para el CALENDARIO TIMELINE: las habitaciones del hospedaje y las
    reservas que se solapan con el rango [desde, hasta]. Optimizado para la
    vista habitacion x fecha."""
    try:
        datetime.strptime(desde, "%Y-%m-%d")
        datetime.strptime(hasta, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="Fechas con formato YYYY-MM-DD.")

    conn = get_connection()
    try:
        cursor = conn.cursor()
        # Habitaciones del hospedaje (filas del calendario).
        cursor.execute(
            "SELECT id, numero, tipo FROM habitaciones WHERE hospedaje_id = ? AND activa = 1 ORDER BY numero",
            (hid,),
        )
        habitaciones = [dict(r) for r in cursor.fetchall()]

        # Reservas que se solapan con el rango (no canceladas). Para las que ya
        # tienen check-in (estancia activa) traemos también estancia/factura y
        # el saldo pendiente, para poder cobrar y cerrar desde el calendario.
        cursor.execute(
            """
            SELECT r.id, r.habitacion_id, r.fecha_entrada, r.fecha_salida,
                   r.estado, r.total, h.nombre AS huesped,
                   hab.precio_base AS precio_base,
                   e.id AS estancia_id,
                   e.fecha_checkin AS checkin_real,
                   f.id AS factura_id,
                   COALESCE(f.total, 0) AS factura_total,
                   COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.factura_id = f.id), 0) AS pagado
            FROM reservas r
            JOIN huespedes h ON r.huesped_id = h.id
            JOIN habitaciones hab ON r.habitacion_id = hab.id
            LEFT JOIN estancias e ON e.reserva_id = r.id AND e.estado = 'activa'
            LEFT JOIN facturas f ON f.estancia_id = e.id
            WHERE r.hospedaje_id = ?
            AND r.estado != 'Cancelada'
            AND r.fecha_entrada < ? AND r.fecha_salida > ?
            ORDER BY r.fecha_entrada
            """,
            (hid, hasta, desde),
        )
        reservas = []
        for row in cursor.fetchall():
            d = dict(row)
            # Saldo solo tiene sentido si hay estancia (check-in hecho).
            if d.get("estancia_id"):
                d["saldo"] = round((d["factura_total"] or 0) - (d["pagado"] or 0), 2)
            else:
                d["saldo"] = None
                d["factura_total"] = None
            reservas.append(d)

        # Bloqueos (mantenimiento / uso propio) que se solapan con el rango.
        cursor.execute(
            """
            SELECT id, habitacion_id, fecha_inicio, fecha_fin, motivo
            FROM bloqueos
            WHERE hospedaje_id = ? AND fecha_inicio < ? AND fecha_fin > ?
            ORDER BY fecha_inicio
            """,
            (hid, hasta, desde),
        )
        bloqueos = [dict(r) for r in cursor.fetchall()]

        return {
            "desde": desde,
            "hasta": hasta,
            "habitaciones": habitaciones,
            "reservas": reservas,
            "bloqueos": bloqueos,
        }
    finally:
        conn.close()


@app.post("/api/bloqueos", status_code=201)
def crear_bloqueo(
    datos: BloqueoNuevo,
    actual: dict = Depends(auth.solo_admin),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Bloquea una habitación en un rango de fechas (mantenimiento / uso propio).
    El motor de disponibilidad lo respeta: no se puede reservar sobre un bloqueo.
    Rechaza si ya hay una reserva/estancia vigente en ese rango."""
    try:
        fi = datetime.strptime(datos.fecha_inicio, "%Y-%m-%d")
        ff = datetime.strptime(datos.fecha_fin, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="Fechas con formato YYYY-MM-DD.")
    if ff <= fi:
        raise HTTPException(status_code=422, detail="La fecha fin debe ser posterior a la de inicio.")

    hab = _buscar_habitacion(datos.habitacion_id, hid)
    if not hab:
        raise HTTPException(status_code=404, detail="Habitación no encontrada.")

    # No bloquear si hay una reserva/estancia vigente que se solapa (evita
    # bloquear encima de un huésped). Reusa el motor de disponibilidad.
    if not Reserva.verificar_disponibilidad(datos.habitacion_id, datos.fecha_inicio, datos.fecha_fin):
        raise HTTPException(
            status_code=409,
            detail="Hay una reserva o estancia en ese rango; no se puede bloquear.",
        )

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO bloqueos (hospedaje_id, habitacion_id, fecha_inicio, fecha_fin, motivo, creado_por) VALUES (?, ?, ?, ?, ?, ?)",
            (hid, datos.habitacion_id, datos.fecha_inicio, datos.fecha_fin,
             (datos.motivo or "").strip(), actual.get("id")),
        )
        nuevo_id = cursor.lastrowid
        conn.commit()
    finally:
        conn.close()
    return {"id": nuevo_id, "habitacion_id": datos.habitacion_id,
            "fecha_inicio": datos.fecha_inicio, "fecha_fin": datos.fecha_fin,
            "motivo": (datos.motivo or "").strip()}


@app.delete("/api/bloqueos/{bloqueo_id}")
def eliminar_bloqueo(
    bloqueo_id: int,
    _admin: dict = Depends(auth.solo_admin),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Elimina (libera) un bloqueo de habitación."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT 1 FROM bloqueos WHERE id = ? AND hospedaje_id = ?", (bloqueo_id, hid)
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Bloqueo no encontrado.")
        cursor.execute("DELETE FROM bloqueos WHERE id = ? AND hospedaje_id = ?", (bloqueo_id, hid))
        conn.commit()
    finally:
        conn.close()
    return {"id": bloqueo_id, "eliminado": True}


@app.post("/api/reservas", status_code=201)
def crear_reserva(datos: ReservaNueva, hid: int = Depends(auth.hospedaje_actual)):
    try:
        entrada = datetime.strptime(datos.fecha_entrada, "%Y-%m-%d")
        salida = datetime.strptime(datos.fecha_salida, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=422, detail="Las fechas deben tener formato YYYY-MM-DD."
        )
    if salida <= entrada:
        raise HTTPException(
            status_code=422,
            detail="La fecha de salida debe ser posterior a la de entrada.",
        )
    # La habitación debe pertenecer a este hospedaje (evita reservar una ajena).
    hab = _buscar_habitacion(datos.habitacion_id, hid)
    if not hab:
        raise HTTPException(status_code=404, detail="Habitacion no encontrada.")
    # El huésped también debe ser de este hospedaje.
    if not Huesped.obtener_por_id(datos.huesped_id, hospedaje_id=hid):
        raise HTTPException(status_code=404, detail="Huesped no encontrado.")
    if not Reserva.verificar_disponibilidad(
        datos.habitacion_id, datos.fecha_entrada, datos.fecha_salida
    ):
        raise HTTPException(
            status_code=409, detail="La habitacion no esta disponible en esas fechas."
        )
    reserva = Reserva(
        huesped_id=datos.huesped_id,
        habitacion_id=datos.habitacion_id,
        fecha_entrada=datos.fecha_entrada,
        fecha_salida=datos.fecha_salida,
        notas=datos.notas,
        estado="Confirmada",
        hospedaje_id=hid,
    )
    reserva.guardar()
    return _a_dict(reserva)


@app.put("/api/reservas/{reserva_id}")
def editar_reserva(
    reserva_id: int, datos: ReservaEdit, hid: int = Depends(auth.hospedaje_actual)
):
    """Edita las FECHAS y notas de una reserva (la habitación se cambia con
    'mover'; el huésped no se edita aquí). Solo para reservas Pendiente o
    Confirmada; revalida disponibilidad y recalcula el total."""
    reserva = Reserva.obtener_por_id(reserva_id, hospedaje_id=hid)
    if not reserva:
        raise HTTPException(status_code=404, detail="Reserva no encontrada.")
    if reserva.estado not in ("Pendiente", "Confirmada"):
        raise HTTPException(
            status_code=409,
            detail="Solo se pueden editar reservas pendientes o confirmadas.",
        )
    try:
        entrada = datetime.strptime(datos.fecha_entrada, "%Y-%m-%d")
        salida = datetime.strptime(datos.fecha_salida, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="Las fechas deben tener formato YYYY-MM-DD.")
    if salida <= entrada:
        raise HTTPException(
            status_code=422, detail="La fecha de salida debe ser posterior a la de entrada."
        )
    # Revalidar disponibilidad excluyendo la propia reserva.
    if not Reserva.verificar_disponibilidad(
        reserva.habitacion_id, datos.fecha_entrada, datos.fecha_salida, reserva_id_excluir=reserva_id
    ):
        raise HTTPException(
            status_code=409, detail="La habitación no está disponible en esas fechas."
        )
    # Recalcular el total por las nuevas noches (guardar() solo autocalcula si total=0).
    hab = _buscar_habitacion(reserva.habitacion_id, hid)
    noches = (salida - entrada).days
    reserva.fecha_entrada = datos.fecha_entrada
    reserva.fecha_salida = datos.fecha_salida
    reserva.notas = datos.notas
    if hab:
        reserva.total = round(noches * hab.precio_base, 2)
    reserva.guardar()
    return _a_dict(reserva)


@app.post("/api/reservas/{reserva_id}/cancelar")
def cancelar_reserva(reserva_id: int, hid: int = Depends(auth.hospedaje_actual)):
    reserva = Reserva.obtener_por_id(reserva_id, hospedaje_id=hid)
    if not reserva:
        raise HTTPException(status_code=404, detail="Reserva no encontrada.")
    if reserva.estado in ("Check-in", "Check-out"):
        raise HTTPException(
            status_code=409,
            detail="No se puede cancelar una reserva con check-in; usa el check-out.",
        )
    reserva.cancelar()
    return {"id": reserva_id, "estado": reserva.estado}


@app.post("/api/reservas/{reserva_id}/confirmar")
def confirmar_reserva(reserva_id: int, hid: int = Depends(auth.hospedaje_actual)):
    """Confirma una reserva 'Pendiente' (la que llegó por el motor público).
    Verifica que la habitacion siga disponible antes de confirmar."""
    reserva = Reserva.obtener_por_id(reserva_id, hospedaje_id=hid)
    if not reserva:
        raise HTTPException(status_code=404, detail="Reserva no encontrada.")
    if reserva.estado != "Pendiente":
        raise HTTPException(
            status_code=409, detail="Solo se pueden confirmar reservas pendientes."
        )
    # Revalidar disponibilidad (otra reserva pudo tomar la habitacion mientras).
    if not Reserva.verificar_disponibilidad(
        reserva.habitacion_id,
        reserva.fecha_entrada,
        reserva.fecha_salida,
        reserva_id_excluir=reserva_id,
    ):
        raise HTTPException(
            status_code=409,
            detail="La habitacion ya no esta disponible en esas fechas.",
        )
    reserva.estado = "Confirmada"
    reserva.guardar()
    return {"id": reserva_id, "estado": reserva.estado}


@app.post("/api/reservas/{reserva_id}/mover")
def mover_reserva(
    reserva_id: int, datos: MoverReserva, hid: int = Depends(auth.hospedaje_actual)
):
    """Mueve una reserva a OTRA habitacion (arrastre en el calendario), sin
    cambiar las fechas. Reglas:
      - No se mueven reservas canceladas ni con check-out.
      - La habitacion destino debe existir, no estar en mantenimiento, estar
        LIMPIA (politica del hospedaje) y libre en esas fechas.
      - Si el huesped ya hizo check-in, se mueve tambien su estancia: la
        habitacion vieja queda disponible + sucia y la nueva, ocupada."""
    reserva = Reserva.obtener_por_id(reserva_id, hospedaje_id=hid)
    if not reserva:
        raise HTTPException(status_code=404, detail="Reserva no encontrada.")
    if reserva.estado in ("Cancelada", "Check-out"):
        raise HTTPException(
            status_code=409,
            detail="No se puede mover una reserva cancelada o con check-out.",
        )

    destino = _buscar_habitacion(datos.habitacion_id, hid)
    if not destino:
        raise HTTPException(status_code=404, detail="Habitacion destino no encontrada.")
    if destino.id == reserva.habitacion_id:
        raise HTTPException(status_code=422, detail="La reserva ya esta en esa habitacion.")
    if destino.estado == "mantenimiento":
        raise HTTPException(
            status_code=409, detail=f"La habitacion {destino.numero} esta en mantenimiento."
        )
    if destino.estado_limpieza != "Limpia":
        raise HTTPException(
            status_code=409,
            detail=f"La habitacion {destino.numero} esta sucia; limpiala antes de asignarla.",
        )
    if not Reserva.verificar_disponibilidad(
        destino.id, reserva.fecha_entrada, reserva.fecha_salida, reserva_id_excluir=reserva_id
    ):
        raise HTTPException(
            status_code=409,
            detail=f"La habitacion {destino.numero} no esta libre en esas fechas.",
        )

    origen_id = reserva.habitacion_id
    reserva.habitacion_id = destino.id
    reserva.guardar()

    # Si ya hay check-in, mover la estancia activa y ajustar la ocupacion.
    if reserva.estado == "Check-in":
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE estancias SET habitacion_id = ? WHERE reserva_id = ? AND estado = 'activa' AND hospedaje_id = ?",
                (destino.id, reserva_id, hid),
            )
            conn.commit()
        finally:
            conn.close()
        origen = _buscar_habitacion(origen_id, hid)
        if origen:
            origen.cambiar_estado_ocupacion("disponible")
            origen.cambiar_estado_limpieza("Sucia")
        destino.cambiar_estado_ocupacion("ocupada")

    return {"id": reserva_id, "habitacion_id": destino.id, "estado": reserva.estado}


# --------------------------------------------------------------------------- #
#  Recepcion: check-in, check-out, estancias activas y reservas pendientes
# --------------------------------------------------------------------------- #
@app.get("/api/recepcion/reservas-pendientes")
def reservas_pendientes_checkin(hid: int = Depends(auth.hospedaje_actual)):
    """Reservas confirmadas que aun no tienen un check-in (estancia)."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT r.id, r.fecha_entrada, r.fecha_salida, r.total,
                   h.nombre AS huesped, hab.numero AS habitacion, hab.tipo AS tipo
            FROM reservas r
            JOIN huespedes h    ON r.huesped_id = h.id
            JOIN habitaciones hab ON r.habitacion_id = hab.id
            WHERE r.estado = 'Confirmada'
            AND r.hospedaje_id = ?
            AND NOT EXISTS (SELECT 1 FROM estancias e WHERE e.reserva_id = r.id)
            ORDER BY r.fecha_entrada
            """,
            (hid,),
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


@app.get("/api/recepcion/estancias-activas")
def estancias_activas(hid: int = Depends(auth.hospedaje_actual)):
    """Huespedes actualmente alojados (estancia activa) con su saldo."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT e.id, e.fecha_checkin, e.fecha_checkout_esperado,
                   h.nombre AS huesped, hab.numero AS habitacion, hab.tipo AS tipo,
                   hab.precio_base AS precio_base,
                   r.fecha_entrada AS reserva_entrada, r.fecha_salida AS reserva_salida,
                   f.id AS factura_id,
                   COALESCE(f.total, 0) AS total,
                   COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.factura_id = f.id), 0) AS pagado
            FROM estancias e
            JOIN huespedes h    ON e.huesped_id = h.id
            JOIN habitaciones hab ON e.habitacion_id = hab.id
            LEFT JOIN reservas r ON e.reserva_id = r.id
            LEFT JOIN facturas f ON f.estancia_id = e.id
            WHERE e.estado = 'activa'
            AND e.hospedaje_id = ?
            ORDER BY e.fecha_checkin
            """,
            (hid,),
        )
        filas = []
        for row in cursor.fetchall():
            d = dict(row)
            d["saldo"] = round((d["total"] or 0) - (d["pagado"] or 0), 2)
            filas.append(d)
        return filas
    finally:
        conn.close()


@app.post("/api/recepcion/checkin", status_code=201)
def hacer_checkin(
    datos: CheckinIn,
    actual: dict = Depends(auth.usuario_actual),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Registra el check-in: crea estancia + factura inicial, marca la
    habitacion como ocupada. Reusa la logica de modelos.py."""
    reserva = Reserva.obtener_por_id(datos.reserva_id, hospedaje_id=hid)
    if not reserva:
        raise HTTPException(status_code=404, detail="Reserva no encontrada.")

    hab = next(
        (h for h in Habitacion.obtener_todas(hospedaje_id=hid) if h.id == reserva.habitacion_id), None
    )
    if not hab:
        raise HTTPException(status_code=404, detail="Habitacion no encontrada.")
    if hab.estado == "ocupada":
        raise HTTPException(status_code=409, detail="La habitacion ya esta ocupada.")

    hoy = datetime.now().strftime("%Y-%m-%d")
    # Fecha real de entrada: la indicada por recepción o, si no, hoy.
    fecha_real = datos.fecha_entrada_real.strip() or hoy
    try:
        fe = datetime.strptime(fecha_real, "%Y-%m-%d")
        fs = datetime.strptime(reserva.fecha_salida, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="Fecha de entrada con formato YYYY-MM-DD.")
    if fe >= fs:
        raise HTTPException(
            status_code=422,
            detail="La fecha de entrada debe ser anterior a la fecha de salida de la reserva.",
        )

    # Validacion real de disponibilidad (no solo el flag hab.estado, que puede
    # quedar desincronizado): impide hacer check-in si otra reserva vigente o
    # estancia activa se solapa con [fecha_real, salida). Se excluye la propia
    # reserva para que no se bloquee a si misma.
    if not Reserva.verificar_disponibilidad(
        reserva.habitacion_id, fecha_real, reserva.fecha_salida,
        reserva_id_excluir=reserva.id,
    ):
        raise HTTPException(
            status_code=409,
            detail="La habitación tiene otra reserva o estancia que se solapa en esas fechas.",
        )

    # Cobro por NOCHES REALES (entrada real -> salida esperada) x precio. Así
    # un check-in adelantado/atrasado se cobra correcto, no por lo reservado.
    noches_reales = (fs - fe).days
    total_real = round(noches_reales * hab.precio_base, 2)

    estancia = Estancia(
        reserva_id=reserva.id,
        huesped_id=reserva.huesped_id,
        habitacion_id=reserva.habitacion_id,
        fecha_checkin=fecha_real,
        fecha_checkout_esperado=reserva.fecha_salida,
        estado="activa",
        hospedaje_id=hid,
        usuario_checkin_id=actual.get("id"),
    )
    estancia.guardar()

    factura = Factura(
        estancia_id=estancia.id,
        huesped_id=reserva.huesped_id,
        fecha_emision=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        subtotal=total_real,
        impuestos=0.0,
        total=total_real,
        estado="pendiente",
        pdf_generado=0,
        hospedaje_id=hid,
    )
    factura.guardar()

    hab.cambiar_estado_ocupacion("ocupada")
    reserva.estado = "Check-in"
    reserva.guardar()

    return {
        "estancia_id": estancia.id,
        "factura_id": factura.id,
        "habitacion": hab.numero,
        "fecha_checkin": fecha_real,
        "noches": noches_reales,
        "total": factura.total,
    }


@app.post("/api/recepcion/checkout")
def hacer_checkout(
    datos: CheckoutIn,
    actual: dict = Depends(auth.usuario_actual),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Finaliza una estancia: exige saldo 0, libera y ensucia la habitacion,
    marca la reserva como Check-out y genera la factura PDF."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM estancias WHERE id = ? AND hospedaje_id = ?",
            (datos.estancia_id, hid),
        )
        row = cursor.fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Estancia no encontrada.")

    estancia = Estancia(
        id=row["id"], reserva_id=row["reserva_id"], huesped_id=row["huesped_id"],
        habitacion_id=row["habitacion_id"], fecha_checkin=row["fecha_checkin"],
        fecha_checkout_esperado=row["fecha_checkout_esperado"],
        fecha_checkout_real=row["fecha_checkout_real"], estado=row["estado"],
        hospedaje_id=row["hospedaje_id"] if "hospedaje_id" in row.keys() else hid,
        usuario_checkin_id=row["usuario_checkin_id"] if "usuario_checkin_id" in row.keys() else None,
    )
    estancia.usuario_checkout_id = actual.get("id")

    factura = Factura.obtener_por_estancia(estancia.id)
    if not factura:
        raise HTTPException(status_code=409, detail="La estancia no tiene factura.")

    reserva = Reserva.obtener_por_id(estancia.reserva_id, hospedaje_id=hid)
    hab = next(
        (h for h in Habitacion.obtener_todas(hospedaje_id=hid) if h.id == estancia.habitacion_id), None
    )
    huesped = Huesped.obtener_por_id(estancia.huesped_id, hospedaje_id=hid)

    # Fecha real de salida: la indicada o, si no, hoy. Debe ser posterior a la
    # entrada (al menos 1 noche).
    hoy = datetime.now().strftime("%Y-%m-%d")
    fecha_salida_real = datos.fecha_checkout_real.strip() or hoy
    try:
        fci = datetime.strptime(estancia.fecha_checkin, "%Y-%m-%d")
        fco = datetime.strptime(fecha_salida_real, "%Y-%m-%d")
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="Fecha de salida con formato YYYY-MM-DD.")
    if fco <= fci:
        raise HTTPException(
            status_code=422,
            detail="La fecha de salida debe ser posterior a la de entrada.",
        )

    # COBRO POR ESTADÍA REAL: recalcula la factura por las noches realmente
    # ocupadas (entrada real -> salida real) x precio. Cubre salida adelantada
    # (cobra menos / queda saldo a favor) o estadía extendida (cobra más).
    noches_reales = (fco - fci).days
    if hab:
        nuevo_subtotal = round(noches_reales * hab.precio_base, 2)
        # Preservar el descuento ya aplicado en el cobro (no se pierde al cerrar).
        desc = round(min(factura.descuento or 0, nuevo_subtotal), 2)
        nuevo_total = round(nuevo_subtotal - desc, 2)
        if (abs(nuevo_total - (factura.total or 0)) > 0.001
                or abs(nuevo_subtotal - (factura.subtotal or 0)) > 0.001):
            factura.subtotal = nuevo_subtotal
            factura.descuento = desc
            factura.total = nuevo_total
            factura.guardar()

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COALESCE(SUM(monto), 0) AS pagado FROM pagos WHERE factura_id = ?",
            (factura.id,),
        )
        pagado = cursor.fetchone()["pagado"] or 0
    finally:
        conn.close()
    saldo = round((factura.total or 0) - pagado, 2)
    if saldo > 0:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Con la salida real ({noches_reales} noche(s)) el total es "
                f"S/ {factura.total:.2f}. Falta cobrar S/ {saldo:.2f} antes de cerrar."
            ),
        )

    estancia.finalizar(fecha_salida_real)
    if hab:
        hab.cambiar_estado_ocupacion("disponible")
        hab.cambiar_estado_limpieza("Sucia")
    if reserva:
        reserva.estado = "Check-out"
        reserva.guardar()

    ruta_pdf = None
    try:
        if hab and huesped and reserva:
            ruta_pdf = generar_factura_pdf(factura, estancia, huesped, hab, reserva)
            factura.pdf_generado = 1
            factura.guardar()
    except Exception:
        ruta_pdf = None

    return {
        "estancia_id": estancia.id,
        "estado": "finalizada",
        "noches": noches_reales,
        "total": factura.total,
        "credito": round(max(0, pagado - (factura.total or 0)), 2),  # a favor del huésped
        "pdf": ruta_pdf,
    }


@app.post("/api/recepcion/recalcular")
def recalcular_estancia(datos: CheckoutIn, hid: int = Depends(auth.hospedaje_actual)):
    """Recalcula la factura de una estancia activa por la ESTADÍA REAL
    (entrada real → fecha de salida indicada) × precio de la habitación, y la
    persiste. NO cierra la estancia: sirve para que el COBRO refleje las noches
    reales (entrada antes / salida después) antes de pagar. Devuelve el desglose."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM estancias WHERE id = ? AND hospedaje_id = ? AND estado = 'activa'",
            (datos.estancia_id, hid),
        )
        row = cursor.fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Estancia activa no encontrada.")
    estancia = Estancia(**dict(row))

    factura = Factura.obtener_por_estancia(estancia.id)
    if not factura:
        raise HTTPException(status_code=409, detail="La estancia no tiene factura.")
    hab = next(
        (h for h in Habitacion.obtener_todas(hospedaje_id=hid) if h.id == estancia.habitacion_id), None
    )
    if not hab:
        raise HTTPException(status_code=404, detail="Habitacion no encontrada.")

    hoy = datetime.now().strftime("%Y-%m-%d")
    fecha_real = datos.fecha_checkout_real.strip() or hoy
    try:
        fci = datetime.strptime(estancia.fecha_checkin, "%Y-%m-%d")
        fco = datetime.strptime(fecha_real, "%Y-%m-%d")
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="Fecha de salida con formato YYYY-MM-DD.")
    if fco <= fci:
        raise HTTPException(status_code=422, detail="La fecha de salida debe ser posterior a la de entrada.")

    noches = (fco - fci).days
    subtotal = round(noches * hab.precio_base, 2)

    # Descuento/cortesía: 0 ≤ descuento ≤ subtotal. total = subtotal - descuento.
    descuento = round(max(0.0, datos.descuento or 0), 2)
    if descuento > subtotal:
        raise HTTPException(
            status_code=422,
            detail=f"El descuento (S/ {descuento:.2f}) no puede superar el subtotal (S/ {subtotal:.2f}).",
        )
    nuevo_total = round(subtotal - descuento, 2)

    factura.subtotal = subtotal
    factura.descuento = descuento
    factura.descuento_motivo = (datos.descuento_motivo or "").strip()
    factura.total = nuevo_total
    factura.guardar()

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COALESCE(SUM(monto), 0) AS pagado FROM pagos WHERE factura_id = ?",
            (factura.id,),
        )
        pagado = cursor.fetchone()["pagado"] or 0
    finally:
        conn.close()
    return {
        "estancia_id": estancia.id,
        "factura_id": factura.id,
        "fecha_checkout_real": fecha_real,
        "noches": noches,
        "subtotal": subtotal,
        "descuento": descuento,
        "total": nuevo_total,
        "pagado": round(pagado, 2),
        "saldo": round(nuevo_total - pagado, 2),
    }


# --------------------------------------------------------------------------- #
#  Pagos
# --------------------------------------------------------------------------- #
@app.get("/api/facturas")
def listar_facturas(hid: int = Depends(auth.hospedaje_actual)):
    """Lista todas las facturas con datos del huesped, habitacion y estancia,
    mas el total pagado y el saldo. Es el historial de facturacion."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT f.id, f.fecha_emision, f.total, f.estado,
                   h.nombre AS huesped,
                   hab.numero AS habitacion, hab.tipo AS tipo,
                   e.fecha_checkin, e.fecha_checkout_esperado, e.fecha_checkout_real,
                   e.estado AS estancia_estado,
                   COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.factura_id = f.id), 0) AS pagado,
                   (SELECT c.id FROM comprobantes c WHERE c.factura_id = f.id AND c.estado != 'anulado' LIMIT 1) AS comprobante_id,
                   (SELECT c.numero FROM comprobantes c WHERE c.factura_id = f.id AND c.estado != 'anulado' LIMIT 1) AS comprobante_numero
            FROM facturas f
            JOIN huespedes h    ON f.huesped_id = h.id
            JOIN estancias e    ON f.estancia_id = e.id
            JOIN habitaciones hab ON e.habitacion_id = hab.id
            WHERE f.hospedaje_id = ?
            ORDER BY f.id DESC
            """,
            (hid,),
        )
        filas = []
        for row in cursor.fetchall():
            d = dict(row)
            d["saldo"] = round((d["total"] or 0) - (d["pagado"] or 0), 2)
            filas.append(d)
        return filas
    finally:
        conn.close()


@app.get("/api/facturas/{factura_id}/pagos")
def listar_pagos(factura_id: int, hid: int = Depends(auth.hospedaje_actual)):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        # Verificar que la factura sea de este hospedaje antes de devolver sus pagos.
        cursor.execute(
            "SELECT 1 FROM facturas WHERE id = ? AND hospedaje_id = ?", (factura_id, hid)
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Factura no encontrada.")
        cursor.execute(
            """
            SELECT p.id, p.monto, p.metodo, p.fecha, p.referencia,
                   u.nombre AS usuario_nombre
            FROM pagos p
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            WHERE p.factura_id = ?
            ORDER BY p.fecha
            """,
            (factura_id,),
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


@app.get("/api/facturas/{factura_id}/pdf")
def descargar_factura_pdf(factura_id: int, hid: int = Depends(auth.hospedaje_actual)):
    """Genera (o regenera) el PDF de una factura y lo devuelve como descarga.
    Reutiliza utils.generar_factura_pdf reconstruyendo los objetos necesarios."""
    # 1. Cargar la factura (solo si es de este hospedaje).
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM facturas WHERE id = ? AND hospedaje_id = ?", (factura_id, hid)
        )
        f_row = cursor.fetchone()
    finally:
        conn.close()
    if not f_row:
        raise HTTPException(status_code=404, detail="Factura no encontrada.")
    factura = Factura(**dict(f_row))

    # 2. Cargar la estancia asociada (el PDF necesita check-in/out).
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM estancias WHERE id = ?", (factura.estancia_id,))
        e_row = cursor.fetchone()
    finally:
        conn.close()
    if not e_row:
        raise HTTPException(status_code=409, detail="La factura no tiene estancia asociada.")
    estancia = Estancia(**dict(e_row))

    # 3. Huesped, habitacion y reserva.
    huesped = Huesped.obtener_por_id(factura.huesped_id, hospedaje_id=hid)
    habitacion = next(
        (h for h in Habitacion.obtener_todas(solo_activas=False, hospedaje_id=hid) if h.id == estancia.habitacion_id),
        None,
    )
    reserva = Reserva.obtener_por_id(estancia.reserva_id, hospedaje_id=hid)
    if not huesped or not habitacion or not reserva:
        raise HTTPException(
            status_code=409, detail="Faltan datos relacionados para generar la factura."
        )

    # 4. Generar el PDF (reutiliza la logica existente) y devolverlo.
    try:
        ruta = generar_factura_pdf(factura, estancia, huesped, habitacion, reserva)
    except Exception:
        raise HTTPException(status_code=500, detail="No se pudo generar el PDF.")
    if not ruta or not os.path.exists(ruta):
        raise HTTPException(status_code=500, detail="El archivo PDF no se encontro.")

    nombre = f"factura_{factura.id}_{huesped.nombre.replace(' ', '_')}.pdf"
    return FileResponse(ruta, media_type="application/pdf", filename=nombre)


# --------------------------------------------------------------------------- #
#  Facturación electrónica (SUNAT) — Fase 1: boletas en sandbox
# --------------------------------------------------------------------------- #
@app.get("/api/sunat/config")
def sunat_obtener_config(
    _admin: dict = Depends(auth.solo_admin), hid: int = Depends(auth.hospedaje_actual)
):
    """Config SUNAT del hospedaje (solo admin)."""
    return sunat.obtener_config(hid)


@app.put("/api/sunat/config")
def sunat_guardar_config(
    datos: SunatConfigDatos,
    _admin: dict = Depends(auth.solo_admin),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Guarda la config SUNAT (solo admin). Valida lo mínimo si se activa."""
    if datos.activo and (not datos.ruc.strip() or not datos.razon_social.strip()):
        raise HTTPException(
            status_code=422,
            detail="Para activar la facturación necesitas RUC y razón social.",
        )
    if datos.ruc.strip() and (not datos.ruc.strip().isdigit() or len(datos.ruc.strip()) != 11):
        raise HTTPException(status_code=422, detail="El RUC debe tener 11 dígitos.")
    return sunat.guardar_config(hid, datos.dict())


@app.post("/api/facturas/{factura_id}/emitir", status_code=201)
def sunat_emitir_boleta(
    factura_id: int,
    _admin: dict = Depends(auth.solo_admin),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Emite la BOLETA de una factura ya pagada (modo sandbox)."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT f.id, f.total, f.huesped_id,
                   COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.factura_id = f.id), 0) AS pagado,
                   h.nombre AS huesped_nombre, h.documento AS huesped_doc,
                   hab.numero AS habitacion, hab.tipo AS tipo,
                   e.fecha_checkin, e.fecha_checkout_real, e.fecha_checkout_esperado
            FROM facturas f
            JOIN huespedes h ON f.huesped_id = h.id
            LEFT JOIN estancias e ON f.estancia_id = e.id
            LEFT JOIN habitaciones hab ON e.habitacion_id = hab.id
            WHERE f.id = ? AND f.hospedaje_id = ?
            """,
            (factura_id, hid),
        )
        row = cursor.fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Factura no encontrada.")
    f = dict(row)
    saldo = round((f["total"] or 0) - (f["pagado"] or 0), 2)
    if saldo > 0:
        raise HTTPException(
            status_code=409,
            detail=f"No se puede emitir: la factura tiene un saldo de S/ {saldo:.2f}.",
        )

    # Descripción del concepto (noches de la estadía).
    salida = f.get("fecha_checkout_real") or f.get("fecha_checkout_esperado")
    noches = ""
    if f.get("fecha_checkin") and salida:
        try:
            n = (datetime.strptime(salida, "%Y-%m-%d") - datetime.strptime(f["fecha_checkin"], "%Y-%m-%d")).days
            noches = f" - {n} noche(s)"
        except (ValueError, TypeError):
            noches = ""
    hab = f.get("habitacion")
    descripcion = f"Servicio de hospedaje" + (f" - Hab. {hab}" if hab else "") + noches

    try:
        comp = sunat.emitir_boleta(
            hid,
            {"id": f["id"], "total": f["total"]},
            {"nombre": f["huesped_nombre"], "documento": f.get("huesped_doc")},
            descripcion,
        )
    except sunat.SunatError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return comp


@app.get("/api/comprobantes")
def sunat_listar_comprobantes(hid: int = Depends(auth.hospedaje_actual)):
    """Lista los comprobantes electrónicos emitidos por el hospedaje."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, factura_id, tipo, numero, fecha_emision, cliente_nombre,
                   cliente_tipo_doc, cliente_num_doc, total, estado, modo
            FROM comprobantes
            WHERE hospedaje_id = ?
            ORDER BY id DESC
            """,
            (hid,),
        )
        return [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()


@app.get("/api/comprobantes/{comprobante_id}/pdf")
def sunat_comprobante_pdf(comprobante_id: int, hid: int = Depends(auth.hospedaje_actual)):
    """Devuelve la representación impresa (PDF) de un comprobante."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT numero, pdf_path FROM comprobantes WHERE id = ? AND hospedaje_id = ?",
            (comprobante_id, hid),
        )
        row = cursor.fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Comprobante no encontrado.")
    ruta = row["pdf_path"]
    if not ruta or not os.path.exists(ruta):
        raise HTTPException(status_code=404, detail="El PDF del comprobante no se encontró.")
    return FileResponse(ruta, media_type="application/pdf", filename=f"{row['numero']}.pdf")


@app.post("/api/pagos", status_code=201)
def registrar_pago(
    datos: PagoNuevo,
    actual: dict = Depends(auth.usuario_actual),
    hid: int = Depends(auth.hospedaje_actual),
):
    if datos.monto <= 0:
        raise HTTPException(status_code=422, detail="El monto debe ser mayor a cero.")

    factura = None
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM facturas WHERE id = ? AND hospedaje_id = ?",
            (datos.factura_id, hid),
        )
        row = cursor.fetchone()
        if row:
            factura = Factura(**dict(row))
    finally:
        conn.close()
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada.")

    pago = Pago(
        factura_id=datos.factura_id,
        monto=datos.monto,
        metodo=datos.metodo,
        fecha=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        referencia=datos.referencia,
        hospedaje_id=hid,
        usuario_id=actual.get("id"),
    )
    pago.guardar()

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COALESCE(SUM(monto), 0) AS pagado FROM pagos WHERE factura_id = ?",
            (datos.factura_id,),
        )
        pagado = cursor.fetchone()["pagado"] or 0
    finally:
        conn.close()
    saldo = round(factura.total - pagado, 2)
    nuevo_estado = "pagada" if saldo <= 0 else "pendiente"
    if factura.estado != nuevo_estado:
        factura.estado = nuevo_estado
        factura.guardar()

    return {
        "pago_id": pago.id,
        "pagado": round(pagado, 2),
        "saldo": saldo,
        "estado_factura": nuevo_estado,
    }


@app.get("/api/recepcion/caja")
def caja_del_dia(fecha: str = "", hid: int = Depends(auth.hospedaje_actual)):
    """Arqueo del día: pagos cobrados en una fecha, agrupados por método + total.
    Lo usa recepción para cuadrar el efectivo del cajón. Visible a admin y
    recepción (es el dinero que recepción maneja, no el revenue del negocio)."""
    dia = (fecha or "").strip() or datetime.now().strftime("%Y-%m-%d")
    try:
        datetime.strptime(dia, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="Fecha con formato YYYY-MM-DD.")
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT metodo, COALESCE(SUM(monto), 0) AS total, COUNT(*) AS n
            FROM pagos
            WHERE hospedaje_id = ? AND substr(fecha, 1, 10) = ?
            GROUP BY metodo
            ORDER BY total DESC
            """,
            (hid, dia),
        )
        por_metodo = [
            {"metodo": r["metodo"] or "otro", "total": round(r["total"] or 0, 2), "n": r["n"]}
            for r in cursor.fetchall()
        ]
        # Detalle de los pagos del día (incluye quién los registró = auditoría).
        cursor.execute(
            """
            SELECT p.fecha, p.monto, p.metodo, p.referencia,
                   u.nombre AS usuario_nombre, h.nombre AS huesped
            FROM pagos p
            LEFT JOIN usuarios u  ON p.usuario_id = u.id
            LEFT JOIN facturas f  ON p.factura_id = f.id
            LEFT JOIN huespedes h ON f.huesped_id = h.id
            WHERE p.hospedaje_id = ? AND substr(p.fecha, 1, 10) = ?
            ORDER BY p.fecha DESC
            """,
            (hid, dia),
        )
        detalle = [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()
    total = round(sum(m["total"] for m in por_metodo), 2)
    num_pagos = sum(m["n"] for m in por_metodo)
    return {
        "fecha": dia,
        "total": total,
        "num_pagos": num_pagos,
        "por_metodo": por_metodo,
        "detalle": detalle,
    }


# --------------------------------------------------------------------------- #
#  Dashboard: resumen para las tarjetas de estadisticas
# --------------------------------------------------------------------------- #
@app.get("/api/dashboard/resumen")
def dashboard_resumen(
    actual: dict = Depends(auth.usuario_actual),
    hid: int = Depends(auth.hospedaje_actual),
):
    # Ocupacion DERIVADA del calendario (no del flag manual): refleja la
    # realidad de hoy. disponibles = habitaciones realmente libres hoy.
    ocup = _ocupacion_hoy(hid)
    total_habitaciones = len(ocup)
    ocupadas = sum(1 for v in ocup.values() if v["estado"] == "ocupada")
    reservadas = sum(1 for v in ocup.values() if v["estado"] == "reservada")
    disponibles = sum(1 for v in ocup.values() if v["estado"] == "libre")
    mantenimiento = sum(1 for v in ocup.values() if v["estado"] == "mantenimiento")
    salidas_vencidas = sum(1 for v in ocup.values() if v["salida_vencida"])
    # % de ocupacion = habitaciones comprometidas hoy (ocupadas + reservadas).
    comprometidas = ocupadas + reservadas
    ocupacion_pct = round((comprometidas / total_habitaciones) * 100) if total_habitaciones else 0

    conn = get_connection()
    try:
        cursor = conn.cursor()

        cursor.execute(
            "SELECT COUNT(*) AS n FROM estancias WHERE estado = 'activa' AND hospedaje_id = ?",
            (hid,),
        )
        estancias_activas = cursor.fetchone()["n"]

        cursor.execute(
            """
            SELECT COUNT(*) AS n FROM reservas r
            WHERE r.estado = 'Confirmada'
            AND r.hospedaje_id = ?
            AND NOT EXISTS (SELECT 1 FROM estancias e WHERE e.reserva_id = r.id)
            """,
            (hid,),
        )
        checkins_pendientes = cursor.fetchone()["n"]

        mes_actual = datetime.now().strftime("%Y-%m")
        cursor.execute(
            "SELECT COALESCE(SUM(monto), 0) AS total FROM pagos WHERE substr(fecha, 1, 7) = ? AND hospedaje_id = ?",
            (mes_actual, hid),
        )
        ingresos_mes = cursor.fetchone()["total"]

        return {
            "total_habitaciones": total_habitaciones,
            "ocupadas": ocupadas,
            "reservadas": reservadas,
            "disponibles": disponibles,
            "mantenimiento": mantenimiento,
            "salidas_vencidas": salidas_vencidas,
            "ocupacion_pct": ocupacion_pct,
            "estancias_activas": estancias_activas,
            "checkins_pendientes": checkins_pendientes,
            # Ingresos solo para admin (recepción no ve revenue del negocio).
            "ingresos_mes": (round(ingresos_mes, 2) if actual.get("rol") in ("admin", "superadmin") else None),
        }
    finally:
        conn.close()


@app.get("/api/dashboard/agenda")
def dashboard_agenda(hid: int = Depends(auth.hospedaje_actual)):
    """Agenda del día: quién LLEGA hoy (reservas confirmadas sin check-in con
    entrada hoy) y quién SALE hoy (estancias activas cuyo checkout esperado es
    hoy), con su saldo. Es la vista que mira recepción cada mañana."""
    hoy = datetime.now().strftime("%Y-%m-%d")
    conn = get_connection()
    try:
        cursor = conn.cursor()

        # Llegadas de hoy: confirmadas, con entrada = hoy y aún sin estancia.
        cursor.execute(
            """
            SELECT r.id AS reserva_id, h.nombre AS huesped,
                   hab.numero AS habitacion, hab.tipo AS tipo,
                   r.fecha_entrada, r.fecha_salida, r.total
            FROM reservas r
            JOIN huespedes h     ON r.huesped_id = h.id
            JOIN habitaciones hab ON r.habitacion_id = hab.id
            WHERE r.estado = 'Confirmada'
            AND r.hospedaje_id = ?
            AND r.fecha_entrada = ?
            AND NOT EXISTS (SELECT 1 FROM estancias e WHERE e.reserva_id = r.id)
            ORDER BY hab.numero
            """,
            (hid, hoy),
        )
        llegadas = [dict(row) for row in cursor.fetchall()]

        # Salidas de hoy: estancias activas cuyo checkout esperado es hoy.
        cursor.execute(
            """
            SELECT e.id AS estancia_id, h.nombre AS huesped,
                   hab.numero AS habitacion, hab.tipo AS tipo,
                   COALESCE(f.total, 0) AS total,
                   COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.factura_id = f.id), 0) AS pagado
            FROM estancias e
            JOIN huespedes h     ON e.huesped_id = h.id
            JOIN habitaciones hab ON e.habitacion_id = hab.id
            LEFT JOIN facturas f ON f.estancia_id = e.id
            WHERE e.estado = 'activa'
            AND e.hospedaje_id = ?
            AND e.fecha_checkout_esperado = ?
            ORDER BY hab.numero
            """,
            (hid, hoy),
        )
        salidas = []
        for row in cursor.fetchall():
            d = dict(row)
            d["saldo"] = round((d["total"] or 0) - (d["pagado"] or 0), 2)
            salidas.append(d)

        return {"fecha": hoy, "llegadas_hoy": llegadas, "salidas_hoy": salidas}
    finally:
        conn.close()


@app.get("/api/dashboard/overview")
def dashboard_overview(
    actual: dict = Depends(auth.usuario_actual),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Datos del dashboard visual (estilo panel hotelero): KPIs con tendencia y
    mini-series, disponibilidad, gráfico de reservas por día, origen de
    reservas por mes (online/offline), visitas al link público, tabla de
    reservas recientes y lista de huéspedes. Una sola llamada para toda la
    parte 'nueva' del dashboard (las secciones conservadas usan sus endpoints).

    Significado de cada métrica (importante para no confundir):
      - new_booking: reservas por FECHA DE RESERVA (creado_en) del mes.
      - revenue: pagos cobrados (por fecha de pago) del mes.
      - checkout: estancias cerradas (por fecha_checkout_real) del mes.
      - reservation_daily: reservas por FECHA DE ENTRADA del mes (booked/cancel).
      - booking_source: reservas por mes de reserva, online(publico)/offline(manual).
    """
    # Revenue solo para admin: recepción NO debe ver ingresos del negocio.
    es_admin = actual.get("rol") in ("admin", "superadmin")
    hoy_dt = datetime.now()
    hoy = hoy_dt.strftime("%Y-%m-%d")
    mes_actual = hoy_dt.strftime("%Y-%m")
    primer_dia_mes = hoy_dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    mes_anterior = (primer_dia_mes - timedelta(days=1)).strftime("%Y-%m")
    num_dias_mes = calendar.monthrange(hoy_dt.year, hoy_dt.month)[1]

    def _trend(actual, anterior):
        """Variación % vs el periodo anterior (evita división por cero)."""
        if not anterior:
            return 100.0 if actual else 0.0
        return round((actual - anterior) / anterior * 100, 1)

    conn = get_connection()
    try:
        cursor = conn.cursor()

        # ---------- KPI: New Booking (reservas por creado_en) ----------
        cursor.execute(
            "SELECT COUNT(*) AS n FROM reservas WHERE hospedaje_id = ? AND substr(creado_en,1,7) = ?",
            (hid, mes_actual),
        )
        nb_actual = cursor.fetchone()["n"] or 0
        cursor.execute(
            "SELECT COUNT(*) AS n FROM reservas WHERE hospedaje_id = ? AND substr(creado_en,1,7) = ?",
            (hid, mes_anterior),
        )
        nb_anterior = cursor.fetchone()["n"] or 0
        # Sparkline: nuevas reservas por día, últimos 14 días.
        cursor.execute(
            """
            SELECT substr(creado_en,1,10) AS dia, COUNT(*) AS n
            FROM reservas WHERE hospedaje_id = ? AND substr(creado_en,1,10) >= ?
            GROUP BY substr(creado_en,1,10)
            """,
            (hid, (hoy_dt - timedelta(days=13)).strftime("%Y-%m-%d")),
        )
        nb_por_dia = {r["dia"]: r["n"] for r in cursor.fetchall()}
        nb_spark = [
            {"dia": (hoy_dt - timedelta(days=13 - i)).strftime("%Y-%m-%d"),
             "n": nb_por_dia.get((hoy_dt - timedelta(days=13 - i)).strftime("%Y-%m-%d"), 0)}
            for i in range(14)
        ]

        # ---------- KPI: Revenue (pagos del mes) ----------
        cursor.execute(
            "SELECT COALESCE(SUM(monto),0) AS t FROM pagos WHERE hospedaje_id = ? AND substr(fecha,1,7) = ?",
            (hid, mes_actual),
        )
        rev_actual = round(cursor.fetchone()["t"] or 0, 2)
        cursor.execute(
            "SELECT COALESCE(SUM(monto),0) AS t FROM pagos WHERE hospedaje_id = ? AND substr(fecha,1,7) = ?",
            (hid, mes_anterior),
        )
        rev_anterior = round(cursor.fetchone()["t"] or 0, 2)
        cursor.execute(
            """
            SELECT substr(fecha,1,10) AS dia, COALESCE(SUM(monto),0) AS t
            FROM pagos WHERE hospedaje_id = ? AND substr(fecha,1,7) = ?
            GROUP BY substr(fecha,1,10)
            """,
            (hid, mes_actual),
        )
        rev_por_dia = {r["dia"]: round(r["t"] or 0, 2) for r in cursor.fetchall()}
        rev_linea = [
            {"dia": d, "total": rev_por_dia.get(f"{mes_actual}-{d:02d}", 0)}
            for d in range(1, num_dias_mes + 1)
        ]

        # ---------- KPI: Checkout (estancias cerradas del mes) ----------
        cursor.execute(
            "SELECT COUNT(*) AS n FROM estancias WHERE hospedaje_id = ? AND fecha_checkout_real IS NOT NULL AND substr(fecha_checkout_real,1,7) = ?",
            (hid, mes_actual),
        )
        co_actual = cursor.fetchone()["n"] or 0
        cursor.execute(
            "SELECT COUNT(*) AS n FROM estancias WHERE hospedaje_id = ? AND fecha_checkout_real IS NOT NULL AND substr(fecha_checkout_real,1,7) = ?",
            (hid, mes_anterior),
        )
        co_anterior = cursor.fetchone()["n"] or 0

        # ---------- Disponibilidad (donut + Room Availability) ----------
        ocup = _ocupacion_hoy(hid)
        cursor.execute(
            "SELECT id, estado_limpieza FROM habitaciones WHERE activa = 1 AND hospedaje_id = ?",
            (hid,),
        )
        limpieza = {r["id"]: (r["estado_limpieza"] or "Limpia") for r in cursor.fetchall()}
        occupied = reserved = available = not_ready = 0
        for hab_id, v in ocup.items():
            est = v["estado"]
            if est == "ocupada":
                occupied += 1
            elif est == "reservada":
                reserved += 1
            elif est == "mantenimiento":
                not_ready += 1
            else:  # libre: lista solo si está limpia, si no "no lista"
                if limpieza.get(hab_id, "Limpia") == "Limpia":
                    available += 1
                else:
                    not_ready += 1
        total_hab = len(ocup)

        # ---------- Reservation diaria (booked vs cancelled por fecha_entrada) ----------
        cursor.execute(
            """
            SELECT substr(fecha_entrada,9,2) AS dd,
                   SUM(CASE WHEN estado = 'Cancelada' THEN 0 ELSE 1 END) AS booked,
                   SUM(CASE WHEN estado = 'Cancelada' THEN 1 ELSE 0 END) AS cancelled
            FROM reservas
            WHERE hospedaje_id = ? AND substr(fecha_entrada,1,7) = ?
            GROUP BY substr(fecha_entrada,9,2)
            """,
            (hid, mes_actual),
        )
        res_por_dia = {int(r["dd"]): (r["booked"] or 0, r["cancelled"] or 0) for r in cursor.fetchall()}
        reservation_daily = [
            {"dia": d, "booked": res_por_dia.get(d, (0, 0))[0], "cancelled": res_por_dia.get(d, (0, 0))[1]}
            for d in range(1, num_dias_mes + 1)
        ]

        # ---------- Booking Source (online/offline por mes, últimos 6) ----------
        meses = []
        cur_m = primer_dia_mes
        for _ in range(6):
            meses.append(cur_m.strftime("%Y-%m"))
            cur_m = (cur_m - timedelta(days=1)).replace(day=1)
        meses = list(reversed(meses))
        cursor.execute(
            """
            SELECT substr(creado_en,1,7) AS mes, origen, COUNT(*) AS n
            FROM reservas
            WHERE hospedaje_id = ? AND estado != 'Cancelada' AND substr(creado_en,1,7) >= ?
            GROUP BY substr(creado_en,1,7), origen
            """,
            (hid, meses[0]),
        )
        src = {}
        for r in cursor.fetchall():
            src.setdefault(r["mes"], {"online": 0, "offline": 0})
            if (r["origen"] or "manual") == "publico":
                src[r["mes"]]["online"] += r["n"]
            else:
                src[r["mes"]]["offline"] += r["n"]
        booking_source = [
            {"mes": m, "online": src.get(m, {}).get("online", 0), "offline": src.get(m, {}).get("offline", 0)}
            for m in meses
        ]

        # ---------- Visitas al link público (últimos 7 días) ----------
        cursor.execute(
            """
            SELECT substr(creado_en,1,10) AS dia, COUNT(*) AS n
            FROM visitas WHERE hospedaje_id = ? AND substr(creado_en,1,10) >= ?
            GROUP BY substr(creado_en,1,10)
            """,
            (hid, (hoy_dt - timedelta(days=6)).strftime("%Y-%m-%d")),
        )
        vis_por_dia = {r["dia"]: r["n"] for r in cursor.fetchall()}
        visitas = [
            {"fecha": (hoy_dt - timedelta(days=6 - i)).strftime("%Y-%m-%d"),
             "n": vis_por_dia.get((hoy_dt - timedelta(days=6 - i)).strftime("%Y-%m-%d"), 0)}
            for i in range(7)
        ]

        # ---------- Current bookings (tabla, recientes por creado_en) ----------
        cursor.execute(
            """
            SELECT r.id AS reserva_id, hab.numero AS room, h.nombre AS name,
                   h.telefono AS mobile, r.fecha_entrada AS checkin,
                   r.fecha_salida AS checkout, r.estado AS estado
            FROM reservas r
            JOIN huespedes h     ON r.huesped_id = h.id
            JOIN habitaciones hab ON r.habitacion_id = hab.id
            WHERE r.hospedaje_id = ?
            ORDER BY r.creado_en DESC, r.id DESC
            LIMIT 8
            """,
            (hid,),
        )
        current_bookings = [dict(r) for r in cursor.fetchall()]

        # ---------- Guest list (huéspedes recientes por fecha de entrada) ----------
        cursor.execute(
            """
            SELECT h.nombre AS nombre, hab.numero AS room, hab.tipo AS tipo,
                   r.fecha_entrada AS fecha
            FROM reservas r
            JOIN huespedes h     ON r.huesped_id = h.id
            JOIN habitaciones hab ON r.habitacion_id = hab.id
            WHERE r.hospedaje_id = ? AND r.estado != 'Cancelada'
            ORDER BY r.fecha_entrada DESC, r.id DESC
            LIMIT 6
            """,
            (hid,),
        )
        guest_list = [dict(r) for r in cursor.fetchall()]

        # ---------- Reservas PENDIENTES por confirmar (sobre todo del link público) ----------
        cursor.execute(
            """
            SELECT r.id AS reserva_id, h.nombre AS huesped, h.telefono AS telefono,
                   hab.numero AS room, hab.tipo AS tipo,
                   r.fecha_entrada AS checkin, r.fecha_salida AS checkout,
                   r.total AS total, r.origen AS origen
            FROM reservas r
            JOIN huespedes h     ON r.huesped_id = h.id
            JOIN habitaciones hab ON r.habitacion_id = hab.id
            WHERE r.hospedaje_id = ? AND r.estado = 'Pendiente'
            ORDER BY r.creado_en DESC, r.id DESC
            """,
            (hid,),
        )
        pendientes = [dict(r) for r in cursor.fetchall()]

        return {
            "kpis": {
                "new_booking": {"valor": nb_actual, "trend_pct": _trend(nb_actual, nb_anterior), "spark": nb_spark},
                "available_rooms": {
                    "valor": available,
                    "donut": {"ocupadas": occupied, "reservadas": reserved, "disponibles": available, "not_ready": not_ready},
                    "total": total_hab,
                },
                "revenue": (
                    {"valor": rev_actual, "trend_pct": _trend(rev_actual, rev_anterior), "linea": rev_linea}
                    if es_admin
                    else None
                ),
                "checkout": {"valor": co_actual, "trend_pct": _trend(co_actual, co_anterior)},
            },
            "reservation_daily": reservation_daily,
            "booking_source": booking_source,
            "visitas": visitas,
            "current_bookings": current_bookings,
            "guest_list": guest_list,
            "pendientes_por_confirmar": pendientes,
        }
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
#  Exportación a CSV (el dueño puede sacar sus datos; "no ser rehén")
# --------------------------------------------------------------------------- #
def _csv_response(nombre_archivo, encabezados, filas):
    """Arma un CSV descargable (UTF-8 con BOM para que Excel abra bien las tildes)."""
    buffer = io.StringIO()
    buffer.write("﻿")  # BOM para Excel
    escritor = csv.writer(buffer)
    escritor.writerow(encabezados)
    for fila in filas:
        escritor.writerow(fila)
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{nombre_archivo}"'},
    )


@app.get("/api/export/reservas.csv")
def export_reservas_csv(
    _admin: dict = Depends(auth.solo_admin), hid: int = Depends(auth.hospedaje_actual)
):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT r.id, h.nombre AS huesped, h.telefono, hab.numero AS habitacion,
                   hab.tipo, r.fecha_entrada, r.fecha_salida, r.estado, r.total,
                   r.origen, r.creado_en
            FROM reservas r
            JOIN huespedes h     ON r.huesped_id = h.id
            JOIN habitaciones hab ON r.habitacion_id = hab.id
            WHERE r.hospedaje_id = ?
            ORDER BY r.fecha_entrada DESC
            """,
            (hid,),
        )
        filas = [
            [r["id"], r["huesped"], r["telefono"], r["habitacion"], r["tipo"],
             r["fecha_entrada"], r["fecha_salida"], r["estado"], r["total"],
             r["origen"], r["creado_en"]]
            for r in cursor.fetchall()
        ]
    finally:
        conn.close()
    encab = ["ID", "Huésped", "Teléfono", "Habitación", "Tipo", "Entrada",
             "Salida", "Estado", "Total", "Origen", "Creada"]
    return _csv_response("reservas.csv", encab, filas)


@app.get("/api/export/huespedes.csv")
def export_huespedes_csv(
    _admin: dict = Depends(auth.solo_admin), hid: int = Depends(auth.hospedaje_actual)
):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT nombre, email, telefono, documento, direccion FROM huespedes WHERE hospedaje_id = ? ORDER BY nombre",
            (hid,),
        )
        filas = [
            [r["nombre"], r["email"], r["telefono"], r["documento"], r["direccion"]]
            for r in cursor.fetchall()
        ]
    finally:
        conn.close()
    return _csv_response(
        "huespedes.csv", ["Nombre", "Email", "Teléfono", "Documento", "Dirección"], filas
    )


@app.get("/api/export/pagos.csv")
def export_pagos_csv(
    _admin: dict = Depends(auth.solo_admin), hid: int = Depends(auth.hospedaje_actual)
):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT p.id, p.fecha, p.factura_id, p.monto, p.metodo, p.referencia,
                   h.nombre AS huesped
            FROM pagos p
            LEFT JOIN facturas f  ON p.factura_id = f.id
            LEFT JOIN huespedes h ON f.huesped_id = h.id
            WHERE p.hospedaje_id = ?
            ORDER BY p.fecha DESC
            """,
            (hid,),
        )
        filas = [
            [r["id"], r["fecha"], r["factura_id"], r["huesped"], r["monto"],
             r["metodo"], r["referencia"]]
            for r in cursor.fetchall()
        ]
    finally:
        conn.close()
    encab = ["ID", "Fecha", "Factura", "Huésped", "Monto", "Método", "Referencia"]
    return _csv_response("pagos.csv", encab, filas)


# --------------------------------------------------------------------------- #
#  Reportes: ocupacion diaria por mes.
#  Reusa la MISMA logica de calculo que views/reportes.py (la app de escritorio):
#  por cada dia del mes cuenta cuantas habitaciones estan ocupadas por una
#  reserva no cancelada, dividido entre el total de habitaciones activas.
#  La noche se cuenta de entrada hasta salida-1 (el dia de salida no ocupa).
# --------------------------------------------------------------------------- #
@app.get("/api/reportes/ocupacion")
def reporte_ocupacion(
    anio: int,
    mes: int,
    _admin: dict = Depends(auth.solo_admin),
    hid: int = Depends(auth.hospedaje_actual),
):
    if mes < 1 or mes > 12:
        raise HTTPException(status_code=422, detail="El mes debe estar entre 1 y 12.")

    num_dias = calendar.monthrange(anio, mes)[1]
    total_habitaciones = len(Habitacion.obtener_todas(solo_activas=True, hospedaje_id=hid))

    conn = get_connection()
    try:
        cursor = conn.cursor()
        primer_dia = f"{anio}-{mes:02d}-01"
        ultimo_dia = f"{anio}-{mes:02d}-{num_dias:02d}"
        cursor.execute(
            """
            SELECT habitacion_id, fecha_entrada, fecha_salida
            FROM reservas
            WHERE estado != 'Cancelada'
            AND hospedaje_id = ?
            AND fecha_entrada <= ? AND fecha_salida >= ?
            """,
            (hid, ultimo_dia, primer_dia),
        )
        reservas = cursor.fetchall()
    finally:
        conn.close()

    # Ocupacion por dia como CONJUNTO de habitaciones (deduplicado), no contador.
    # Una habitacion cuenta como maximo 1 por dia aunque se hayan revendido sus
    # noches (estancia con Check-out + nueva reserva sobre las mismas fechas),
    # asi la ocupacion nunca puede superar el 100%.
    habs_por_dia = [set() for _ in range(num_dias)]
    for row in reservas:
        entrada = datetime.strptime(row["fecha_entrada"], "%Y-%m-%d")
        salida = datetime.strptime(row["fecha_salida"], "%Y-%m-%d")
        dia = max(entrada, datetime(anio, mes, 1))
        fin_mes = datetime(anio, mes, num_dias)
        while dia <= min(salida - timedelta(days=1), fin_mes):
            habs_por_dia[dia.day - 1].add(row["habitacion_id"])
            dia += timedelta(days=1)

    dias = []
    suma_pct = 0.0
    for i, habs in enumerate(habs_por_dia):
        ocupadas = len(habs)
        pct = round((ocupadas / total_habitaciones) * 100, 1) if total_habitaciones else 0
        suma_pct += pct
        dias.append({"dia": i + 1, "ocupadas": ocupadas, "porcentaje": pct})

    promedio = round(suma_pct / num_dias, 1) if num_dias else 0

    return {
        "anio": anio,
        "mes": mes,
        "total_habitaciones": total_habitaciones,
        "promedio_ocupacion": promedio,
        "dias": dias,
    }


@app.get("/api/reportes/financiero")
def reporte_financiero(
    anio: int,
    mes: int,
    _admin: dict = Depends(auth.solo_admin),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Reporte financiero del mes (solo admin): ingresos cobrados, desglose por
    método de pago y ranking de habitaciones por ingresos. Filtrado por
    hospedaje."""
    if mes < 1 or mes > 12:
        raise HTTPException(status_code=422, detail="El mes debe estar entre 1 y 12.")

    periodo = f"{anio}-{mes:02d}"  # para comparar con substr(fecha, 1, 7)
    conn = get_connection()
    try:
        cursor = conn.cursor()

        # --- Ingresos cobrados en el mes (por fecha de pago) y nº de pagos. ---
        cursor.execute(
            """
            SELECT COALESCE(SUM(monto), 0) AS cobrado, COUNT(*) AS num_pagos
            FROM pagos
            WHERE hospedaje_id = ? AND substr(fecha, 1, 7) = ?
            """,
            (hid, periodo),
        )
        fila = cursor.fetchone()
        cobrado = round(fila["cobrado"] or 0, 2)
        num_pagos = fila["num_pagos"] or 0

        # --- Desglose por método de pago. ---
        cursor.execute(
            """
            SELECT metodo, COALESCE(SUM(monto), 0) AS total, COUNT(*) AS n
            FROM pagos
            WHERE hospedaje_id = ? AND substr(fecha, 1, 7) = ?
            GROUP BY metodo
            ORDER BY total DESC
            """,
            (hid, periodo),
        )
        metodos_pago = [
            {"metodo": r["metodo"] or "otro", "total": round(r["total"] or 0, 2), "n": r["n"]}
            for r in cursor.fetchall()
        ]

        # --- Reservas que ENTRAN en el mes (no canceladas): nº y ticket promedio. ---
        cursor.execute(
            """
            SELECT COUNT(*) AS n, COALESCE(AVG(total), 0) AS ticket
            FROM reservas
            WHERE hospedaje_id = ? AND estado != 'Cancelada'
            AND substr(fecha_entrada, 1, 7) = ?
            """,
            (hid, periodo),
        )
        fila = cursor.fetchone()
        num_reservas = fila["n"] or 0
        ticket_promedio = round(fila["ticket"] or 0, 2)

        # --- Top habitaciones por ingresos (reservas que entran en el mes). ---
        cursor.execute(
            """
            SELECT hab.numero AS habitacion, hab.tipo AS tipo,
                   COALESCE(SUM(r.total), 0) AS ingresos, COUNT(*) AS reservas
            FROM reservas r
            JOIN habitaciones hab ON r.habitacion_id = hab.id
            WHERE r.hospedaje_id = ? AND r.estado != 'Cancelada'
            AND substr(r.fecha_entrada, 1, 7) = ?
            GROUP BY hab.id
            ORDER BY ingresos DESC
            LIMIT 3
            """,
            (hid, periodo),
        )
        top_habitaciones = [
            {
                "habitacion": r["habitacion"],
                "tipo": r["tipo"],
                "ingresos": round(r["ingresos"] or 0, 2),
                "reservas": r["reservas"],
            }
            for r in cursor.fetchall()
        ]

        # --- Origen de las reservas del mes (link público vs. creadas a mano). ---
        cursor.execute(
            """
            SELECT origen, COUNT(*) AS n
            FROM reservas
            WHERE hospedaje_id = ? AND estado != 'Cancelada'
            AND substr(fecha_entrada, 1, 7) = ?
            GROUP BY origen
            """,
            (hid, periodo),
        )
        por_origen = {(r["origen"] or "manual"): r["n"] for r in cursor.fetchall()}
        origen_reservas = {
            "publico": por_origen.get("publico", 0),
            "manual": por_origen.get("manual", 0),
        }

        # --- Ingresos cobrados por DÍA del mes (para la línea de tendencia). ---
        num_dias = calendar.monthrange(anio, mes)[1]
        cursor.execute(
            """
            SELECT substr(fecha, 9, 2) AS dd, COALESCE(SUM(monto), 0) AS t
            FROM pagos
            WHERE hospedaje_id = ? AND substr(fecha, 1, 7) = ?
            GROUP BY substr(fecha, 9, 2)
            """,
            (hid, periodo),
        )
        por_dia = {int(r["dd"]): round(r["t"] or 0, 2) for r in cursor.fetchall()}
        ingresos_por_dia = [
            {"dia": d, "total": por_dia.get(d, 0)} for d in range(1, num_dias + 1)
        ]

        return {
            "anio": anio,
            "mes": mes,
            "ingresos": {
                "cobrado": cobrado,
                "num_pagos": num_pagos,
                "num_reservas": num_reservas,
                "ticket_promedio": ticket_promedio,
            },
            "metodos_pago": metodos_pago,
            "top_habitaciones": top_habitaciones,
            "origen_reservas": origen_reservas,
            "ingresos_por_dia": ingresos_por_dia,
        }
    finally:
        conn.close()
