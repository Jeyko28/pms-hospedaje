import { Sparkles, MessageCircle } from "lucide-react";
import { waLink } from "./datos";

/**
 * FounderReveal — panel del Precio Fundador. Oferta de lanzamiento VISIBLE: un
 * precio de por vida para los primeros hospedajes que se suman. Se muestra en la
 * página de Precios como argumento de cierre.
 */
export default function FounderReveal() {
  return (
    <div className="founder">
      <div className="founder__panel" role="status">
        <Sparkles size={30} aria-hidden="true" className="founder__icon" />
        <div>
          <p className="founder__eyebrow">Oferta de lanzamiento · cupos limitados</p>
          <h2 className="founder__titulo">Precio fundador — S/99/mes de por vida</h2>
          <p className="founder__texto">
            Los primeros <strong>10 hospedajes</strong> en sumarse pagan{" "}
            <strong>S/99 al mes para siempre</strong>, en cualquier plan. Tu precio no
            sube aunque crezcas ni aunque crezcamos nosotros.
          </p>
        </div>
        <a
          className="s-btn s-btn--primary founder__cta"
          href={waLink("Hola, quiero reservar el precio fundador de S/99/mes para mi hospedaje.")}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={18} aria-hidden="true" /> Reclamar precio fundador
        </a>
      </div>
    </div>
  );
}
