import { api } from "../api/client";
import { toast } from "../components/Toast";

/**
 * Abre un PDF protegido en una pestaña nueva.
 *
 * El endpoint del PDF exige token, así que NO se puede abrir su URL directa
 * (la navegación del navegador no envía el Authorization). Aquí lo descargamos
 * con fetch autenticado (que devuelve una URL de blob) y abrimos ese blob.
 *
 * Para no chocar con el bloqueador de pop-ups, la pestaña se abre de forma
 * SÍNCRONA dentro del gesto del clic y luego se le asigna el blob ya listo.
 * Si el pop-up fue bloqueado, cae a una descarga del archivo.
 */
function abrirPdfDesde(promesaBlobUrl, nombreArchivo) {
  const ventana = window.open("", "_blank");
  promesaBlobUrl
    .then((url) => {
      if (ventana && !ventana.closed) {
        ventana.location = url;
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = nombreArchivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    })
    .catch((e) => {
      if (ventana && !ventana.closed) ventana.close();
      toast.error(e.message || "No se pudo abrir el PDF.");
    });
}

/** Abre el comprobante interno (PDF). tipo: 'boleta' (def.) | 'factura'. */
export function abrirFacturaPdf(facturaId, tipo = "boleta") {
  abrirPdfDesde(api.facturaPdfBlobUrl(facturaId, tipo), `${tipo}_${facturaId}.pdf`);
}

/** Abre la representación impresa (PDF) de un comprobante electrónico. */
export function abrirComprobantePdf(comprobanteId) {
  abrirPdfDesde(api.comprobantePdfBlobUrl(comprobanteId), `comprobante_${comprobanteId}.pdf`);
}
