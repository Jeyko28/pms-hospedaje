/**
 * Datos internos del sitio (Stanza) y helpers compartidos.
 *
 * PRIVACIDAD: el número de WhatsApp y el correo NO se muestran en la web. El
 * WhatsApp se usa solo como deep link (`wa.me`, abre el chat sin exponer el
 * número) y el correo se reemplazó por un formulario de contacto (POST
 * /api/contacto). Por eso aquí no se exportan cadenas "display".
 *
 * 🔧 CONFIGURABLE — número de WhatsApp (formato internacional, sin +).
 */
const WHATSAPP = "51981487284";

/** Deep link de WhatsApp con mensaje pre-rellenado (no revela el número). */
export const waLink = (texto) =>
  `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;

/** Formateador de moneda en soles (sin decimales). */
export const moneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  maximumFractionDigits: 0,
});
