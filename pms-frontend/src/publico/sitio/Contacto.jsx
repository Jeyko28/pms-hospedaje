import { MessageCircle, Mail, Clock } from "lucide-react";
import { waLink, WHATSAPP_DISPLAY, EMAIL } from "./datos";

/**
 * Contacto — cómo hablar con nosotros. Sin formulario que envíe datos (evita
 * manejar información personal); canales directos: WhatsApp y correo.
 */
export default function Contacto() {
  return (
    <div className="sitio-contacto">
      <section className="pagina-head">
        <h1>Hablemos</h1>
        <p>
          ¿Dudas, una demo o quieres el precio fundador? Escríbenos por WhatsApp y te
          respondemos rápido. Somos personas reales, en Perú.
        </p>
      </section>

      <section className="contacto-cards">
        <a
          className="contacto-card"
          href={waLink("Hola, quiero información sobre Stanza para mi hospedaje.")}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="contacto-card__icon" aria-hidden="true">
            <MessageCircle size={24} />
          </span>
          <h2>WhatsApp</h2>
          <p className="contacto-card__dato">{WHATSAPP_DISPLAY}</p>
          <p className="contacto-card__nota">La vía más rápida. Toca para escribirnos.</p>
        </a>

        <a className="contacto-card" href={`mailto:${EMAIL}`}>
          <span className="contacto-card__icon" aria-hidden="true">
            <Mail size={24} />
          </span>
          <h2>Correo</h2>
          <p className="contacto-card__dato">{EMAIL}</p>
          <p className="contacto-card__nota">Para consultas con más detalle.</p>
        </a>

        <div className="contacto-card contacto-card--info">
          <span className="contacto-card__icon" aria-hidden="true">
            <Clock size={24} />
          </span>
          <h2>Horario</h2>
          <p className="contacto-card__dato">Lun a Sáb · 9:00–19:00</p>
          <p className="contacto-card__nota">Hora de Perú (GMT-5).</p>
        </div>
      </section>

      <section className="cta-final">
        <h2>¿Prefieres probarlo tú mismo?</h2>
        <p>Crea tu cuenta y explora Stanza 14 días gratis, sin tarjeta.</p>
        <div className="cta-final__acciones">
          <a className="sitio__btn-primary sitio__btn-lg" href="#/registro">
            Empieza gratis
          </a>
          <a className="sitio__btn-ghost sitio__btn-lg" href="#/precios">
            Ver precios
          </a>
        </div>
      </section>
    </div>
  );
}
