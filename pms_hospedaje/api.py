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
import json
import uuid
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

_ES_PROD = os.environ.get("PMS_ENV") == "production"

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse

import database
import auth
import sunat
import tarifas
from database import get_connection
from modelos import Habitacion, Huesped, Reserva, Estancia, Factura, Pago, ServicioHabitacion, Consumo
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
    version="0.5.0",
)

# --- Rate Limiter ---
# Global: 60 req/min por IP. Endpoints de auth: 5 req/min por IP.
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Demasiadas peticiones. Intenta de nuevo en un minuto."},
    )

# --- Security Headers Middleware ---
@app.middleware("http")
async def _security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if _ES_PROD:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# Origenes permitidos (CORS).
#  - En desarrollo: localhost en sus puertos habituales.
#  - En produccion: se anaden los dominios definidos en la variable de entorno
#    CORS_ORIGINS (separados por coma), p.ej. la URL del frontend en Vercel.
_origenes = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",  # preview / verificación local
    "http://127.0.0.1:5174",
    "http://localhost:5190",
    "http://127.0.0.1:5190",
]
_extra = os.environ.get("CORS_ORIGINS", "")
if _extra:
    _origenes += [o.strip() for o in _extra.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origenes,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):(5173|5174|5190)",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
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
    fecha_entrada: str = Field(..., description="Formato YYYY-MM-DD", max_length=10)
    fecha_salida: str = Field(..., description="Formato YYYY-MM-DD", max_length=10)
    notas: str = Field("", max_length=2000)


class ReservaGrupoNueva(BaseModel):
    huesped_id: int
    habitacion_ids: list[int]
    fecha_entrada: str = Field(..., description="Formato YYYY-MM-DD", max_length=10)
    fecha_salida: str = Field(..., description="Formato YYYY-MM-DD", max_length=10)
    notas: str = Field("", max_length=2000)


class MoverReserva(BaseModel):
    habitacion_id: int


class ReservaEdit(BaseModel):
    fecha_entrada: str = Field(..., max_length=10)
    fecha_salida: str = Field(..., max_length=10)
    notas: str = Field("", max_length=2000)


class ReservaPublica(BaseModel):
    habitacion_id: int
    fecha_entrada: str = Field(..., max_length=10)
    fecha_salida: str = Field(..., max_length=10)
    nombre: str = Field(..., max_length=200)
    email: str = Field("", max_length=254)
    telefono: str = Field("", max_length=20)
    notas: str = Field("", max_length=2000)


class HuespedDatos(BaseModel):
    nombre: str = Field(..., max_length=200)
    email: str = Field("", max_length=254)
    telefono: str = Field("", max_length=20)
    documento: str = Field("", max_length=15)
    direccion: str = Field("", max_length=300)
    tipo_documento: str = Field("DNI", max_length=20)


class HabitacionDatos(BaseModel):
    numero: str = Field(..., max_length=10)
    tipo: str = Field(..., max_length=50)
    precio_base: float
    estado_limpieza: str = Field("Limpia", max_length=20)
    estado: str = Field("disponible", max_length=20)


class LimpiezaEstado(BaseModel):
    estado_limpieza: str = Field(..., max_length=20)


class TareaLimpiezaDatos(BaseModel):
    habitacion_id: int
    asignado_a: str = Field("", max_length=100)
    notas: str = Field("", max_length=2000)
    fecha: str = Field("", max_length=10)


class BloqueoNuevo(BaseModel):
    habitacion_id: int
    fecha_inicio: str = Field(..., max_length=10)
    fecha_fin: str = Field(..., max_length=10)
    motivo: str = Field("", max_length=500)


class CheckinIn(BaseModel):
    reserva_id: int
    fecha_entrada_real: str = Field("", max_length=10)


class CheckoutIn(BaseModel):
    estancia_id: int
    fecha_checkout_real: str = Field("", max_length=10)
    descuento: float = 0
    descuento_motivo: str = Field("", max_length=200)


class PagoNuevo(BaseModel):
    factura_id: int
    monto: float
    metodo: str = Field("efectivo", max_length=30)
    referencia: str = Field("", max_length=200)


class CierreTurnoDatos(BaseModel):
    fecha: str = Field("", max_length=10)
    efectivo_contado: float | None = None
    notas: str = Field("", max_length=2000)


class SunatConfigDatos(BaseModel):
    ruc: str = Field("", max_length=11)
    razon_social: str = Field("", max_length=200)
    direccion: str = Field("", max_length=300)
    serie_boleta: str = Field("B001", max_length=10)
    modo: str = Field("sandbox", max_length=20)
    activo: bool = False


class LoginIn(BaseModel):
    usuario: str = Field(..., max_length=100)
    password: str = Field(..., max_length=200)


class GoogleLoginIn(BaseModel):
    credential: str = Field(..., max_length=2000)


class UsuarioNuevo(BaseModel):
    usuario: str = Field(..., max_length=100)
    nombre: str = Field(..., max_length=200)
    password: str = Field(..., max_length=200)
    rol: str = Field("recepcion", max_length=20)


class UsuarioEdit(BaseModel):
    nombre: str = Field(..., max_length=200)
    rol: str = Field(..., max_length=20)
    activo: bool = True
    password: str = Field("", max_length=200)


class HospedajeNuevo(BaseModel):
    nombre: str = Field(..., max_length=200)
    plan: str = Field("trial", max_length=20)
    estado: str = Field("activo", max_length=20)
    fecha_expira: str = Field("", max_length=10)
    admin_usuario: str = Field(..., max_length=100)
    admin_nombre: str = Field(..., max_length=200)
    admin_password: str = Field(..., max_length=200)


class HospedajeEdit(BaseModel):
    nombre: str = Field(..., max_length=200)
    plan: str = Field(..., max_length=20)
    estado: str = Field(..., max_length=20)
    fecha_expira: str = Field("", max_length=10)


class ContactoNuevo(BaseModel):
    nombre: str = Field("", max_length=120)
    contacto: str = Field("", max_length=160)     # correo o teléfono que deja el visitante
    mensaje: str = Field(..., min_length=1, max_length=2000)


class ItemInventarioDatos(BaseModel):
    nombre: str = Field(..., max_length=120)
    categoria: str = Field("Operación", max_length=30)   # Cocina|Minimarket|Limpieza|Operación
    unidad: str = Field("unidad", max_length=20)         # unidad base (kg, litro, unidad, saco…)
    stock: float = Field(0, ge=0)
    stock_minimo: float = Field(0, ge=0)
    costo_unitario: float = Field(0, ge=0)
    proveedor: str = Field("", max_length=120)
    presentacion: str = Field("", max_length=30)         # presentación de compra (ej. "saco")
    presentacion_factor: float = Field(0, ge=0)          # unidades base por 1 presentación


class MovimientoInventarioDatos(BaseModel):
    tipo: str = Field(..., max_length=10)                # entrada | salida | ajuste
    cantidad: float = Field(..., ge=0)
    motivo: str = Field("", max_length=200)
    costo_unitario: float = Field(0, ge=0)               # opcional; en 'entrada' actualiza el costo
    en_presentacion: bool = False                        # si la cantidad viene en presentación


class PagoSuscripcionNuevo(BaseModel):
    monto: float = Field(..., gt=0)
    metodo: str = Field("yape", max_length=20)       # yape|transferencia|efectivo|otro
    periodo: str = Field("mensual", max_length=10)   # mensual|anual
    plan: str = Field("inicia", max_length=20)       # inicia|crece|pro
    nota: str = Field("", max_length=300)
    es_fundador: bool = False                         # guarda precio_pactado (S/99 vitalicio)


class SlugNuevo(BaseModel):
    slug: str = Field(..., max_length=40)


class MiHospedajeDatos(BaseModel):
    nombre: str = Field("", max_length=200)
    ruc: str = Field("", max_length=11)
    razon_social: str = Field("", max_length=200)
    direccion: str = Field("", max_length=300)
    telefono: str = Field("", max_length=20)
    email_contacto: str = Field("", max_length=254)


class RegistroPublico(BaseModel):
    hospedaje_nombre: str = Field(..., max_length=200)
    nombre: str = Field(..., max_length=200)
    email: str = Field(..., max_length=254)
    usuario: str = Field(..., max_length=100)
    password: str = Field(..., max_length=200)


class ServicioHabitacionNuevo(BaseModel):
    nombre: str = Field(..., max_length=200)
    categoria: str = Field("general", max_length=30)
    subcategoria: str = Field("", max_length=100)
    precio: float = 0.0
    tipo: str = Field("producto", max_length=20)  # 'producto' | 'servicio'
    inventario_item_id: int = 0                    # 0 = sin enlace a inventario


class ServicioHabitacionEdit(BaseModel):
    nombre: str = Field(..., max_length=200)
    categoria: str = Field("general", max_length=30)
    subcategoria: str = Field("", max_length=100)
    precio: float = 0.0
    activo: bool = True
    tipo: str = Field("producto", max_length=20)
    inventario_item_id: int = 0


class ConsumoNuevo(BaseModel):
    reserva_id: int
    tipo: str = Field(..., max_length=20)  # 'servicio' | 'pedido'
    descripcion: str = Field(..., max_length=300)
    cantidad: int = 1
    precio_unitario: float = 0.0
    notas: str = Field("", max_length=500)
    servicio_id: int = 0                    # si viene del catálogo: para descontar stock


class TarifaNueva(BaseModel):
    # Regla de precio por temporada/fin de semana. Opcionales: rango de fechas,
    # días de semana (CSV 0=Lun..6=Dom), habitación (None=todas). Precio absoluto
    # o ajuste %.
    nombre: str = Field("", max_length=100)
    fecha_inicio: str = Field("", max_length=10)  # YYYY-MM-DD
    fecha_fin: str = Field("", max_length=10)
    dias_semana: str = Field("", max_length=20)   # ej. "5,6" (sáb, dom)
    habitacion_id: int | None = None
    precio: float | None = None
    ajuste_pct: float | None = None


# --------------------------------------------------------------------------- #
#  Autenticacion y gestion de usuarios
# --------------------------------------------------------------------------- #
@limiter.limit("5/minute")
@app.post("/api/auth/login")
def login(datos: LoginIn, request: Request):
    u = auth.autenticar(datos.usuario.strip(), datos.password)
    if not u:
        raise HTTPException(status_code=401, detail="Usuario o contrasena incorrectos.")
    # Bloquea el login si el hospedaje está suspendido/cancelado.
    auth.verificar_acceso_hospedaje(u)
    token = auth.crear_token(u)
    return {"token": token, "usuario": auth.publico(u)}


@limiter.limit("3/minute")
@app.post("/api/auth/registro", status_code=201)
def registro_publico(datos: RegistroPublico, request: Request):
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


@limiter.limit("5/minute")
@app.post("/api/auth/google")
def login_google(datos: GoogleLoginIn, request: Request):
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


def _obtener_hospedaje(hid):
    """Datos del hospedaje (dict) para la factura/comprobante. {} si no existe."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT nombre, ruc, razon_social, direccion, telefono FROM hospedajes WHERE id = ?",
            (hid,),
        )
        row = cursor.fetchone()
    finally:
        conn.close()
    return dict(row) if row else {}


def _dias_restantes(fecha_expira):
    """Días que faltan para que venza la suscripción/prueba (None si no aplica)."""
    if not fecha_expira:
        return None
    try:
        fin = datetime.strptime(str(fecha_expira)[:10], "%Y-%m-%d")
    except (ValueError, TypeError):
        return None
    return (fin.date() - datetime.now().date()).days


@app.get("/api/mi-hospedaje")
def obtener_mi_hospedaje(admin: dict = Depends(auth.solo_admin)):
    """Datos del negocio + estado de suscripción del hospedaje del admin.
    Alimenta la pantalla de Configuración (identidad para la factura + plan)."""
    hid = admin["hospedaje_id"]
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT nombre, slug, ruc, razon_social, direccion, telefono,
                      email_contacto, plan, estado, fecha_expira
               FROM hospedajes WHERE id = ?""",
            (hid,),
        )
        row = cursor.fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Hospedaje no encontrado.")
    datos = dict(row)
    datos["dias_restantes"] = _dias_restantes(datos.get("fecha_expira"))
    return datos


@app.put("/api/mi-hospedaje")
def guardar_mi_hospedaje(datos: MiHospedajeDatos, admin: dict = Depends(auth.solo_admin)):
    """Actualiza la identidad del negocio (nombre, RUC, razón social, dirección,
    teléfono, email). Sincroniza RUC/razón social/dirección con la config SUNAT
    sin tocar serie/correlativo/modo/activo (merge)."""
    hid = admin["hospedaje_id"]

    nombre = (datos.nombre or "").strip()
    if not nombre:
        raise HTTPException(status_code=422, detail="El nombre del negocio es obligatorio.")
    ruc = (datos.ruc or "").strip()
    if ruc and (not ruc.isdigit() or len(ruc) != 11):
        raise HTTPException(status_code=422, detail="El RUC debe tener 11 dígitos.")

    razon_social = (datos.razon_social or "").strip()
    direccion = (datos.direccion or "").strip()
    telefono = (datos.telefono or "").strip()
    email_contacto = (datos.email_contacto or "").strip()

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM hospedajes WHERE id = ?", (hid,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Hospedaje no encontrado.")
        cursor.execute(
            """UPDATE hospedajes SET nombre=?, ruc=?, razon_social=?, direccion=?,
                      telefono=?, email_contacto=? WHERE id=?""",
            (nombre, ruc, razon_social, direccion, telefono, email_contacto, hid),
        )
        conn.commit()
    finally:
        conn.close()

    # Sincronizar con SUNAT (merge: conserva serie/modo/activo existentes).
    config = sunat.obtener_config(hid)
    config.update({"ruc": ruc, "razon_social": razon_social, "direccion": direccion})
    sunat.guardar_config(hid, config)

    return obtener_mi_hospedaje(admin)


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
# Planes válidos del SaaS. 'trial' = prueba; inicia/crece/pro = pagos (alineado
# con la web de precios). 'basico' se tolera como valor legado (rows antiguas).
PLANES_VALIDOS = ("trial", "inicia", "crece", "pro", "basico")


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
    if datos.plan not in PLANES_VALIDOS:
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
    if datos.plan not in PLANES_VALIDOS:
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
#  Pagos de suscripcion del SaaS (SOLO super admin) — cobro manual Yape/transf.
#  Registrar un pago ACTIVA y EXTIENDE al cliente automaticamente.
# --------------------------------------------------------------------------- #
def _parse_fecha(valor):
    """Parsea 'YYYY-MM-DD...' a datetime.date; None si no se puede."""
    if not valor:
        return None
    try:
        return datetime.strptime(str(valor)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


@app.post("/api/hospedajes/{hospedaje_id}/pagos", status_code=201)
def registrar_pago_suscripcion(
    hospedaje_id: int,
    datos: PagoSuscripcionNuevo,
    _sa: dict = Depends(auth.solo_superadmin),
):
    """Registra un pago de suscripcion (Yape/transferencia) y, con ello,
    ACTIVA y EXTIENDE al cliente automaticamente: estado='activo', plan pagado
    y fecha_expira += periodo (30 dias mensual | 365 anual), acumulando sobre el
    vencimiento vigente si aun no expira. Guarda precio_pactado si es fundador."""
    if datos.plan not in PLANES_VALIDOS:
        raise HTTPException(status_code=422, detail="Plan invalido.")
    if datos.periodo not in ("mensual", "anual"):
        raise HTTPException(status_code=422, detail="Periodo invalido.")
    if datos.metodo not in ("yape", "transferencia", "efectivo", "otro"):
        raise HTTPException(status_code=422, detail="Metodo invalido.")

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT fecha_expira FROM hospedajes WHERE id = ?", (hospedaje_id,)
        )
        fila = cursor.fetchone()
        if not fila:
            raise HTTPException(status_code=404, detail="Hospedaje no encontrado.")

        hoy = datetime.now().date()
        expira_actual = _parse_fecha(fila["fecha_expira"] if hasattr(fila, "keys") else fila[0])
        # Si aun no vence, el nuevo periodo se acumula desde el vencimiento actual.
        base = expira_actual if (expira_actual and expira_actual > hoy) else hoy
        dias = 365 if datos.periodo == "anual" else 30
        nueva_expira = base + timedelta(days=dias)
        cubre_desde = base.strftime("%Y-%m-%d")
        cubre_hasta = nueva_expira.strftime("%Y-%m-%d")
        fecha_expira_str = nueva_expira.strftime("%Y-%m-%d")

        # Activar + extender el hospedaje (activacion automatica).
        if datos.es_fundador:
            cursor.execute(
                "UPDATE hospedajes SET estado='activo', plan=?, fecha_expira=?, precio_pactado=? WHERE id=?",
                (datos.plan, fecha_expira_str, datos.monto, hospedaje_id),
            )
        else:
            cursor.execute(
                "UPDATE hospedajes SET estado='activo', plan=?, fecha_expira=? WHERE id=?",
                (datos.plan, fecha_expira_str, hospedaje_id),
            )

        cursor.execute(
            """
            INSERT INTO pagos_suscripcion
              (hospedaje_id, monto, moneda, metodo, periodo, plan,
               cubre_desde, cubre_hasta, nota, registrado_por)
            VALUES (?, ?, 'PEN', ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                hospedaje_id, datos.monto, datos.metodo, datos.periodo, datos.plan,
                cubre_desde, cubre_hasta, datos.nota.strip(), _sa.get("id"),
            ),
        )
        pago_id = cursor.lastrowid
        conn.commit()
    finally:
        conn.close()
    return {
        "id": pago_id,
        "hospedaje_id": hospedaje_id,
        "estado": "activo",
        "plan": datos.plan,
        "fecha_expira": fecha_expira_str,
        "cubre_hasta": cubre_hasta,
    }


@app.get("/api/hospedajes/{hospedaje_id}/pagos")
def pagos_de_hospedaje(
    hospedaje_id: int, _sa: dict = Depends(auth.solo_superadmin)
):
    """Historial de pagos de suscripcion de un hospedaje."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, monto, moneda, metodo, periodo, plan,
                   fecha_pago, cubre_desde, cubre_hasta, nota
            FROM pagos_suscripcion
            WHERE hospedaje_id = ?
            ORDER BY id DESC
            """,
            (hospedaje_id,),
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


@app.get("/api/pagos-suscripcion")
def listar_pagos_suscripcion(_sa: dict = Depends(auth.solo_superadmin)):
    """Historial completo de pagos del SaaS + total recaudado (para el dueno)."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT p.id, p.hospedaje_id, h.nombre AS hospedaje_nombre,
                   p.monto, p.moneda, p.metodo, p.periodo, p.plan,
                   p.fecha_pago, p.cubre_desde, p.cubre_hasta, p.nota
            FROM pagos_suscripcion p
            LEFT JOIN hospedajes h ON h.id = p.hospedaje_id
            ORDER BY p.id DESC
            """
        )
        pagos = [dict(row) for row in cursor.fetchall()]
        total = sum(float(p.get("monto") or 0) for p in pagos)
        return {"pagos": pagos, "total_recaudado": total, "cantidad": len(pagos)}
    finally:
        conn.close()


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
#  Contacto de la landing (leads) — POST publico, GET solo super admin.
#  Evita exponer el correo/numero: el mensaje se guarda y el dueno lo revisa.
# --------------------------------------------------------------------------- #
@limiter.limit("4/minute")
@app.post("/api/contacto", status_code=201)
def crear_contacto(datos: ContactoNuevo, request: Request):
    """Guarda un mensaje del formulario de contacto de la web publica. No expone
    ningun dato del negocio; el super admin lo lee luego en su panel."""
    mensaje = datos.mensaje.strip()
    if not mensaje:
        raise HTTPException(status_code=422, detail="Escribe un mensaje.")
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO contactos (nombre, contacto, mensaje, origen) VALUES (?, ?, ?, ?)",
            (datos.nombre.strip()[:120], datos.contacto.strip()[:160], mensaje[:2000], "landing"),
        )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@app.get("/api/contactos")
def listar_contactos(_sa: dict = Depends(auth.solo_superadmin)):
    """Lista los mensajes de contacto recibidos (para el dueno del SaaS)."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, nombre, contacto, mensaje, origen, atendido, creado_en "
            "FROM contactos ORDER BY id DESC"
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


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
        _reglas = tarifas.obtener_reglas(hid)
        for r in libres:
            r["total"] = tarifas.total_estadia(
                hid, r["id"], r["precio_base"], fecha_entrada, fecha_salida, reglas=_reglas
            )
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
    # Endpoint PÚBLICO (sin auth): no confiar en que el front limite las fechas.
    # Rechaza entradas en el pasado (con 1 día de margen por la zona horaria del
    # servidor en UTC vs Perú −5) y estadías absurdas (anti-abuso/datos basura).
    hoy = datetime.now().date()
    if fe.date() < hoy - timedelta(days=1):
        raise HTTPException(
            status_code=422, detail="La fecha de entrada no puede estar en el pasado."
        )
    if (fs - fe).days > 60:
        raise HTTPException(
            status_code=422, detail="La estadía no puede superar las 60 noches por reserva."
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
        total = tarifas.total_estadia(
            hid, datos.habitacion_id, hab["precio_base"],
            datos.fecha_entrada, datos.fecha_salida,
        )

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
#  Housekeeping / Limpieza
#  Visible a admin y recepción (usuario logueado del hospedaje), no solo admin.
#  El personal de limpieza NO accede al PMS: recepción/admin coordinan.
# --------------------------------------------------------------------------- #
_ESTADOS_LIMPIEZA = ("Limpia", "Sucia", "Revisión")


@app.patch("/api/habitaciones/{habitacion_id}/limpieza")
def cambiar_limpieza_habitacion(
    habitacion_id: int,
    datos: LimpiezaEstado,
    _actual: dict = Depends(auth.usuario_actual),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Cambio rápido del estado de limpieza de una habitación (1 clic)."""
    estado = (datos.estado_limpieza or "").strip()
    if estado not in _ESTADOS_LIMPIEZA:
        raise HTTPException(
            status_code=422,
            detail="Estado de limpieza inválido (usa Limpia, Sucia o Revisión).",
        )
    hab = _buscar_habitacion(habitacion_id, hid)
    if not hab:
        raise HTTPException(status_code=404, detail="Habitacion no encontrada.")
    hab.cambiar_estado_limpieza(estado)
    # Si queda Limpia, cerrar cualquier tarea pendiente de esa habitación (coherencia:
    # una habitación limpia no debe seguir con asignaciones "pendientes").
    if estado == "Limpia":
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE tareas_limpieza SET estado = 'Completada' "
                "WHERE habitacion_id = ? AND hospedaje_id = ? AND estado = 'Pendiente'",
                (habitacion_id, hid),
            )
            conn.commit()
        finally:
            conn.close()
    return _a_dict(hab)


@app.get("/api/tareas-limpieza")
def listar_tareas_limpieza(
    habitacion_id: int = 0,
    incluir_completadas: bool = False,
    _actual: dict = Depends(auth.usuario_actual),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Tareas de limpieza del hospedaje (por defecto solo las pendientes).
    Con habitacion_id>0 devuelve el historial de esa habitación."""
    where = ["t.hospedaje_id = ?"]
    params = [hid]
    if habitacion_id:
        where.append("t.habitacion_id = ?")
        params.append(habitacion_id)
    if not incluir_completadas:
        where.append("t.estado = 'Pendiente'")
    sql = (
        "SELECT t.id, t.habitacion_id, t.fecha, t.estado, t.asignado_a, t.notas, "
        "h.numero AS habitacion_numero, h.tipo AS habitacion_tipo "
        "FROM tareas_limpieza t LEFT JOIN habitaciones h ON h.id = t.habitacion_id "
        "WHERE " + " AND ".join(where) + " ORDER BY t.id DESC"
    )
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(sql, params)
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


@app.post("/api/tareas-limpieza", status_code=201)
def crear_tarea_limpieza(
    datos: TareaLimpiezaDatos,
    _actual: dict = Depends(auth.usuario_actual),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Crea una tarea de limpieza (responsable + nota) y marca la habitación
    como Sucia. Para hospedajes que coordinan a su personal de limpieza."""
    hab = _buscar_habitacion(datos.habitacion_id, hid)
    if not hab:
        raise HTTPException(status_code=404, detail="Habitacion no encontrada.")
    fecha = (datos.fecha or "").strip() or datetime.now().strftime("%Y-%m-%d")
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO tareas_limpieza (habitacion_id, fecha, estado, asignado_a, notas, hospedaje_id) "
            "VALUES (?, ?, 'Pendiente', ?, ?, ?)",
            (datos.habitacion_id, fecha, (datos.asignado_a or "").strip(),
             (datos.notas or "").strip(), hid),
        )
        nueva_id = cursor.lastrowid
        conn.commit()
    finally:
        conn.close()
    # La habitación queda pendiente de limpieza.
    hab.cambiar_estado_limpieza("Sucia")
    return {
        "id": nueva_id,
        "habitacion_id": datos.habitacion_id,
        "fecha": fecha,
        "estado": "Pendiente",
        "asignado_a": (datos.asignado_a or "").strip(),
        "notas": (datos.notas or "").strip(),
    }


@app.post("/api/tareas-limpieza/{tarea_id}/completar")
def completar_tarea_limpieza(
    tarea_id: int,
    _actual: dict = Depends(auth.usuario_actual),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Marca la tarea como Completada y deja la habitación Limpia."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, habitacion_id FROM tareas_limpieza WHERE id = ? AND hospedaje_id = ?",
            (tarea_id, hid),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Tarea no encontrada.")
        habitacion_id = row["habitacion_id"]
        cursor.execute(
            "UPDATE tareas_limpieza SET estado = 'Completada' WHERE id = ? AND hospedaje_id = ?",
            (tarea_id, hid),
        )
        conn.commit()
    finally:
        conn.close()
    hab = _buscar_habitacion(habitacion_id, hid)
    if hab:
        hab.cambiar_estado_limpieza("Limpia")
    return {"id": tarea_id, "habitacion_id": habitacion_id, "estado": "Completada"}


# --------------------------------------------------------------------------- #
#  Huespedes (CRUD)
# --------------------------------------------------------------------------- #
def _estado_huesped(reservas, gasto_total):
    """Deriva el estado del huésped para recepción/admin. Umbrales simples y
    documentados: VIP si tiene 5+ estadías o gastó S/1500+; Frecuente con 2+;
    Nuevo el resto."""
    if reservas >= 5 or gasto_total >= 1500:
        return "VIP"
    if reservas >= 2:
        return "Frecuente"
    return "Nuevo"


@app.get("/api/huespedes")
def listar_huespedes(
    incluir_archivados: int = 0, hid: int = Depends(auth.hospedaje_actual)
):
    """Huéspedes del hospedaje CON métricas útiles para recepción/admin
    (reservas, noches, gasto, ticket, última visita, próxima reserva, estado).
    Por defecto oculta los archivados (?incluir_archivados=1 para verlos)."""
    hoy = datetime.now().strftime("%Y-%m-%d")
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, nombre, email, telefono, documento, tipo_documento, direccion, "
            "COALESCE(archivado, 0) AS archivado FROM huespedes "
            "WHERE hospedaje_id = ? ORDER BY nombre",
            (hid,),
        )
        huespedes = [dict(r) for r in cursor.fetchall()]
        cursor.execute(
            "SELECT huesped_id, estado, fecha_entrada, fecha_salida, total "
            "FROM reservas WHERE hospedaje_id = ?",
            (hid,),
        )
        reservas = [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()

    # Agregar métricas por huésped a partir de sus reservas (una sola pasada).
    met = {}
    for r in reservas:
        g = met.setdefault(
            r["huesped_id"],
            {"reservas": 0, "cancelaciones": 0, "gasto": 0.0, "noches": 0, "ultima": None, "proxima": None},
        )
        if r["estado"] == "Cancelada":
            g["cancelaciones"] += 1
            continue
        g["reservas"] += 1
        g["gasto"] += float(r["total"] or 0)
        fe = str(r["fecha_entrada"] or "")[:10]
        fs = str(r["fecha_salida"] or "")[:10]
        try:
            d1 = datetime.strptime(fe, "%Y-%m-%d")
            d2 = datetime.strptime(fs, "%Y-%m-%d")
            g["noches"] += max(0, (d2 - d1).days)
        except ValueError:
            pass
        if fs and fs <= hoy and (not g["ultima"] or fs > g["ultima"]):
            g["ultima"] = fs
        if fe and fe >= hoy and (not g["proxima"] or fe < g["proxima"]):
            g["proxima"] = fe

    salida = []
    for h in huespedes:
        if not incluir_archivados and h["archivado"]:
            continue
        g = met.get(h["id"], {"reservas": 0, "cancelaciones": 0, "gasto": 0.0, "noches": 0, "ultima": None, "proxima": None})
        gasto = round(g["gasto"], 2)
        nres = g["reservas"]
        h["metricas"] = {
            "reservas": nres,
            "cancelaciones": g["cancelaciones"],
            "noches": g["noches"],
            "gasto_total": gasto,
            "ticket_promedio": round(gasto / nres, 2) if nres else 0,
            "ultima_visita": g["ultima"],
            "proxima_reserva": g["proxima"],
            "estado": _estado_huesped(nres, gasto),
        }
        salida.append(h)
    return salida


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
def archivar_huesped(
    huesped_id: int,
    _admin: dict = Depends(auth.solo_admin),
    hid: int = Depends(auth.hospedaje_actual),
):
    """ARCHIVA al huésped (soft-delete): lo oculta del listado por defecto pero
    conserva su historial de reservas, estadísticas y trazabilidad. No se borra
    nunca (en un PMS real eliminar rompería reportes y auditoría)."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT 1 FROM huespedes WHERE id = ? AND hospedaje_id = ?", (huesped_id, hid)
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Huesped no encontrado.")
        cursor.execute(
            "UPDATE huespedes SET archivado = 1 WHERE id = ? AND hospedaje_id = ?",
            (huesped_id, hid),
        )
        conn.commit()
    finally:
        conn.close()
    return {"id": huesped_id, "archivado": True}


@app.post("/api/huespedes/{huesped_id}/desarchivar")
def desarchivar_huesped(
    huesped_id: int,
    _admin: dict = Depends(auth.solo_admin),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Restaura un huésped archivado (vuelve a aparecer en el listado)."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT 1 FROM huespedes WHERE id = ? AND hospedaje_id = ?", (huesped_id, hid)
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Huesped no encontrado.")
        cursor.execute(
            "UPDATE huespedes SET archivado = 0 WHERE id = ? AND hospedaje_id = ?",
            (huesped_id, hid),
        )
        conn.commit()
    finally:
        conn.close()
    return {"id": huesped_id, "archivado": False}


# --------------------------------------------------------------------------- #
#  Inventario (SOLO admin) — existencias por categoría + movimientos.
# --------------------------------------------------------------------------- #
CATEGORIAS_INV = ("Cocina", "Minimarket", "Limpieza", "Operación")


def _item_inv_dict(row):
    d = dict(row)
    stock = float(d.get("stock") or 0)
    minimo = float(d.get("stock_minimo") or 0)
    d["en_alerta"] = bool(minimo > 0 and stock <= minimo)
    d["agotado"] = stock <= 0
    d["valor"] = round(stock * float(d.get("costo_unitario") or 0), 2)
    return d


@app.get("/api/inventario")
def listar_inventario(
    categoria: str = "", incluir_inactivos: int = 0,
    _admin: dict = Depends(auth.solo_admin), hid: int = Depends(auth.hospedaje_actual),
):
    """Items de inventario del hospedaje (con alerta de stock bajo y valorización)."""
    cond = ["hospedaje_id = ?"]
    params = [hid]
    if not incluir_inactivos:
        cond.append("activo = 1")
    if categoria:
        cond.append("categoria = ?")
        params.append(categoria)
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, nombre, categoria, unidad, stock, stock_minimo, costo_unitario, "
            "proveedor, activo, COALESCE(presentacion,'') AS presentacion, "
            "COALESCE(presentacion_factor,0) AS presentacion_factor "
            f"FROM inventario_items WHERE {' AND '.join(cond)} "
            "ORDER BY categoria, nombre",
            tuple(params),
        )
        return [_item_inv_dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()


@app.get("/api/inventario/resumen")
def resumen_inventario(
    _admin: dict = Depends(auth.solo_admin), hid: int = Depends(auth.hospedaje_actual)
):
    """Totales del inventario: nº de items, cuántos en alerta y valor total."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT stock, stock_minimo, costo_unitario FROM inventario_items "
            "WHERE hospedaje_id = ? AND activo = 1",
            (hid,),
        )
        items = [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()
    en_alerta = sum(
        1 for i in items if (i["stock_minimo"] or 0) > 0 and (i["stock"] or 0) <= i["stock_minimo"]
    )
    valor = round(sum((i["stock"] or 0) * (i["costo_unitario"] or 0) for i in items), 2)
    return {"items": len(items), "en_alerta": en_alerta, "valor_total": valor}


@app.post("/api/inventario", status_code=201)
def crear_item_inventario(
    datos: ItemInventarioDatos,
    _admin: dict = Depends(auth.solo_admin), hid: int = Depends(auth.hospedaje_actual),
):
    if not datos.nombre.strip():
        raise HTTPException(status_code=422, detail="El nombre es obligatorio.")
    cat = datos.categoria if datos.categoria in CATEGORIAS_INV else "Operación"
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO inventario_items "
            "(hospedaje_id, nombre, categoria, unidad, stock, stock_minimo, costo_unitario, proveedor, "
            "presentacion, presentacion_factor, activo) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
            (hid, datos.nombre.strip(), cat, datos.unidad.strip() or "unidad",
             datos.stock, datos.stock_minimo, datos.costo_unitario, datos.proveedor.strip(),
             datos.presentacion.strip(), datos.presentacion_factor or 0),
        )
        nid = cursor.lastrowid
        conn.commit()
    finally:
        conn.close()
    return {"id": nid}


@app.put("/api/inventario/{item_id}")
def editar_item_inventario(
    item_id: int, datos: ItemInventarioDatos,
    _admin: dict = Depends(auth.solo_admin), hid: int = Depends(auth.hospedaje_actual),
):
    """Edita los datos del item. El STOCK no se toca aquí: se cambia con
    movimientos (entrada/salida/ajuste) para mantener la trazabilidad."""
    cat = datos.categoria if datos.categoria in CATEGORIAS_INV else "Operación"
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM inventario_items WHERE id = ? AND hospedaje_id = ?", (item_id, hid))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Item no encontrado.")
        cursor.execute(
            "UPDATE inventario_items SET nombre=?, categoria=?, unidad=?, stock_minimo=?, "
            "costo_unitario=?, proveedor=?, presentacion=?, presentacion_factor=? "
            "WHERE id=? AND hospedaje_id=?",
            (datos.nombre.strip(), cat, datos.unidad.strip() or "unidad", datos.stock_minimo,
             datos.costo_unitario, datos.proveedor.strip(),
             datos.presentacion.strip(), datos.presentacion_factor or 0, item_id, hid),
        )
        conn.commit()
    finally:
        conn.close()
    return {"id": item_id}


@app.delete("/api/inventario/{item_id}")
def archivar_item_inventario(
    item_id: int,
    _admin: dict = Depends(auth.solo_admin), hid: int = Depends(auth.hospedaje_actual),
):
    """Archiva el item (soft-delete): conserva su historial de movimientos."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM inventario_items WHERE id = ? AND hospedaje_id = ?", (item_id, hid))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Item no encontrado.")
        cursor.execute("UPDATE inventario_items SET activo = 0 WHERE id = ? AND hospedaje_id = ?", (item_id, hid))
        conn.commit()
    finally:
        conn.close()
    return {"id": item_id, "archivado": True}


@app.post("/api/inventario/{item_id}/movimiento", status_code=201)
def registrar_movimiento_inventario(
    item_id: int, datos: MovimientoInventarioDatos,
    actual: dict = Depends(auth.solo_admin), hid: int = Depends(auth.hospedaje_actual),
):
    """Registra un movimiento y actualiza el stock: entrada (+), salida (-),
    ajuste (fija el stock absoluto). El movimiento queda en el historial."""
    tipo = datos.tipo.strip().lower()
    if tipo not in ("entrada", "salida", "ajuste"):
        raise HTTPException(status_code=422, detail="Tipo inválido (entrada|salida|ajuste).")
    if tipo in ("entrada", "salida") and datos.cantidad <= 0:
        raise HTTPException(status_code=422, detail="La cantidad debe ser mayor a 0.")
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT stock, COALESCE(presentacion,'') AS presentacion, "
            "COALESCE(presentacion_factor,0) AS presentacion_factor "
            "FROM inventario_items WHERE id = ? AND hospedaje_id = ?",
            (item_id, hid),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Item no encontrado.")
        row = dict(row)
        stock = float(row.get("stock") or 0)
        factor = float(row.get("presentacion_factor") or 0)

        # Si la cantidad viene en la presentación (ej. sacos), convertir a unidad
        # base multiplicando por el factor. El costo ingresado es por presentación
        # → se guarda por unidad base (costo / factor).
        usa_pres = bool(datos.en_presentacion and factor > 0)
        base_cantidad = datos.cantidad * factor if usa_pres else datos.cantidad
        costo_base = (datos.costo_unitario / factor) if (usa_pres and datos.costo_unitario) else datos.costo_unitario

        if tipo == "entrada":
            nuevo = stock + base_cantidad
        elif tipo == "salida":
            if base_cantidad > stock:
                raise HTTPException(status_code=409, detail=f"No hay stock suficiente (disponible: {stock:g}).")
            nuevo = stock - base_cantidad
        else:
            nuevo = base_cantidad  # ajuste = stock absoluto (en unidad base)

        if tipo == "entrada" and costo_base and costo_base > 0:
            cursor.execute(
                "UPDATE inventario_items SET stock=?, costo_unitario=? WHERE id=? AND hospedaje_id=?",
                (nuevo, round(costo_base, 4), item_id, hid),
            )
        else:
            cursor.execute(
                "UPDATE inventario_items SET stock=? WHERE id=? AND hospedaje_id=?", (nuevo, item_id, hid)
            )

        # El movimiento se guarda en UNIDAD BASE; si vino en presentación, se
        # antepone al motivo para trazabilidad (ej. "2 saco · compra").
        motivo = datos.motivo.strip()
        if usa_pres:
            etq = f"{datos.cantidad:g} {row.get('presentacion') or 'presentación'}"
            motivo = f"{etq}" + (f" · {motivo}" if motivo else "")
        cursor.execute(
            "INSERT INTO inventario_movimientos "
            "(hospedaje_id, item_id, tipo, cantidad, stock_resultante, motivo, costo_unitario, usuario_id, usuario_nombre) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (hid, item_id, tipo, base_cantidad, nuevo, motivo,
             (round(costo_base, 4) if costo_base else None), actual.get("id"), actual.get("nombre", "")),
        )
        conn.commit()
    finally:
        conn.close()
    return {"id": item_id, "stock": nuevo}


@app.get("/api/inventario/{item_id}/movimientos")
def movimientos_inventario(
    item_id: int,
    _admin: dict = Depends(auth.solo_admin), hid: int = Depends(auth.hospedaje_actual),
):
    """Historial de movimientos de un item (últimos 100)."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, tipo, cantidad, stock_resultante, motivo, usuario_nombre, fecha "
            "FROM inventario_movimientos WHERE item_id = ? AND hospedaje_id = ? ORDER BY id DESC LIMIT 100",
            (item_id, hid),
        )
        return [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()


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
            AND r.fecha_entrada <= ? AND r.fecha_salida > ?
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
            WHERE hospedaje_id = ? AND fecha_inicio <= ? AND fecha_fin > ?
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


@app.post("/api/reservas/grupo", status_code=201)
def crear_reserva_grupo(datos: ReservaGrupoNueva, hid: int = Depends(auth.hospedaje_actual)):
    """Crea una reserva de GRUPO: varias habitaciones para el mismo huésped y
    fechas, en una sola operación. Crea N reservas (una por habitación) que
    comparten un grupo_id. Valida disponibilidad de TODAS antes de crear ninguna
    (atómico a nivel de validación); si alguna no está libre, no crea nada."""
    try:
        entrada = datetime.strptime(datos.fecha_entrada, "%Y-%m-%d")
        salida = datetime.strptime(datos.fecha_salida, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="Las fechas deben tener formato YYYY-MM-DD.")
    if salida <= entrada:
        raise HTTPException(
            status_code=422, detail="La fecha de salida debe ser posterior a la de entrada."
        )
    # Quitar duplicados conservando el orden.
    ids = list(dict.fromkeys(datos.habitacion_ids or []))
    if not ids:
        raise HTTPException(status_code=422, detail="Selecciona al menos una habitación.")
    if not Huesped.obtener_por_id(datos.huesped_id, hospedaje_id=hid):
        raise HTTPException(status_code=404, detail="Huesped no encontrado.")

    # Validar pertenencia + disponibilidad de TODAS antes de crear ninguna.
    habs = []
    no_disponibles = []
    for hab_id in ids:
        hab = _buscar_habitacion(hab_id, hid)
        if not hab:
            raise HTTPException(status_code=404, detail=f"Habitacion {hab_id} no encontrada.")
        if not Reserva.verificar_disponibilidad(hab_id, datos.fecha_entrada, datos.fecha_salida):
            no_disponibles.append(hab.numero)
        habs.append(hab)
    if no_disponibles:
        cuales = ", ".join(str(n) for n in no_disponibles)
        raise HTTPException(
            status_code=409,
            detail=f"No disponibles en esas fechas: habitación(es) {cuales}.",
        )

    grupo_id = uuid.uuid4().hex
    reservas = []
    for hab in habs:
        r = Reserva(
            huesped_id=datos.huesped_id,
            habitacion_id=hab.id,
            fecha_entrada=datos.fecha_entrada,
            fecha_salida=datos.fecha_salida,
            notas=datos.notas,
            estado="Confirmada",
            hospedaje_id=hid,
            grupo_id=grupo_id,
        )
        r.guardar()
        reservas.append(_a_dict(r))
    total = round(sum(r["total"] or 0 for r in reservas), 2)
    return {"grupo_id": grupo_id, "n": len(reservas), "total": total, "reservas": reservas}


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
        reserva.total = tarifas.total_estadia(
            hid, hab.id, hab.precio_base, datos.fecha_entrada, datos.fecha_salida
        )
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
                   r.id AS reserva_id,
                   f.id AS factura_id,
                   COALESCE(f.total, 0) AS total,
                   COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.factura_id = f.id), 0) AS pagado,
                   COALESCE((SELECT SUM(c.total) FROM consumos c WHERE c.reserva_id = r.id), 0) AS consumos_total
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
            d["consumos_total"] = round(d["consumos_total"] or 0, 2)
            d["total_con_consumos"] = round((d["total"] or 0) + d["consumos_total"], 2)
            d["saldo"] = round(d["total_con_consumos"] - (d["pagado"] or 0), 2)
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
    total_real = tarifas.total_estadia(
        hid, hab.id, hab.precio_base, fecha_real, reserva.fecha_salida
    )

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
        nuevo_subtotal = tarifas.total_estadia(
            hid, hab.id, hab.precio_base, estancia.fecha_checkin, fecha_salida_real
        )
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
        # Sumar consumos de la reserva
        cursor.execute(
            "SELECT COALESCE(SUM(total), 0) AS consumos_total FROM consumos WHERE reserva_id = ?",
            (estancia.reserva_id,),
        )
        consumos_total = cursor.fetchone()["consumos_total"] or 0
    finally:
        conn.close()
    total_con_consumos = round((factura.total or 0) + consumos_total, 2)
    saldo = round(total_con_consumos - pagado, 2)
    if saldo > 0:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Con la salida real ({noches_reales} noche(s)) el total es "
                f"S/ {total_con_consumos:.2f} (hospedaje S/ {factura.total:.2f} + consumos S/ {consumos_total:.2f}). "
                f"Falta cobrar S/ {saldo:.2f} antes de cerrar."
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
            ruta_pdf = generar_factura_pdf(
                factura, estancia, huesped, hab, reserva,
                hospedaje=_obtener_hospedaje(hid),
            )
            factura.pdf_generado = 1
            factura.guardar()
    except Exception:
        ruta_pdf = None

    return {
        "estancia_id": estancia.id,
        "estado": "finalizada",
        "noches": noches_reales,
        "total": factura.total,
        "consumos_total": round(consumos_total, 2),
        "total_con_consumos": total_con_consumos,
        "credito": round(max(0, pagado - total_con_consumos), 2),
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
    subtotal = tarifas.total_estadia(
        hid, hab.id, hab.precio_base, estancia.fecha_checkin, fecha_real
    )

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

    # Sumar consumos de la reserva al total
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COALESCE(SUM(total), 0) AS consumos_total FROM consumos WHERE reserva_id = ?",
            (estancia.reserva_id,),
        )
        consumos_total = cursor.fetchone()["consumos_total"] or 0
        cursor.execute(
            "SELECT COALESCE(SUM(monto), 0) AS pagado FROM pagos WHERE factura_id = ?",
            (factura.id,),
        )
        pagado = cursor.fetchone()["pagado"] or 0
    finally:
        conn.close()
    total_con_consumos = round(nuevo_total + consumos_total, 2)
    return {
        "estancia_id": estancia.id,
        "factura_id": factura.id,
        "fecha_checkout_real": fecha_real,
        "noches": noches,
        "subtotal": subtotal,
        "descuento": descuento,
        "total": nuevo_total,
        "consumos_total": round(consumos_total, 2),
        "total_con_consumos": total_con_consumos,
        "pagado": round(pagado, 2),
        "saldo": round(total_con_consumos - pagado, 2),
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
def descargar_factura_pdf(factura_id: int, tipo: str = "boleta", hid: int = Depends(auth.hospedaje_actual)):
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
        tipo_doc = "factura" if str(tipo).lower() == "factura" else "boleta"
        ruta = generar_factura_pdf(
            factura, estancia, huesped, habitacion, reserva,
            hospedaje=_obtener_hospedaje(hid),
            tipo_comprobante=tipo_doc,
        )
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


def _ultimo_periodo_hasta(hid):
    """Límite superior del último turno cerrado (para saber desde cuándo está
    'abierta' la caja actual). Devuelve un timestamp 'YYYY-MM-DD HH:MM:SS' o None
    si el hospedaje nunca cerró turno."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT MAX(periodo_hasta) AS m FROM cierres_turno WHERE hospedaje_id = ?",
            (hid,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        return row["m"] if hasattr(row, "keys") else row[0]
    finally:
        conn.close()


def _caja_data(hid, dia=None, desde=None, hasta=None, incluir_detalle=True):
    """Arqueo de pagos por método + total (+ detalle opcional). Dos modos:
      - por DÍA calendario: pasar dia='YYYY-MM-DD' (consulta histórica).
      - por VENTANA de turno: pasar desde/hasta ('YYYY-MM-DD HH:MM:SS'); suma los
        pagos con fecha > desde y fecha <= hasta (desde=None => desde el inicio).
    Se compara contra pagos.fecha, que se guarda con datetime.now() local."""
    cond = ["p.hospedaje_id = ?"]
    params = [hid]
    if dia:
        cond.append("substr(p.fecha, 1, 10) = ?")
        params.append(dia)
    else:
        if desde:
            cond.append("p.fecha > ?")
            params.append(desde)
        if hasta:
            cond.append("p.fecha <= ?")
            params.append(hasta)
    where = " AND ".join(cond)

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT p.metodo AS metodo, COALESCE(SUM(p.monto), 0) AS total, COUNT(*) AS n
            FROM pagos p
            WHERE {where}
            GROUP BY p.metodo
            ORDER BY total DESC
            """,
            tuple(params),
        )
        por_metodo = [
            {"metodo": r["metodo"] or "otro", "total": round(r["total"] or 0, 2), "n": r["n"]}
            for r in cursor.fetchall()
        ]
        detalle = []
        if incluir_detalle:
            # Detalle de los pagos (incluye quién los registró = auditoría).
            cursor.execute(
                f"""
                SELECT p.fecha, p.monto, p.metodo, p.referencia,
                       u.nombre AS usuario_nombre, h.nombre AS huesped
                FROM pagos p
                LEFT JOIN usuarios u  ON p.usuario_id = u.id
                LEFT JOIN facturas f  ON p.factura_id = f.id
                LEFT JOIN huespedes h ON f.huesped_id = h.id
                WHERE {where}
                ORDER BY p.fecha DESC
                """,
                tuple(params),
            )
            detalle = [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()
    total = round(sum(m["total"] for m in por_metodo), 2)
    num_pagos = sum(m["n"] for m in por_metodo)
    efectivo = round(sum(m["total"] for m in por_metodo if m["metodo"] == "efectivo"), 2)
    return {
        "fecha": dia,
        "total": total,
        "efectivo": efectivo,
        "num_pagos": num_pagos,
        "por_metodo": por_metodo,
        "detalle": detalle,
    }


@app.get("/api/recepcion/caja")
def caja_del_dia(fecha: str = "", hid: int = Depends(auth.hospedaje_actual)):
    """Caja de recepción. Por defecto (sin fecha) devuelve el TURNO ABIERTO: todo
    lo cobrado desde el último cierre de turno hasta ahora, SIN reiniciarse por día
    calendario (solo 'Cerrar turno' corta el periodo). Con ?fecha=YYYY-MM-DD
    devuelve el arqueo histórico de ese día (consulta de solo lectura)."""
    fecha = (fecha or "").strip()
    if fecha:
        try:
            datetime.strptime(fecha, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=422, detail="Fecha con formato YYYY-MM-DD.")
        data = _caja_data(hid, dia=fecha, incluir_detalle=True)
        data["modo"] = "dia"
        data["abierta_desde"] = None
        return data
    # Turno abierto: desde el último cierre (o desde el inicio) hasta ahora.
    desde = _ultimo_periodo_hasta(hid)
    ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    data = _caja_data(hid, desde=desde, hasta=ahora, incluir_detalle=True)
    data["modo"] = "turno"
    data["abierta_desde"] = desde
    return data


@app.post("/api/recepcion/cierres", status_code=201)
def crear_cierre_turno(
    datos: CierreTurnoDatos,
    actual: dict = Depends(auth.usuario_actual),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Cierra el TURNO ABIERTO: snapshot firmado de lo cobrado desde el último
    cierre hasta ahora (total y por método) + efectivo contado y diferencia, con
    quién y cuándo. No bloquea pagos posteriores; el siguiente turno arranca desde
    este cierre. (datos.fecha se ignora para la ventana; el turno se define por el
    último cierre → ahora.)"""
    desde = _ultimo_periodo_hasta(hid)
    hasta = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    dia = hasta[:10]  # fecha de cierre (solo display)

    caja = _caja_data(hid, desde=desde, hasta=hasta, incluir_detalle=False)
    contado = datos.efectivo_contado
    if contado is not None and contado < 0:
        raise HTTPException(status_code=422, detail="El efectivo contado no puede ser negativo.")
    diferencia = round(contado - caja["efectivo"], 2) if contado is not None else None

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO cierres_turno
                (hospedaje_id, usuario_id, usuario_nombre, fecha, total_sistema,
                 efectivo_sistema, efectivo_contado, diferencia, num_pagos, por_metodo, notas,
                 periodo_desde, periodo_hasta)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                hid, actual.get("id"), actual.get("nombre", ""), dia,
                caja["total"], caja["efectivo"], contado, diferencia,
                caja["num_pagos"], json.dumps(caja["por_metodo"]), (datos.notas or "").strip(),
                desde, hasta,
            ),
        )
        nuevo_id = cursor.lastrowid
        conn.commit()
    finally:
        conn.close()
    return {
        "id": nuevo_id,
        "fecha": dia,
        "usuario_nombre": actual.get("nombre", ""),
        "total_sistema": caja["total"],
        "efectivo_sistema": caja["efectivo"],
        "efectivo_contado": contado,
        "diferencia": diferencia,
        "num_pagos": caja["num_pagos"],
        "por_metodo": caja["por_metodo"],
        "notas": (datos.notas or "").strip(),
        "periodo_desde": desde,
        "periodo_hasta": hasta,
    }


@app.get("/api/recepcion/cierres")
def listar_cierres_turno(
    limite: int = 30,
    _actual: dict = Depends(auth.usuario_actual),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Historial de cierres de turno del hospedaje (más recientes primero)."""
    limite = max(1, min(limite, 100))
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, usuario_nombre, fecha, creado_en, total_sistema,
                   efectivo_sistema, efectivo_contado, diferencia, num_pagos, por_metodo, notas,
                   periodo_desde, periodo_hasta
            FROM cierres_turno
            WHERE hospedaje_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (hid, limite),
        )
        cierres = []
        for r in cursor.fetchall():
            c = dict(r)
            try:
                c["por_metodo"] = json.loads(c.get("por_metodo") or "[]")
            except (ValueError, TypeError):
                c["por_metodo"] = []
            cierres.append(c)
    finally:
        conn.close()
    return cierres


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


@app.get("/api/notificaciones")
def notificaciones(
    actual: dict = Depends(auth.usuario_actual),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Centro de notificaciones: eventos ACCIONABLES calculados del estado actual
    (no un buzón persistido). Cada uno con id estable (para marcar leído en el
    cliente), prioridad (critica/alta/media/baja) y ruta a dónde ir."""
    hoy = datetime.now().strftime("%Y-%m-%d")
    es_admin = actual.get("rol") in ("admin", "superadmin")
    notis = []
    conn = get_connection()
    try:
        cursor = conn.cursor()

        # 1) Reservas por confirmar (Pendiente; muchas llegan por el link público).
        cursor.execute(
            """SELECT r.id, h.nombre AS huesped, hab.numero AS hab, r.fecha_entrada, r.origen
               FROM reservas r JOIN huespedes h ON r.huesped_id = h.id
               JOIN habitaciones hab ON r.habitacion_id = hab.id
               WHERE r.estado = 'Pendiente' AND r.hospedaje_id = ?
               ORDER BY r.fecha_entrada""",
            (hid,),
        )
        for r in [dict(x) for x in cursor.fetchall()]:
            delLink = " · vino del link" if r.get("origen") == "publico" else ""
            notis.append({
                "id": f"pendiente-{r['id']}", "tipo": "reserva", "prioridad": "alta",
                "titulo": "Reserva por confirmar",
                "texto": f"{r['huesped']} · Hab. {r['hab']} · llega {r['fecha_entrada']}{delLink}",
                "ruta": "reservas", "fecha": r["fecha_entrada"],
            })

        # 2) Salidas vencidas (estancia activa cuyo checkout esperado ya pasó).
        cursor.execute(
            """SELECT e.id, h.nombre AS huesped, hab.numero AS hab,
                      e.fecha_checkout_esperado AS fce
               FROM estancias e JOIN huespedes h ON e.huesped_id = h.id
               JOIN habitaciones hab ON e.habitacion_id = hab.id
               WHERE e.estado = 'activa' AND e.hospedaje_id = ?
               AND e.fecha_checkout_esperado < ?
               ORDER BY e.fecha_checkout_esperado""",
            (hid, hoy),
        )
        for r in [dict(x) for x in cursor.fetchall()]:
            notis.append({
                "id": f"vencida-{r['id']}", "tipo": "recepcion", "prioridad": "critica",
                "titulo": "Salida vencida",
                "texto": f"{r['huesped']} · Hab. {r['hab']} debió salir el {r['fce']}",
                "ruta": "recepcion", "fecha": r["fce"],
            })

        # 3) Llegadas de hoy (confirmadas con entrada = hoy y sin check-in aún).
        cursor.execute(
            """SELECT r.id, h.nombre AS huesped, hab.numero AS hab
               FROM reservas r JOIN huespedes h ON r.huesped_id = h.id
               JOIN habitaciones hab ON r.habitacion_id = hab.id
               WHERE r.estado = 'Confirmada' AND r.hospedaje_id = ? AND r.fecha_entrada = ?
               AND NOT EXISTS (SELECT 1 FROM estancias e WHERE e.reserva_id = r.id)""",
            (hid, hoy),
        )
        for r in [dict(x) for x in cursor.fetchall()]:
            notis.append({
                "id": f"checkin-{r['id']}-{hoy}", "tipo": "reserva", "prioridad": "media",
                "titulo": "Check-in hoy", "texto": f"{r['huesped']} · Hab. {r['hab']}",
                "ruta": "recepcion", "fecha": hoy,
            })

        # 4) Salidas de hoy (con saldo pendiente si aplica → sube a alta).
        cursor.execute(
            """SELECT e.id, h.nombre AS huesped, hab.numero AS hab,
                      COALESCE(f.total, 0) AS total,
                      COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.factura_id = f.id), 0) AS pagado
               FROM estancias e JOIN huespedes h ON e.huesped_id = h.id
               JOIN habitaciones hab ON e.habitacion_id = hab.id
               LEFT JOIN facturas f ON f.estancia_id = e.id
               WHERE e.estado = 'activa' AND e.hospedaje_id = ? AND e.fecha_checkout_esperado = ?""",
            (hid, hoy),
        )
        for r in [dict(x) for x in cursor.fetchall()]:
            saldo = round((r["total"] or 0) - (r["pagado"] or 0), 2)
            notis.append({
                "id": f"checkout-{r['id']}-{hoy}", "tipo": "recepcion",
                "prioridad": "alta" if saldo > 0 else "media",
                "titulo": "Check-out hoy",
                "texto": f"{r['huesped']} · Hab. {r['hab']}" + (f" · debe S/ {saldo:.2f}" if saldo > 0 else ""),
                "ruta": "recepcion", "fecha": hoy,
            })

        # 5) Suscripción por vencer / vencida (solo admin).
        if es_admin:
            cursor.execute("SELECT fecha_expira FROM hospedajes WHERE id = ?", (hid,))
            row = cursor.fetchone()
            fe = (row["fecha_expira"] if hasattr(row, "keys") else row[0]) if row else None
            dias = _dias_restantes(fe)
            if dias is not None and dias <= 7:
                if dias < 0:
                    notis.append({
                        "id": "plan-vencido", "tipo": "sistema", "prioridad": "critica",
                        "titulo": "Suscripción vencida",
                        "texto": f"Venció hace {abs(dias)} día(s). Renueva para no perder acceso.",
                        "ruta": "configuracion", "fecha": hoy,
                    })
                else:
                    notis.append({
                        "id": "plan-porvencer", "tipo": "sistema", "prioridad": "alta",
                        "titulo": "Suscripción por vencer",
                        "texto": "Vence hoy." if dias == 0 else f"Vence en {dias} día(s).",
                        "ruta": "configuracion", "fecha": hoy,
                    })

            # Stock bajo / agotado en el inventario.
            try:
                cursor.execute(
                    "SELECT id, nombre, stock, stock_minimo, unidad FROM inventario_items "
                    "WHERE hospedaje_id = ? AND activo = 1 AND stock_minimo > 0 AND stock <= stock_minimo",
                    (hid,),
                )
                for r in [dict(x) for x in cursor.fetchall()]:
                    agotado = (r["stock"] or 0) <= 0
                    notis.append({
                        "id": f"stock-{r['id']}", "tipo": "inventario",
                        "prioridad": "critica" if agotado else "alta",
                        "titulo": "Producto agotado" if agotado else "Stock bajo",
                        "texto": f"{r['nombre']}: {r['stock']:g} {r['unidad']} (mínimo {r['stock_minimo']:g})",
                        "ruta": "inventario", "fecha": hoy,
                    })
            except Exception:
                pass  # si la tabla aún no existe, no bloquear las notificaciones
    finally:
        conn.close()

    orden = {"critica": 0, "alta": 1, "media": 2, "baja": 3}
    notis.sort(key=lambda n: (orden.get(n["prioridad"], 9), n.get("fecha", "")))
    return {"notificaciones": notis, "total": len(notis)}


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
@app.get("/api/reportes/periodos")
def reportes_periodos(
    _admin: dict = Depends(auth.solo_admin),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Periodo mínimo con sentido para los selectores de Reportes: el mes/año más
    antiguo con actividad del hospedaje (pagos o reservas), con fallback a la fecha
    de creación del hospedaje y, si no hay nada, al mes actual. El máximo (año/mes
    actual) lo calcula el frontend. Evita ofrecer años previos a la existencia del
    negocio o meses futuros."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        candidatos = []

        cursor.execute(
            "SELECT MIN(substr(fecha, 1, 7)) AS m FROM pagos WHERE hospedaje_id = ?",
            (hid,),
        )
        r = cursor.fetchone()
        if r and (r["m"] if hasattr(r, "keys") else r[0]):
            candidatos.append((r["m"] if hasattr(r, "keys") else r[0]))

        cursor.execute(
            "SELECT MIN(substr(fecha_entrada, 1, 7)) AS m FROM reservas WHERE hospedaje_id = ?",
            (hid,),
        )
        r = cursor.fetchone()
        if r and (r["m"] if hasattr(r, "keys") else r[0]):
            candidatos.append((r["m"] if hasattr(r, "keys") else r[0]))

        cursor.execute(
            "SELECT COALESCE(fecha_inicio, creado_en) AS c FROM hospedajes WHERE id = ?",
            (hid,),
        )
        r = cursor.fetchone()
        creacion = (r["c"] if hasattr(r, "keys") else r[0]) if r else None
        if creacion:
            candidatos.append(str(creacion)[:7])
    finally:
        conn.close()

    # 'YYYY-MM' comparables como texto; el menor es el más antiguo.
    candidatos = [c for c in candidatos if c and len(c) >= 7]
    minimo = min(candidatos) if candidatos else datetime.now().strftime("%Y-%m")
    try:
        anio_min, mes_min = int(minimo[:4]), int(minimo[5:7])
    except ValueError:
        ahora = datetime.now()
        anio_min, mes_min = ahora.year, ahora.month
    return {"anio_min": anio_min, "mes_min": mes_min}


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


# --------------------------------------------------------------------------- #
#  Detalle de reserva + Consumos + Servicios de habitacion
# --------------------------------------------------------------------------- #

@app.get("/api/reservas/{reserva_id}/detalle")
def reserva_detalle(reserva_id: int, hid: int = Depends(auth.hospedaje_actual)):
    """Devuelve el detalle completo de una reserva con estancia, factura, pagos y consumos."""
    conn = get_connection()
    try:
        cursor = conn.cursor()

        # Reserva
        cursor.execute(
            "SELECT * FROM reservas WHERE id = ? AND hospedaje_id = ?",
            (reserva_id, hid),
        )
        row_res = cursor.fetchone()
        if not row_res:
            raise HTTPException(status_code=404, detail="Reserva no encontrada.")
        reserva = dict(row_res)

        # Huesped
        cursor.execute(
            "SELECT id, nombre, email, telefono, documento, tipo_documento FROM huespedes WHERE id = ?",
            (reserva["huesped_id"],),
        )
        huesped = dict(cursor.fetchone() or {})

        # Habitacion
        cursor.execute(
            "SELECT id, numero, tipo, precio_base FROM habitaciones WHERE id = ?",
            (reserva["habitacion_id"],),
        )
        habitacion = dict(cursor.fetchone() or {})

        # Estancia (puede no existir si no hay check-in)
        cursor.execute(
            "SELECT * FROM estancias WHERE reserva_id = ? ORDER BY id DESC LIMIT 1",
            (reserva_id,),
        )
        row_est = cursor.fetchone()
        estancia = None
        if row_est:
            estancia = dict(row_est)
            # Nombre del usuario que hizo check-in
            if estancia.get("usuario_checkin_id"):
                cursor.execute(
                    "SELECT nombre FROM usuarios WHERE id = ?",
                    (estancia["usuario_checkin_id"],),
                )
                u = cursor.fetchone()
                estancia["usuario_checkin_nombre"] = u["nombre"] if u else ""

        # Factura + pagos (puede no existir)
        factura = None
        pagos = []
        if estancia:
            cursor.execute(
                "SELECT * FROM facturas WHERE estancia_id = ? ORDER BY id DESC LIMIT 1",
                (estancia["id"],),
            )
            row_fac = cursor.fetchone()
            if row_fac:
                factura = dict(row_fac)
                # Pagos de esta factura
                cursor.execute(
                    "SELECT * FROM pagos WHERE factura_id = ? ORDER BY fecha",
                    (factura["id"],),
                )
                pagos = [dict(p) for p in cursor.fetchall()]
                factura["pagos"] = pagos
                factura["saldo"] = round(factura["total"] - sum(p["monto"] for p in pagos), 2)

        # Consumos (servicios y pedidos de esta reserva)
        cursor.execute(
            "SELECT * FROM consumos WHERE reserva_id = ? ORDER BY creado_en",
            (reserva_id,),
        )
        consumos = [dict(c) for c in cursor.fetchall()]

        return {
            "reserva": reserva,
            "huesped": huesped,
            "habitacion": habitacion,
            "estancia": estancia,
            "factura": factura,
            "consumos": consumos,
        }
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
#  Consumos (servicios / pedidos asignados a una reserva)
# --------------------------------------------------------------------------- #

@app.get("/api/consumos")
def listar_consumos(reserva_id: int = 0, hid: int = Depends(auth.hospedaje_actual)):
    consumos = Consumo.obtener_por_reserva(reserva_id, hospedaje_id=hid) if reserva_id else []
    return [_a_dict(c) for c in consumos]


def _descontar_inventario_por_venta(cursor, hid, item_id, cantidad, usuario_id, usuario_nombre):
    """Descuenta stock de un item por una venta/consumo (nunca baja de 0) y
    registra el movimiento 'salida'. No bloquea la venta si falta stock."""
    cursor.execute(
        "SELECT stock FROM inventario_items WHERE id = ? AND hospedaje_id = ? AND activo = 1",
        (item_id, hid),
    )
    row = cursor.fetchone()
    if not row:
        return
    stock = float((row["stock"] if hasattr(row, "keys") else row[0]) or 0)
    descontar = min(float(cantidad), stock)
    if descontar <= 0:
        return
    nuevo = stock - descontar
    cursor.execute(
        "UPDATE inventario_items SET stock = ? WHERE id = ? AND hospedaje_id = ?",
        (nuevo, item_id, hid),
    )
    cursor.execute(
        "INSERT INTO inventario_movimientos "
        "(hospedaje_id, item_id, tipo, cantidad, stock_resultante, motivo, usuario_id, usuario_nombre) "
        "VALUES (?, ?, 'salida', ?, ?, 'Venta a huésped', ?, ?)",
        (hid, item_id, descontar, nuevo, usuario_id, usuario_nombre),
    )


@app.post("/api/consumos", status_code=201)
def crear_consumo(
    datos: ConsumoNuevo,
    actual: dict = Depends(auth.usuario_actual),
    hid: int = Depends(auth.hospedaje_actual),
):
    if not datos.descripcion.strip():
        raise HTTPException(status_code=422, detail="La descripcion es obligatoria.")
    if datos.tipo not in ("servicio", "pedido"):
        raise HTTPException(status_code=422, detail="El tipo debe ser 'servicio' o 'pedido'.")
    if datos.cantidad < 1:
        raise HTTPException(status_code=422, detail="La cantidad debe ser al menos 1.")
    reserva = Reserva.obtener_por_id(datos.reserva_id, hospedaje_id=hid)
    if not reserva:
        raise HTTPException(status_code=404, detail="Reserva no encontrada.")
    consumo = Consumo(
        reserva_id=datos.reserva_id,
        tipo=datos.tipo,
        descripcion=datos.descripcion.strip(),
        cantidad=datos.cantidad,
        precio_unitario=datos.precio_unitario,
        total=datos.cantidad * datos.precio_unitario,
        notas=datos.notas,
        hospedaje_id=hid,
    )
    consumo.guardar()

    # Auto-descuento de inventario: si el consumo viene de un producto del
    # catálogo enlazado a un item, se descuenta su stock (no rompe la venta).
    if datos.servicio_id:
        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT inventario_item_id FROM servicios_habitacion WHERE id = ? AND hospedaje_id = ?",
                (datos.servicio_id, hid),
            )
            r = cur.fetchone()
            iid = (r["inventario_item_id"] if hasattr(r, "keys") else r[0]) if r else None
            if iid:
                _descontar_inventario_por_venta(
                    cur, hid, iid, datos.cantidad, actual.get("id"), actual.get("nombre", "")
                )
                conn.commit()
        except Exception:
            pass  # el descuento de inventario no debe romper el registro del consumo
        finally:
            conn.close()

    return _a_dict(consumo)


@app.delete("/api/consumos/{consumo_id}")
def eliminar_consumo(consumo_id: int, hid: int = Depends(auth.hospedaje_actual)):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT c.id FROM consumos c
               JOIN reservas r ON c.reserva_id = r.id
               WHERE c.id = ? AND r.hospedaje_id = ?""",
            (consumo_id, hid),
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Consumo no encontrado.")
        cursor.execute("DELETE FROM consumos WHERE id = ?", (consumo_id,))
        conn.commit()
    finally:
        conn.close()
    return {"id": consumo_id, "eliminado": True}


# --------------------------------------------------------------------------- #
#  Catalogo de servicios de habitacion
# --------------------------------------------------------------------------- #

def _guardar_enlace_inventario(servicio_id, item_id, hid):
    """Guarda (o quita, si item_id es 0/None) el enlace de un servicio del
    catálogo con un item de inventario."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE servicios_habitacion SET inventario_item_id = ? WHERE id = ? AND hospedaje_id = ?",
            (item_id or None, servicio_id, hid),
        )
        conn.commit()
    finally:
        conn.close()


@app.get("/api/servicios-habitacion")
def listar_servicios(hid: int = Depends(auth.hospedaje_actual)):
    servicios = [_a_dict(s) for s in ServicioHabitacion.obtener_todos(hospedaje_id=hid)]
    # Adjuntar el enlace con inventario (id + nombre del item) para la UI.
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT s.id AS sid, s.inventario_item_id AS iid, i.nombre AS inv_nombre "
            "FROM servicios_habitacion s "
            "LEFT JOIN inventario_items i ON i.id = s.inventario_item_id "
            "WHERE s.hospedaje_id = ?",
            (hid,),
        )
        enlaces = {}
        for r in cur.fetchall():
            r = dict(r)
            enlaces[r["sid"]] = (r["iid"], r["inv_nombre"])
    finally:
        conn.close()
    for sv in servicios:
        iid, inv_nombre = enlaces.get(sv["id"], (None, None))
        sv["inventario_item_id"] = iid or 0
        sv["inventario_nombre"] = inv_nombre
    return servicios


@app.post("/api/servicios-habitacion", status_code=201)
def crear_servicio(
    datos: ServicioHabitacionNuevo,
    _admin: dict = Depends(auth.solo_admin),
    hid: int = Depends(auth.hospedaje_actual),
):
    if not datos.nombre.strip():
        raise HTTPException(status_code=422, detail="El nombre es obligatorio.")
    tipo = datos.tipo if datos.tipo in ("producto", "servicio") else "producto"
    s = ServicioHabitacion(
        nombre=datos.nombre.strip(),
        categoria=datos.categoria,
        subcategoria=datos.subcategoria,
        precio=datos.precio,
        hospedaje_id=hid,
        tipo=tipo,
    )
    s.guardar()
    _guardar_enlace_inventario(s.id, datos.inventario_item_id, hid)
    out = _a_dict(s)
    out["inventario_item_id"] = datos.inventario_item_id or 0
    return out


@app.put("/api/servicios-habitacion/{servicio_id}")
def editar_servicio(
    servicio_id: int,
    datos: ServicioHabitacionEdit,
    _admin: dict = Depends(auth.solo_admin),
    hid: int = Depends(auth.hospedaje_actual),
):
    s = ServicioHabitacion.obtener_por_id(servicio_id, hospedaje_id=hid)
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado.")
    s.nombre = datos.nombre.strip()
    s.categoria = datos.categoria
    s.subcategoria = datos.subcategoria
    s.precio = datos.precio
    s.activo = datos.activo
    s.tipo = datos.tipo if datos.tipo in ("producto", "servicio") else "producto"
    s.guardar()
    _guardar_enlace_inventario(servicio_id, datos.inventario_item_id, hid)
    out = _a_dict(s)
    out["inventario_item_id"] = datos.inventario_item_id or 0
    return out


@app.delete("/api/servicios-habitacion/{servicio_id}")
def eliminar_servicio(
    servicio_id: int,
    _admin: dict = Depends(auth.solo_admin),
    hid: int = Depends(auth.hospedaje_actual),
):
    s = ServicioHabitacion.obtener_por_id(servicio_id, hospedaje_id=hid)
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado.")
    s.eliminar()
    return {"id": servicio_id, "eliminado": True}


# --------------------------------------------------------------------------- #
#  Tarifas (precios por temporada / fin de semana)
# --------------------------------------------------------------------------- #
@app.get("/api/tarifas")
def listar_tarifas(
    _admin: dict = Depends(auth.solo_admin),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Reglas de tarifa del hospedaje (solo admin las gestiona)."""
    return tarifas.obtener_reglas(hid)


@app.post("/api/tarifas", status_code=201)
def crear_tarifa(
    datos: TarifaNueva,
    _admin: dict = Depends(auth.solo_admin),
    hid: int = Depends(auth.hospedaje_actual),
):
    """Crea una regla de tarifa. Debe tener al menos una condición (rango de
    fechas o días de la semana) y un efecto (precio absoluto o ajuste %)."""
    fi = (datos.fecha_inicio or "").strip()
    ff = (datos.fecha_fin or "").strip()
    dias = (datos.dias_semana or "").strip()
    for f in (fi, ff):
        if f:
            try:
                datetime.strptime(f, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=422, detail="Fechas con formato YYYY-MM-DD.")
    if fi and ff and ff < fi:
        raise HTTPException(status_code=422, detail="La fecha fin no puede ser anterior a la de inicio.")
    if not fi and not dias:
        raise HTTPException(
            status_code=422,
            detail="Indica un rango de fechas o unos días de la semana para la tarifa.",
        )
    if (datos.precio is None or datos.precio <= 0) and not datos.ajuste_pct:
        raise HTTPException(
            status_code=422,
            detail="Indica un precio por noche o un ajuste porcentual.",
        )
    if datos.precio is not None and datos.precio < 0:
        raise HTTPException(status_code=422, detail="El precio no puede ser negativo.")
    # La habitación (si se indica) debe ser del hospedaje.
    if datos.habitacion_id and not _buscar_habitacion(datos.habitacion_id, hid):
        raise HTTPException(status_code=404, detail="Habitacion no encontrada.")

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO tarifas
                 (hospedaje_id, nombre, fecha_inicio, fecha_fin, dias_semana,
                  habitacion_id, precio, ajuste_pct)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (hid, (datos.nombre or "").strip(), fi or None, ff or None,
             dias or None, datos.habitacion_id, datos.precio, datos.ajuste_pct),
        )
        nueva_id = cursor.lastrowid
        conn.commit()
    finally:
        conn.close()
    return {"id": nueva_id, **datos.dict()}


@app.delete("/api/tarifas/{tarifa_id}")
def eliminar_tarifa(
    tarifa_id: int,
    _admin: dict = Depends(auth.solo_admin),
    hid: int = Depends(auth.hospedaje_actual),
):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM tarifas WHERE id = ? AND hospedaje_id = ?", (tarifa_id, hid)
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Tarifa no encontrada.")
        cursor.execute("DELETE FROM tarifas WHERE id = ?", (tarifa_id,))
        conn.commit()
    finally:
        conn.close()
    return {"id": tarifa_id, "eliminada": True}
