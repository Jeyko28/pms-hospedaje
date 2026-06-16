/**
 * fechas.js — utilidades de fecha en hora LOCAL.
 *
 * Por qué: `new Date().toISOString().slice(0,10)` devuelve la fecha en UTC.
 * En husos detrás de UTC (ej. Perú −5), por la tarde/noche el UTC ya marca el
 * día siguiente, así que "hoy" saldría corrido un día respecto al backend
 * (que usa la hora local del servidor). Estas funciones usan los componentes
 * locales de la fecha, evitando ese desfase.
 */

/** Fecha YYYY-MM-DD en hora local del Date dado (por defecto, ahora). */
export function ymdLocal(d = new Date()) {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}
