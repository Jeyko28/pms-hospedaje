import { nfMoneda } from "./moneda";
/**
 * Utilidades de WhatsApp para avisar al huésped (canal directo, sin infra).
 * Abre wa.me con el mensaje ya escrito; el dueño solo presiona "enviar".
 */

const formatoMoneda = nfMoneda({
  style: "currency",
  currency: "PEN",
});

const fechaLegible = (iso) => {
  const d = new Date((iso || "") + "T00:00:00");
  if (isNaN(d)) return iso || "";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * Normaliza un teléfono peruano a formato internacional para wa.me.
 * - Quita todo lo que no sea dígito.
 * - 9 dígitos (celular local) -> antepone 51.
 * - Si ya viene con 51 (11 dígitos) se respeta.
 * Devuelve null si no parece un número válido (para no abrir un chat roto).
 */
export function normalizarTelefonoPeru(telefono) {
  const d = String(telefono || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 9) return "51" + d;            // 987654321 -> 51987654321
  if (d.length === 11 && d.startsWith("51")) return d;
  if (d.length >= 8 && d.length <= 15) return d;   // otro país / ya con código
  return null;
}

/** Mensaje de confirmación de reserva (texto plano, multilínea). */
export function mensajeConfirmacion({ hospedaje, huesped, room, tipo, checkin, checkout, total }) {
  const nombre = (huesped || "").split(" ")[0] || huesped || "";
  const lineas = [
    `Hola ${nombre}, ¡tu reserva en ${hospedaje || "nuestro hospedaje"} está confirmada! 🏨`,
    "",
    `Habitación: ${room}${tipo ? " · " + tipo : ""}`,
    `Entrada: ${fechaLegible(checkin)}`,
    `Salida: ${fechaLegible(checkout)}`,
    total != null ? `Total: ${formatoMoneda.format(total)}` : null,
    "",
    "¡Te esperamos! Cualquier consulta, por aquí estamos. 😊",
  ].filter((l) => l !== null);
  return lineas.join("\n");
}

/**
 * Abre WhatsApp con el mensaje listo. Devuelve true si pudo abrir, false si el
 * teléfono no es válido (para avisar al usuario).
 */
export function abrirWhatsApp(telefono, texto) {
  const num = normalizarTelefonoPeru(telefono);
  if (!num) return false;
  const url = `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
