/**
 * estados.js
 * Mapeo central de los estados del dominio -> presentacion accesible.
 *
 * Aqui vive la "traduccion" de cada estado tecnico (lo que guarda la BD)
 * a: tono de color + icono + etiqueta legible. Tenerlo en un solo sitio
 * garantiza consistencia (misma palabra y color en TODA la app) y facilita
 * traducir o cambiar la marca despues.
 */

// Estado de ocupacion de una habitacion.
// 'disponible'/'libre' son equivalentes (libre viene del calculo por calendario);
// 'reservada' = vendida para hoy pero el huesped aun no hace check-in.
export const ESTADO_HABITACION = {
  disponible: { tone: "success", icon: "✓", label: "Disponible" },
  libre: { tone: "success", icon: "✓", label: "Disponible" },
  reservada: { tone: "info", icon: "◷", label: "Reservada hoy" },
  ocupada: { tone: "danger", icon: "●", label: "Ocupada" },
  mantenimiento: { tone: "warning", icon: "⚙", label: "Mantenimiento" },
};

// Estado de limpieza de una habitacion.
export const ESTADO_LIMPIEZA = {
  Limpia: { tone: "success", icon: "✓", label: "Limpia" },
  Sucia: { tone: "danger", icon: "✗", label: "Sucia" },
  "Revisión": { tone: "warning", icon: "⌕", label: "Revisión" },
  Revision: { tone: "warning", icon: "⌕", label: "Revisión" },
};

// Estado de una reserva.
export const ESTADO_RESERVA = {
  // Pendiente: llegó por el motor de reservas público y espera confirmación.
  Pendiente: { tone: "warning", icon: "⏳", label: "Pendiente" },
  Confirmada: { tone: "info", icon: "✓", label: "Confirmada" },
  "Check-in": { tone: "success", icon: "→", label: "Check-in" },
  "Check-out": { tone: "neutral", icon: "←", label: "Check-out" },
  Cancelada: { tone: "danger", icon: "✗", label: "Cancelada" },
};

// Estado de un hospedaje (cliente del SaaS) — panel super admin.
export const ESTADO_HOSPEDAJE = {
  prueba: { tone: "info", icon: "◷", label: "En prueba" },
  activo: { tone: "success", icon: "✓", label: "Activo" },
  suspendido: { tone: "warning", icon: "!", label: "Suspendido" },
  cancelado: { tone: "danger", icon: "✗", label: "Cancelado" },
};

// Plan de un hospedaje (alineado con la web de precios).
export const PLAN_HOSPEDAJE = {
  trial: { tone: "neutral", icon: "◷", label: "Prueba" },
  inicia: { tone: "info", icon: "•", label: "Inicia" },
  crece: { tone: "info", icon: "◆", label: "Crece" },
  pro: { tone: "success", icon: "★", label: "Pro" },
  basico: { tone: "info", icon: "•", label: "Básico" }, // legado
};

/** Devuelve la config de presentacion o un neutro seguro si no existe. */
export function presentar(mapa, clave) {
  return mapa[clave] || { tone: "neutral", icon: "•", label: String(clave ?? "—") };
}
