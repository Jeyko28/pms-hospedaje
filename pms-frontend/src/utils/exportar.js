import { api } from "../api/client";

/**
 * Descarga un CSV protegido (con token) y dispara la descarga en el navegador.
 * recurso: "reservas" | "huespedes" | "pagos".
 * Lanza Error con mensaje si falla (para mostrar un toast).
 */
export async function descargarCSV(recurso, nombreArchivo) {
  const url = await api.exportCsvBlobUrl(recurso);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo || `${recurso}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
