import { useState } from "react";
import { Link2, Copy, Check, ExternalLink } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import Card from "./Card";
import "./LinkReservas.css";

/**
 * LinkReservas — tarjeta del Dashboard que muestra al dueño su LINK PÚBLICO
 * de reservas (para compartir en redes/WhatsApp) con un botón de copiar.
 *
 * El slug del hospedaje viene del usuario logueado (auth.publico). Si por
 * algún motivo no hay slug, la tarjeta no se muestra.
 */
export default function LinkReservas() {
  const { usuario } = useAuth();
  const [copiado, setCopiado] = useState(false);

  const slug = usuario?.hospedaje_slug;
  if (!slug) return null;

  // El link usa el dominio actual + la ruta pública (#/reservar/<slug>).
  const url = `${window.location.origin}/#/reservar/${slug}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Fallback si el navegador bloquea el portapapeles: seleccionar el texto.
      window.prompt("Copia tu link de reservas:", url);
    }
  }

  return (
    <Card padding="md" className="linkres">
      <div className="linkres__cab">
        <span className="linkres__icono" aria-hidden="true">
          <Link2 size={20} />
        </span>
        <div>
          <h2 className="linkres__titulo">Tu link de reservas</h2>
          <p className="linkres__sub">
            Compártelo en WhatsApp, Instagram o Google para recibir reservas directas.
          </p>
        </div>
      </div>

      <div className="linkres__barra">
        <span className="linkres__url" title={url}>
          {url}
        </span>
        <button
          type="button"
          className="linkres__btn"
          onClick={copiar}
          aria-label="Copiar link"
        >
          {copiado ? <Check size={16} /> : <Copy size={16} />}
          {copiado ? "¡Copiado!" : "Copiar"}
        </button>
        <a
          className="linkres__btn linkres__btn--ghost"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={16} />
          Ver
        </a>
      </div>
    </Card>
  );
}
