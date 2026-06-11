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
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

import database
import auth
from database import get_connection
from modelos import Habitacion, Huesped, Reserva, Estancia, Factura, Pago
from utils import generar_factura_pdf

# Al importar database se crean las tablas y los datos de ejemplo si faltan.
database.crear_tablas()
# Crear tabla de usuarios y un admin por defecto si no existe ninguno.
auth.crear_tabla_usuarios()

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


# --------------------------------------------------------------------------- #
#  Esquemas de entrada (lo que el frontend envia). Pydantic valida tipos.
# --------------------------------------------------------------------------- #
class ReservaNueva(BaseModel):
    huesped_id: int
    habitacion_id: int
    fecha_entrada: str = Field(..., description="Formato YYYY-MM-DD")
    fecha_salida: str = Field(..., description="Formato YYYY-MM-DD")
    notas: str = ""


class HuespedDatos(BaseModel):
    nombre: str
    email: str = ""
    telefono: str = ""
    documento: str = ""
    direccion: str = ""


class HabitacionDatos(BaseModel):
    numero: str
    tipo: str
    precio_base: float
    estado_limpieza: str = "Limpia"
    estado: str = "disponible"


class CheckinIn(BaseModel):
    reserva_id: int


class CheckoutIn(BaseModel):
    estancia_id: int


class PagoNuevo(BaseModel):
    factura_id: int
    monto: float
    metodo: str = "efectivo"
    referencia: str = ""


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
        cursor.execute(
            "INSERT INTO hospedajes (nombre, plan, estado, fecha_expira) VALUES (?, ?, ?, ?)",
            (nombre_h, "trial", "prueba", fecha_expira),
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
        cursor.execute(
            "INSERT INTO hospedajes (nombre, plan, estado, fecha_expira) VALUES (?, ?, ?, ?)",
            (f"Hospedaje de {nombre}", "trial", "prueba", fecha_expira),
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
        cursor.execute(
            "INSERT INTO hospedajes (nombre, plan, estado, fecha_expira) VALUES (?, ?, ?, ?)",
            (datos.nombre.strip(), datos.plan, datos.estado, datos.fecha_expira or None),
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
#  Habitaciones (CRUD)
# --------------------------------------------------------------------------- #
@app.get("/api/habitaciones")
def listar_habitaciones(solo_activas: bool = True, hid: int = Depends(auth.hospedaje_actual)):
    return [
        _a_dict(h)
        for h in Habitacion.obtener_todas(solo_activas=solo_activas, hospedaje_id=hid)
    ]


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


@app.post("/api/huespedes", status_code=201)
def crear_huesped(datos: HuespedDatos, hid: int = Depends(auth.hospedaje_actual)):
    if not datos.nombre.strip():
        raise HTTPException(status_code=422, detail="El nombre es obligatorio.")
    huesped = Huesped(
        nombre=datos.nombre.strip(),
        email=datos.email.strip(),
        telefono=datos.telefono.strip(),
        documento=datos.documento.strip(),
        direccion=datos.direccion.strip(),
        hospedaje_id=hid,
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
    huesped.nombre = datos.nombre.strip()
    huesped.email = datos.email.strip()
    huesped.telefono = datos.telefono.strip()
    huesped.documento = datos.documento.strip()
    huesped.direccion = datos.direccion.strip()
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
                   h.nombre AS huesped, hab.numero AS habitacion, hab.tipo AS tipo
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


@app.post("/api/reservas/{reserva_id}/cancelar")
def cancelar_reserva(reserva_id: int, hid: int = Depends(auth.hospedaje_actual)):
    reserva = Reserva.obtener_por_id(reserva_id, hospedaje_id=hid)
    if not reserva:
        raise HTTPException(status_code=404, detail="Reserva no encontrada.")
    reserva.cancelar()
    return {"id": reserva_id, "estado": reserva.estado}


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
                   f.id AS factura_id,
                   COALESCE(f.total, 0) AS total,
                   COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.factura_id = f.id), 0) AS pagado
            FROM estancias e
            JOIN huespedes h    ON e.huesped_id = h.id
            JOIN habitaciones hab ON e.habitacion_id = hab.id
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
def hacer_checkin(datos: CheckinIn, hid: int = Depends(auth.hospedaje_actual)):
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
    estancia = Estancia(
        reserva_id=reserva.id,
        huesped_id=reserva.huesped_id,
        habitacion_id=reserva.habitacion_id,
        fecha_checkin=hoy,
        fecha_checkout_esperado=reserva.fecha_salida,
        estado="activa",
        hospedaje_id=hid,
    )
    estancia.guardar()

    factura = Factura(
        estancia_id=estancia.id,
        huesped_id=reserva.huesped_id,
        fecha_emision=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        subtotal=reserva.total,
        impuestos=0.0,
        total=reserva.total,
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
        "total": factura.total,
    }


@app.post("/api/recepcion/checkout")
def hacer_checkout(datos: CheckoutIn, hid: int = Depends(auth.hospedaje_actual)):
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
    )

    factura = Factura.obtener_por_estancia(estancia.id)
    if not factura:
        raise HTTPException(status_code=409, detail="La estancia no tiene factura.")

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
    saldo = round(factura.total - pagado, 2)
    if saldo > 0:
        raise HTTPException(
            status_code=409,
            detail=f"No se puede cerrar: queda un saldo pendiente de S/ {saldo:.2f}.",
        )

    reserva = Reserva.obtener_por_id(estancia.reserva_id, hospedaje_id=hid)
    hab = next(
        (h for h in Habitacion.obtener_todas(hospedaje_id=hid) if h.id == estancia.habitacion_id), None
    )
    huesped = Huesped.obtener_por_id(estancia.huesped_id, hospedaje_id=hid)

    estancia.finalizar(datetime.now().strftime("%Y-%m-%d"))
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

    return {"estancia_id": estancia.id, "estado": "finalizada", "pdf": ruta_pdf}


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
                   COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.factura_id = f.id), 0) AS pagado
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
            "SELECT id, monto, metodo, fecha, referencia FROM pagos WHERE factura_id = ? ORDER BY fecha",
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


@app.post("/api/pagos", status_code=201)
def registrar_pago(datos: PagoNuevo, hid: int = Depends(auth.hospedaje_actual)):
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


# --------------------------------------------------------------------------- #
#  Dashboard: resumen para las tarjetas de estadisticas
# --------------------------------------------------------------------------- #
@app.get("/api/dashboard/resumen")
def dashboard_resumen(hid: int = Depends(auth.hospedaje_actual)):
    conn = get_connection()
    try:
        cursor = conn.cursor()

        cursor.execute(
            "SELECT estado, COUNT(*) AS n FROM habitaciones WHERE activa = 1 AND hospedaje_id = ? GROUP BY estado",
            (hid,),
        )
        por_estado = {row["estado"]: row["n"] for row in cursor.fetchall()}

        cursor.execute(
            "SELECT COUNT(*) AS n FROM habitaciones WHERE activa = 1 AND hospedaje_id = ?",
            (hid,),
        )
        total_habitaciones = cursor.fetchone()["n"]

        ocupadas = por_estado.get("ocupada", 0)
        disponibles = por_estado.get("disponible", 0)
        mantenimiento = por_estado.get("mantenimiento", 0)
        ocupacion_pct = round((ocupadas / total_habitaciones) * 100) if total_habitaciones else 0

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
            "disponibles": disponibles,
            "mantenimiento": mantenimiento,
            "ocupacion_pct": ocupacion_pct,
            "estancias_activas": estancias_activas,
            "checkins_pendientes": checkins_pendientes,
            "ingresos_mes": round(ingresos_mes, 2),
        }
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
#  Reportes: ocupacion diaria por mes.
#  Reusa la MISMA logica de calculo que views/reportes.py (la app de escritorio):
#  por cada dia del mes cuenta cuantas habitaciones estan ocupadas por una
#  reserva no cancelada, dividido entre el total de habitaciones activas.
#  La noche se cuenta de entrada hasta salida-1 (el dia de salida no ocupa).
# --------------------------------------------------------------------------- #
@app.get("/api/reportes/ocupacion")
def reporte_ocupacion(anio: int, mes: int, hid: int = Depends(auth.hospedaje_actual)):
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
            SELECT fecha_entrada, fecha_salida
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

    ocupadas_por_dia = [0] * num_dias
    for row in reservas:
        entrada = datetime.strptime(row["fecha_entrada"], "%Y-%m-%d")
        salida = datetime.strptime(row["fecha_salida"], "%Y-%m-%d")
        dia = max(entrada, datetime(anio, mes, 1))
        fin_mes = datetime(anio, mes, num_dias)
        while dia <= min(salida - timedelta(days=1), fin_mes):
            ocupadas_por_dia[dia.day - 1] += 1
            dia += timedelta(days=1)

    dias = []
    suma_pct = 0.0
    for i, ocupadas in enumerate(ocupadas_por_dia):
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
