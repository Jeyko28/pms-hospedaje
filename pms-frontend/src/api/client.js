/**
 * client.js
 * Cliente HTTP minimo para hablar con la API FastAPI.
 *
 * Centraliza la URL base y el manejo de errores: si manana la API cambia
 * de direccion, se toca solo aqui (un unico punto de cambio).
 */

// En desarrollo usa localhost; en produccion (deploy) toma la URL del backend
// de la variable de entorno VITE_API_URL definida en el hosting (Vercel).
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const CLAVE_TOKEN = "pms-token";

// --- Gestion del token JWT (se guarda en localStorage para sobrevivir recargas) ---
export const tokenStore = {
  get: () => localStorage.getItem(CLAVE_TOKEN),
  set: (t) => localStorage.setItem(CLAVE_TOKEN, t),
  clear: () => localStorage.removeItem(CLAVE_TOKEN),
};

// Callback que el contexto de auth registra para reaccionar a un 401
// (sesion expirada/invalida) -> forzar logout en toda la app.
let alExpirar = null;
export function registrarManejadorSesion(fn) {
  alExpirar = fn;
}

function cabeceras(conJson) {
  const h = {};
  if (conJson) h["Content-Type"] = "application/json";
  const t = tokenStore.get();
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

async function manejarRespuesta(respuesta) {
  let datos = null;
  try {
    datos = await respuesta.json();
  } catch (_) {
    /* sin cuerpo */
  }
  if (respuesta.status === 401) {
    // Token ausente, invalido o expirado: cerrar sesion.
    tokenStore.clear();
    if (alExpirar) alExpirar();
    throw new Error(
      (datos && datos.detail) || "Tu sesion expiro. Inicia sesion de nuevo."
    );
  }
  if (!respuesta.ok) {
    const mensaje =
      (datos && (datos.detail || datos.message)) ||
      `Error del servidor (${respuesta.status}).`;
    throw new Error(
      typeof mensaje === "string" ? mensaje : "No se pudo completar la operacion."
    );
  }
  return datos;
}

async function get(path) {
  let respuesta;
  try {
    respuesta = await fetch(`${BASE_URL}${path}`, { headers: cabeceras(false) });
  } catch (e) {
    throw new Error(
      "No se pudo conectar con el servidor. Verifica que la API este encendida."
    );
  }
  return manejarRespuesta(respuesta);
}

// Helper compartido por POST/PUT/DELETE: envia JSON con el token y propaga
// el mensaje de error legible que devuelve la API en "detail".
async function enviar(metodo, path, body) {
  let respuesta;
  try {
    respuesta = await fetch(`${BASE_URL}${path}`, {
      method: metodo,
      headers: cabeceras(true),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error(
      "No se pudo conectar con el servidor. Verifica que la API este encendida."
    );
  }
  return manejarRespuesta(respuesta);
}

const post = (path, body) => enviar("POST", path, body);
const put = (path, body) => enviar("PUT", path, body);
const del = (path) => enviar("DELETE", path);

export const api = {
  // Lecturas
  resumenDashboard: () => get("/api/dashboard/resumen"),
  agendaDashboard: () => get("/api/dashboard/agenda"),
  habitaciones: () => get("/api/habitaciones"),
  huespedes: () => get("/api/huespedes"),
  reservas: () => get("/api/reservas"),

  // Recepcion
  reservasPendientes: () => get("/api/recepcion/reservas-pendientes"),
  estanciasActivas: () => get("/api/recepcion/estancias-activas"),
  pagosDeFactura: (facturaId) => get(`/api/facturas/${facturaId}/pagos`),

  // Reportes (solo admin)
  ocupacion: (anio, mes) => get(`/api/reportes/ocupacion?anio=${anio}&mes=${mes}`),
  reporteFinanciero: (anio, mes) => get(`/api/reportes/financiero?anio=${anio}&mes=${mes}`),

  // URL publica del PDF de una factura (para abrir/descargar en el navegador).
  urlFacturaPdf: (facturaId) => `${BASE_URL}/api/facturas/${facturaId}/pdf`,

  // Facturas (historial completo)
  facturas: () => get("/api/facturas"),

  // Escrituras — Reservas / Recepcion
  crearReserva: (datos) => post("/api/reservas", datos),
  cancelarReserva: (id) => post(`/api/reservas/${id}/cancelar`),
  confirmarReserva: (id) => post(`/api/reservas/${id}/confirmar`),
  moverReserva: (id, habitacionId) =>
    post(`/api/reservas/${id}/mover`, { habitacion_id: habitacionId }),
  reservasCalendario: (desde, hasta) =>
    get(`/api/reservas/calendario?desde=${desde}&hasta=${hasta}`),
  checkin: (reservaId) => post("/api/recepcion/checkin", { reserva_id: reservaId }),
  checkout: (estanciaId) =>
    post("/api/recepcion/checkout", { estancia_id: estanciaId }),
  registrarPago: (datos) => post("/api/pagos", datos),

  // Escrituras — Habitaciones (CRUD)
  crearHabitacion: (datos) => post("/api/habitaciones", datos),
  editarHabitacion: (id, datos) => put(`/api/habitaciones/${id}`, datos),
  eliminarHabitacion: (id) => del(`/api/habitaciones/${id}`),

  // Escrituras — Huespedes (CRUD)
  crearHuesped: (datos) => post("/api/huespedes", datos),
  editarHuesped: (id, datos) => put(`/api/huespedes/${id}`, datos),
  eliminarHuesped: (id) => del(`/api/huespedes/${id}`),

  // Autenticacion
  login: (usuario, password) => post("/api/auth/login", { usuario, password }),
  registro: (datos) => post("/api/auth/registro", datos),
  loginGoogle: (credential) => post("/api/auth/google", { credential }),
  config: () => get("/api/config"),
  yo: () => get("/api/auth/yo"),

  // Usuarios (solo admin)
  usuarios: () => get("/api/usuarios"),
  crearUsuario: (datos) => post("/api/usuarios", datos),
  editarUsuario: (id, datos) => put(`/api/usuarios/${id}`, datos),
  eliminarUsuario: (id) => del(`/api/usuarios/${id}`),

  // Hospedajes (solo super admin) — panel de gestion del SaaS
  hospedajes: () => get("/api/hospedajes"),
  crearHospedaje: (datos) => post("/api/hospedajes", datos),
  editarHospedaje: (id, datos) => put(`/api/hospedajes/${id}`, datos),

  // Motor de reservas PUBLICO (sin login)
  publicoHospedaje: (slug) => get(`/api/publico/hospedaje/${slug}`),
  publicoDisponibilidad: (slug, entrada, salida) =>
    get(`/api/publico/disponibilidad/${slug}?fecha_entrada=${entrada}&fecha_salida=${salida}`),
  publicoReservar: (slug, datos) => post(`/api/publico/reservar/${slug}`, datos),
};
