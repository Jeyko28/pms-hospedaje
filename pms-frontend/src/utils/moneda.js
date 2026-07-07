/**
 * moneda.js — formateo de dinero centralizado y multi-moneda.
 *
 * Antes cada pantalla creaba su propio `new Intl.NumberFormat("es-PE", { currency:
 * "PEN" })`, dejando "soles" clavado en ~25 archivos. Ahora hay una sola fuente:
 * la moneda ACTUAL del hospedaje (se fija al iniciar sesión con `setMonedaActual`)
 * y helpers que la usan.
 *
 * Añadir una moneda nueva (p. ej. EUR) = una entrada en MONEDAS, sin tocar nada más.
 * Se guarda/usa SIEMPRE el código ISO (PEN, USD…), nunca el símbolo.
 */

export const MONEDAS = {
  PEN: { codigo: "PEN", simbolo: "S/", locale: "es-PE", nombre: "Soles (PEN)" },
  USD: { codigo: "USD", simbolo: "$", locale: "en-US", nombre: "Dólares (USD)" },
};

export const MONEDA_DEFECTO = "PEN";

// Moneda vigente de la sesión (la del hospedaje del usuario). Global de módulo:
// hay una sola moneda por hospedaje/sesión; se fija al autenticar.
let _monedaActual = MONEDA_DEFECTO;

export function setMonedaActual(codigo) {
  _monedaActual = MONEDAS[codigo] ? codigo : MONEDA_DEFECTO;
}

export function getMonedaActual() {
  return _monedaActual;
}

/**
 * Formatea un monto en una moneda (por defecto, la actual del hospedaje).
 * `opts` extiende las opciones de Intl.NumberFormat (p. ej. maximumFractionDigits).
 */
export function formatoMoneda(monto, moneda, opts = {}) {
  const m = MONEDAS[moneda || _monedaActual] || MONEDAS[MONEDA_DEFECTO];
  return new Intl.NumberFormat(m.locale, {
    ...opts,
    style: "currency",
    currency: m.codigo,
  }).format(Number(monto) || 0);
}

/**
 * nfMoneda — reemplazo directo de `new Intl.NumberFormat("es-PE", {...})`:
 * devuelve un objeto con `.format(n)` que usa la moneda ACTUAL en cada llamada
 * (reactivo) y conserva las opciones del formateador original (decimales, etc.).
 */
/**
 * Convierte un monto de la moneda BASE a otra, dado el tipo de cambio.
 * `tasa` = unidades de la moneda base por 1 unidad de la moneda destino
 * (p. ej. PEN por 1 USD ≈ 3.75) → destino = base / tasa.
 */
export function convertirDesdeBase(montoBase, tasa) {
  const t = Number(tasa) || 0;
  return t > 0 ? (Number(montoBase) || 0) / t : 0;
}

/** Inverso: de una moneda a la base. base = monto * tasa. */
export function convertirABase(monto, tasa) {
  return (Number(monto) || 0) * (Number(tasa) || 0);
}

export function nfMoneda(opts = {}) {
  // Se ignora style/currency del original (se fuerzan según la moneda actual);
  // se conservan el resto de opciones (fracciones, notación, etc.).
  const { style, currency, ...resto } = opts;
  return { format: (n) => formatoMoneda(n, undefined, resto) };
}
