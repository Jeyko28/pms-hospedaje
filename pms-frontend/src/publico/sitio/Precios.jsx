import { useEffect, useState } from "react";
import { Check, Star, MessageCircle, ArrowRight } from "lucide-react";
import { waLink, moneda } from "./datos";
import { Reveal, useReveal } from "./useReveal";
import { unlockFounder, useFounderUnlocked } from "./founder";
import FounderReveal from "./FounderReveal";

/**
 * Precios — planes premium. El Precio Fundador NO aparece por defecto: es un
 * "easter egg" que se revela cuando el visitante muestra interés real (cambia
 * el periodo a Anual Y llega a la sección de preguntas). También se puede
 * descubrir con el disparador accesible del footer (ver SitioWeb/founder.js).
 */
const PLANES = [
  {
    id: "inicia", nombre: "Inicia", ideal: "Para hospedajes pequeños que recién arrancan.",
    habitaciones: "Hasta 8 habitaciones", mensual: 79, anual: 790, destacado: false,
    encabezadoFeatures: "Todo lo esencial:",
    features: [
      "Motor de reservas con link público (0% comisión)",
      "Calendario, check-in y check-out",
      "Huéspedes, facturación y comprobantes en PDF",
      "Reportes de ocupación e ingresos",
      "Acceso para recepción + modo claro/oscuro",
      "Soporte por WhatsApp",
    ],
  },
  {
    id: "crece", nombre: "Crece", ideal: "El favorito de hostales y hoteles en crecimiento.",
    habitaciones: "Hasta 20 habitaciones", mensual: 139, anual: 1390, destacado: true,
    encabezadoFeatures: "Todo lo de Inicia, y además:",
    features: [
      "Más capacidad: hasta 20 habitaciones",
      "Usuarios de recepción ilimitados",
      "Origen de reservas y panel de captación",
      "Link público personalizable (tu propia URL)",
      "Soporte prioritario",
    ],
  },
  {
    id: "pro", nombre: "Pro", ideal: "Para hospedajes grandes o con varias propiedades.",
    habitaciones: "40+ habitaciones / multipropiedad", mensual: 239, anual: 2390, destacado: false,
    encabezadoFeatures: "Todo lo de Crece, y además:",
    features: [
      "Sin límite práctico de habitaciones",
      "Gestión multipropiedad",
      "Onboarding y migración de datos guiada",
      "Atención preferente",
    ],
  },
];

const FAQS = [
  { q: "¿Necesito tarjeta para la prueba?", a: "No. Tienes 14 días gratis con todas las funciones. Te pedimos un medio de pago solo cuando decides quedarte." },
  { q: "¿Cobran comisión por las reservas?", a: "Nunca. Tu link de reservas es 100% tuyo: el huésped reserva directo y tú no pagas comisión por noche. Pagas solo tu plan mensual." },
  { q: "¿Y si crezco y necesito más habitaciones?", a: "Cambias de plan cuando quieras, sin perder tus datos. Solo escríbenos y lo ajustamos al instante." },
  { q: "¿Cómo pago?", a: "Por Yape o transferencia. El plan anual te sale 2 meses gratis. Escríbenos por WhatsApp y te activamos la cuenta." },
];

export default function Precios() {
  const [anual, setAnual] = useState(false);
  const [tocoAnual, setTocoAnual] = useState(false);
  const { ref: faqRef, visible: faqVisible } = useReveal({
    threshold: 0,
    rootMargin: "0px 0px -20% 0px",
  });
  const unlocked = useFounderUnlocked();

  // Mecánica del easter egg: interés real = cambió a Anual + llegó a la FAQ.
  useEffect(() => {
    if (tocoAnual && faqVisible && !unlocked) unlockFounder();
  }, [tocoAnual, faqVisible, unlocked]);

  function elegirAnual(v) {
    setAnual(v);
    if (v) setTocoAnual(true);
  }

  return (
    <div className="sitio-precios">
      <section className="precios-hero">
        <span className="s-eyebrow">
          <Star size={14} aria-hidden="true" /> Precios claros, en soles
        </span>
        <h1>Un precio por tu hospedaje, sin sorpresas</h1>
        <p className="precios-hero__lead">
          Sin comisiones por reserva, sin cobros por usuario. Empieza con 14 días gratis y
          decide después.
        </p>

        <div className="precios-toggle" role="group" aria-label="Periodo de pago">
          <button
            type="button"
            className={`precios-toggle__opt ${!anual ? "is-active" : ""}`}
            aria-pressed={!anual}
            onClick={() => elegirAnual(false)}
          >
            Mensual
          </button>
          <button
            type="button"
            className={`precios-toggle__opt ${anual ? "is-active" : ""}`}
            aria-pressed={anual}
            onClick={() => elegirAnual(true)}
          >
            Anual <span className="precios-toggle__tag">2 meses gratis</span>
          </button>
        </div>
      </section>

      <section className="precios-planes" aria-label="Planes">
        {PLANES.map((p, i) => {
          const porMes = anual ? Math.round(p.anual / 12) : p.mensual;
          const ahorro = p.mensual * 2;
          return (
            <Reveal as="article" key={p.id} delay={i * 70} className={`plan ${p.destacado ? "plan--destacado" : ""}`}>
              {p.destacado && (
                <span className="plan__cinta">
                  <Star size={13} aria-hidden="true" /> Recomendado
                </span>
              )}
              <h2 className="plan__nombre">{p.nombre}</h2>
              <p className="plan__ideal">{p.ideal}</p>
              <div className="plan__precio">
                <span className="plan__monto">{moneda.format(porMes)}</span>
                <span className="plan__periodo">/mes</span>
              </div>
              <p className="plan__factura">
                {anual ? (
                  <>Facturado {moneda.format(p.anual)} al año · <strong>ahorras {moneda.format(ahorro)}</strong></>
                ) : (
                  "Facturación mensual"
                )}
              </p>
              <p className="plan__habitaciones">{p.habitaciones}</p>
              <a className={`s-btn plan__cta ${p.destacado ? "s-btn--primary" : "s-btn--ghost"}`} href="#/registro">
                Empieza gratis
              </a>
              <p className="plan__features-head">{p.encabezadoFeatures}</p>
              <ul className="plan__features">
                {p.features.map((f) => (
                  <li key={f}>
                    <Check size={16} aria-hidden="true" className="plan__check" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          );
        })}
      </section>

      {/* Precio Fundador visible (antes era easter egg; la mecánica de unlock se
          conserva más abajo por si se vuelve a un modo "descubrible"). */}
      <FounderReveal />

      {/* FAQ — su visibilidad alimenta la mecánica del easter egg */}
      <section className="s-section" ref={faqRef}>
        <div className="s-head">
          <span className="s-head__eyebrow">Dudas frecuentes</span>
          <h2>Todo claro antes de empezar</h2>
        </div>
        <div className="faq">
          <div className="faq__grid">
            {FAQS.map((f) => (
              <div key={f.q} className="faq__item">
                <h3 className="faq__q">{f.q}</h3>
                <p className="faq__a">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-final__wrap">
        <Reveal className="cta-final">
          <h2>¿Listo para dejar el Excel?</h2>
          <p>Prueba 14 días gratis o escríbenos y te ayudamos a empezar hoy mismo.</p>
          <div className="cta-final__acciones">
            <a className="s-btn s-btn--primary s-btn--lg" href="#/registro">
              Crear mi cuenta gratis <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a
              className="s-btn s-btn--ghost s-btn--lg"
              href={waLink("Hola, quiero más información sobre Stanza para mi hospedaje.")}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={18} aria-hidden="true" /> Hablar por WhatsApp
            </a>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
