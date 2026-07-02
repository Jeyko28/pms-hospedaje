import { Sparkles, MessageCircle } from "lucide-react";
import { waLink } from "./datos";

/**
 * FounderReveal — panel del Precio Fundador. NO se muestra por defecto: solo
 * aparece cuando el visitante lo "descubre" (ver founder.js + Precios.jsx).
 * Es una recompensa a quien explora, no un banner de descuento.
 */
export default function FounderReveal() {
  return (
    <div className="founder">
      <div className="founder__panel" role="status">
        <Sparkles size={30} aria-hidden="true" className="founder__icon" />
        <div>
          <p className="founder__eyebrow">Beneficio reservado</p>
          <h2 className="founder__titulo">Precio fundador — S/99/mes de por vida</h2>
          <p className="founder__texto">
            Lo descubriste porque exploraste. Los primeros 10 hospedajes pagan{" "}
            <strong>S/99 al mes para siempre</strong>, en cualquier plan. El precio no
            sube aunque crezcamos.
          </p>
        </div>
        <a
          className="s-btn s-btn--primary founder__cta"
          href={waLink("Hola, descubrí el precio fundador de S/99 y quiero reservarlo para mi hospedaje.")}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={18} aria-hidden="true" /> Reclamarlo
        </a>
      </div>
    </div>
  );
}
