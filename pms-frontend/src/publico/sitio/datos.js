/**
 * Datos de contacto del negocio (Stanza) y helpers, compartidos por todas las
 * secciones del sitio de marketing.
 *
 * 🔧 CONFIGURABLE — número de WhatsApp (formato internacional, sin +).
 * Perú: 51 + 9 dígitos. Actual: +51 981 487 284.
 */
export const WHATSAPP = "51981487284";
export const WHATSAPP_DISPLAY = "+51 981 487 284";
export const EMAIL = "jeykogalan2809@gmail.com";

/** Construye un enlace de WhatsApp con un mensaje pre-rellenado. */
export const waLink = (texto) =>
  `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;

/** Formateador de moneda en soles (sin decimales). */
export const moneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  maximumFractionDigits: 0,
});
