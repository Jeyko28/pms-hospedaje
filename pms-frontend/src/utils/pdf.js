import { api } from "../api/client";

/**
 * abrirFacturaPdf — abre el PDF de una factura en una pestaña nueva.
 *
 * El endpoint del PDF exige token, así que NO se puede abrir su URL directa
 * (la navegación del navegador no envía el Authorization). Aquí lo descargamos
 * con fetch autenticado (api.facturaPdfBlobUrl) y abrimos el blob resultante.
 *
 * Para no chocar con el bloqueador de pop-ups, la pestaña se abre de forma
 * SÍNCRONA dentro del gesto del clic y luego se le asigna el blob ya listo.
 * Si el pop-up fue bloqueado, cae a una descarga del archivo.
 */
export function abrirFacturaPdf(facturaId) {
  const ventana = window.open("", "_blank");
  api
    .facturaPdfBlobUrl(facturaId)
    .then((url) => {
      if (ventana && !ventana.closed) {
        ventana.location = url;
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `factura_${facturaId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      // Liberar el blob un rato después (ya cargó en la pestaña/descarga).
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    })
    .catch((e) => {
      if (ventana && !ventana.closed) ventana.close();
      window.alert(e.message);
    });
}
