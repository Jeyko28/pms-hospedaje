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
const patch = (path, body) => enviar("PATCH", path, body);
const del = (path) => enviar("DELETE", path);

// Descarga un PDF protegido (con token) y devuelve una URL de blob para abrirlo.
async function descargarBlob(path) {
  let respuesta;
  try {
    respuesta = await fetch(`${BASE_URL}${path}`, { headers: cabeceras(false) });
  } catch (e) {
    throw new Error(
      "No se pudo conectar con el servidor. Verifica que la API este encendida."
    );
  }
  if (respuesta.status === 401) {
    tokenStore.clear();
    if (alExpirar) alExpirar();
    throw new Error("Tu sesion expiro. Inicia sesion de nuevo.");
  }
  if (!respuesta.ok) {
    let detalle = `No se pudo descargar el archivo (error ${respuesta.status}).`;
    try {
      const datos = await respuesta.json();
      if (datos && datos.detail) detalle = datos.detail;
    } catch (_) {
      /* el cuerpo no era JSON */
    }
    throw new Error(detalle);
  }
  const blob = await respuesta.blob();
  return URL.createObjectURL(blob);
}

export const api = {
  // Lecturas
  resumenDashboard: () => get("/api/dashboard/resumen"),
  agendaDashboard: () => get("/api/dashboard/agenda"),
  dashboardOverview: () => get("/api/dashboard/overview"),
  habitaciones: () => get("/api/habitaciones"),
  huespedes: (incluirArchivados = false) =>
    get(`/api/huespedes${incluirArchivados ? "?incluir_archivados=1" : ""}`),
  reservas: () => get("/api/reservas"),

  // Recepcion
  reservasPendientes: () => get("/api/recepcion/reservas-pendientes"),
  estanciasActivas: () => get("/api/recepcion/estancias-activas"),
  pagosDeFactura: (facturaId) => get(`/api/facturas/${facturaId}/pagos`),

  // Reportes (solo admin)
  ocupacion: (anio, mes) => get(`/api/reportes/ocupacion?anio=${anio}&mes=${mes}`),
  reporteFinanciero: (anio, mes) => get(`/api/reportes/financiero?anio=${anio}&mes=${mes}`),
  reportesPeriodos: () => get("/api/reportes/periodos"),
  notificaciones: () => get("/api/notificaciones"),

  // Inventario (admin)
  inventario: (categoria = "", incluirInactivos = false) => {
    const qs = [];
    if (categoria) qs.push(`categoria=${encodeURIComponent(categoria)}`);
    if (incluirInactivos) qs.push("incluir_inactivos=1");
    return get(`/api/inventario${qs.length ? "?" + qs.join("&") : ""}`);
  },
  inventarioResumen: () => get("/api/inventario/resumen"),
  crearItemInventario: (datos) => post("/api/inventario", datos),
  editarItemInventario: (id, datos) => put(`/api/inventario/${id}`, datos),
  archivarItemInventario: (id) => del(`/api/inventario/${id}`),
  movimientoInventario: (id, datos) => post(`/api/inventario/${id}/movimiento`, datos),
  movimientosInventario: (id) => get(`/api/inventario/${id}/movimientos`),

  // URL del PDF de una factura (referencia; NO sirve para abrir directo en el
  // navegador porque el endpoint exige token y la navegación no lo envía).
  urlFacturaPdf: (facturaId) => `${BASE_URL}/api/facturas/${facturaId}/pdf`,

  // Descarga un PDF protegido CON el token (fetch autenticado) y devuelve una
  // URL de blob lista para abrir/descargar. Resuelve el "Not authenticated"
  // que aparecía al abrir la URL del PDF directo (la navegación no manda token).
  facturaPdfBlobUrl: (facturaId, tipo = "boleta") =>
    descargarBlob(`/api/facturas/${facturaId}/pdf?tipo=${tipo}`),
  comprobantePdfBlobUrl: (comprobanteId) =>
    descargarBlob(`/api/comprobantes/${comprobanteId}/pdf`),

  // Exportación a CSV (descarga autenticada → blob). recurso: reservas|huespedes|pagos
  exportCsvBlobUrl: (recurso) => descargarBlob(`/api/export/${recurso}.csv`),

  // Facturas (historial completo)
  facturas: () => get("/api/facturas"),

  // Facturación electrónica (SUNAT)
  sunatConfig: () => get("/api/sunat/config"),
  guardarSunatConfig: (datos) => put("/api/sunat/config", datos),
  emitirBoleta: (facturaId) => post(`/api/facturas/${facturaId}/emitir`),
  comprobantes: () => get("/api/comprobantes"),

  // Escrituras — Reservas / Recepcion
  crearReserva: (datos) => post("/api/reservas", datos),
  crearReservaGrupo: (datos) => post("/api/reservas/grupo", datos),

  // Tarifas por temporada / fin de semana (solo admin)
  tarifas: () => get("/api/tarifas"),
  crearTarifa: (datos) => post("/api/tarifas", datos),
  eliminarTarifa: (id) => del(`/api/tarifas/${id}`),
  editarReserva: (id, datos) => put(`/api/reservas/${id}`, datos),
  cancelarReserva: (id) => post(`/api/reservas/${id}/cancelar`),
  confirmarReserva: (id) => post(`/api/reservas/${id}/confirmar`),
  moverReserva: (id, habitacionId) =>
    post(`/api/reservas/${id}/mover`, { habitacion_id: habitacionId }),
  reservasCalendario: (desde, hasta) =>
    get(`/api/reservas/calendario?desde=${desde}&hasta=${hasta}`),
  checkin: (reservaId, fechaEntradaReal = "") =>
    post("/api/recepcion/checkin", { reserva_id: reservaId, fecha_entrada_real: fechaEntradaReal }),
  checkout: (estanciaId, fechaCheckoutReal = "") =>
    post("/api/recepcion/checkout", { estancia_id: estanciaId, fecha_checkout_real: fechaCheckoutReal }),
  cajaDia: (fecha = "") => get(`/api/recepcion/caja${fecha ? `?fecha=${fecha}` : ""}`),
  // Cierre de turno (arqueo firmado)
  crearCierreTurno: (datos) => post("/api/recepcion/cierres", datos),
  cierresTurno: (limite = 30) => get(`/api/recepcion/cierres?limite=${limite}`),
  crearBloqueo: (datos) => post("/api/bloqueos", datos),
  eliminarBloqueo: (id) => del(`/api/bloqueos/${id}`),

  // Housekeeping / limpieza
  cambiarLimpieza: (id, estado) =>
    patch(`/api/habitaciones/${id}/limpieza`, { estado_limpieza: estado }),
  tareasLimpieza: (habitacionId = 0) =>
    get(`/api/tareas-limpieza${habitacionId ? `?habitacion_id=${habitacionId}` : ""}`),
  crearTareaLimpieza: (datos) => post("/api/tareas-limpieza", datos),
  completarTareaLimpieza: (id) => post(`/api/tareas-limpieza/${id}/completar`),
  recalcularEstancia: (estanciaId, fechaCheckoutReal = "", descuento = 0, descuentoMotivo = "") =>
    post("/api/recepcion/recalcular", {
      estancia_id: estanciaId,
      fecha_checkout_real: fechaCheckoutReal,
      descuento,
      descuento_motivo: descuentoMotivo,
    }),
  registrarPago: (datos) => post("/api/pagos", datos),

  // Escrituras — Habitaciones (CRUD)
  crearHabitacion: (datos) => post("/api/habitaciones", datos),
  editarHabitacion: (id, datos) => put(`/api/habitaciones/${id}`, datos),
  eliminarHabitacion: (id) => del(`/api/habitaciones/${id}`),

  // Escrituras — Huespedes (CRUD)
  crearHuesped: (datos) => post("/api/huespedes", datos),
  editarHuesped: (id, datos) => put(`/api/huespedes/${id}`, datos),
  eliminarHuesped: (id) => del(`/api/huespedes/${id}`), // archiva (soft-delete)
  archivarHuesped: (id) => del(`/api/huespedes/${id}`),
  desarchivarHuesped: (id) => post(`/api/huespedes/${id}/desarchivar`),

  // Autenticacion
  login: (usuario, password) => post("/api/auth/login", { usuario, password }),
  registro: (datos) => post("/api/auth/registro", datos),
  loginGoogle: (credential) => post("/api/auth/google", { credential }),
  config: () => get("/api/config"),
  yo: () => get("/api/auth/yo"),

  // Link público: personalizar el slug (solo admin, cupo limitado)
  cambiarSlug: (slug) => put("/api/mi-hospedaje/slug", { slug }),

  // Configuración del negocio (datos de la factura + estado de suscripción)
  miHospedaje: () => get("/api/mi-hospedaje"),
  guardarMiHospedaje: (datos) => put("/api/mi-hospedaje", datos),

  // Detalle de reserva (estancia, factura, pagos, consumos)
  reservaDetalle: (id) => get(`/api/reservas/${id}/detalle`),

  // Consumos (servicios y pedidos de una reserva)
  consumosPorReserva: (reservaId) => get(`/api/consumos?reserva_id=${reservaId}`),
  crearConsumo: (datos) => post("/api/consumos", datos),
  eliminarConsumo: (id) => del(`/api/consumos/${id}`),

  // Catálogo de servicios de habitación
  serviciosHabitacion: () => get("/api/servicios-habitacion"),
  crearServicioHabitacion: (datos) => post("/api/servicios-habitacion", datos),
  editarServicioHabitacion: (id, datos) => put(`/api/servicios-habitacion/${id}`, datos),
  eliminarServicioHabitacion: (id) => del(`/api/servicios-habitacion/${id}`),

  // Usuarios (solo admin)
  usuarios: () => get("/api/usuarios"),
  crearUsuario: (datos) => post("/api/usuarios", datos),
  editarUsuario: (id, datos) => put(`/api/usuarios/${id}`, datos),
  eliminarUsuario: (id) => del(`/api/usuarios/${id}`),

  // Hospedajes (solo super admin) — panel de gestion del SaaS
  hospedajes: () => get("/api/hospedajes"),
  crearHospedaje: (datos) => post("/api/hospedajes", datos),
  editarHospedaje: (id, datos) => put(`/api/hospedajes/${id}`, datos),
  // Pagos de suscripcion del SaaS (super admin). Registrar activa/extiende solo.
  registrarPagoSuscripcion: (id, datos) => post(`/api/hospedajes/${id}/pagos`, datos),
  pagosDeHospedaje: (id) => get(`/api/hospedajes/${id}/pagos`),
  pagosSuscripcion: () => get("/api/pagos-suscripcion"),

  // Contacto de la landing (POST publico; GET solo super admin)
  enviarContacto: (datos) => post("/api/contacto", datos),
  contactos: () => get("/api/contactos"),

  // Motor de reservas PUBLICO (sin login)
  publicoHospedaje: (slug) => get(`/api/publico/hospedaje/${slug}`),
  publicoDisponibilidad: (slug, entrada, salida) =>
    get(`/api/publico/disponibilidad/${slug}?fecha_entrada=${entrada}&fecha_salida=${salida}`),
  publicoReservar: (slug, datos) => post(`/api/publico/reservar/${slug}`, datos),
};
