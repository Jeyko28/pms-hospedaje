import { useState } from "react";
import { Check, Star, MessageCircle, ShieldCheck } from "lucide-react";
import { waLink, moneda } from "./datos";

/**
 * Precios — sección de planes del sitio de marketing. Vive dentro de SitioWeb
 * (que aporta nav y footer). Reglas de negocio (2026-06-24): planes flat por
 * rango de habitaciones, sin comisión ni cobro por usuario. Anual = paga 10,
 * usa 12 (2 meses gratis).
 */

const PLANES = [
  {
    id: "inicia",
    nombre: "Inicia",
    ideal: "Para hospedajes pequeños que recién arrancan.",
    habitaciones: "Hasta 8 habitaciones",
    mensual: 79,
    anual: 790,
    destacado: false,
    encabezadoFeatures: "Todo lo esencial:",
    features: [
      "Motor de reservas con link público (0% comisión)",
      "Calendario, check-in y check-out",
      "Huéspedes, facturación y boleta electrónica",
      "Reportes de ocupación e ingresos",
      "Acceso para recepción + modo claro/oscuro",
      "Soporte por WhatsApp",
    ],
  },
  {
    id: "crece",
    nombre: "Crece",
    ideal: "El favorito de hostales y hoteles en crecimiento.",
    habitaciones: "Hasta 20 habitaciones",
    mensual: 139,
    anual: 1390,
    destacado: true,
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
    id: "pro",
    nombre: "Pro",
    ideal: "Para hospedajes grandes o con varias propiedades.",
    habitaciones: "40+ habitaciones / multipropiedad",
    mensual: 239,
    anual: 2390,
    destacado: false,
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
  {
    q: "¿Necesito tarjeta para la prueba?",
    a: "No. Tienes 14 días gratis con todas las funciones. Te pedimos un medio de pago solo cuando decides quedarte.",
  },
  {
    q: "¿Cobran comisión por las reservas?",
    a: "Nunca. Tu link de reservas es 100% tuyo: el huésped reserva directo y tú no pagas comisión por noche. Pagas solo tu plan mensual.",
  },
  {
    q: "¿Y si crezco y necesito más habitaciones?",
    a: "Cambias de plan cuando quieras, sin perder tus datos. Solo escríbenos y lo ajustamos al instante.",
  },
  {
    q: "¿Cómo pago?",
    a: "Por Yape o transferencia. El plan anual te sale 2 meses gratis. Escríbenos por WhatsApp y te activamos la cuenta.",
  },
];

export default function Precios() {
  const [anual, setAnual] = useState(false);

  return (
    <div className="sitio-precios">
      {/* Encabezado */}
      <section className="precios-hero">
        <span className="hero__badge">
          <Star size={14} aria-hidden="true" /> Precio fundador — S/99/mes de por vida
        </span>
        <h1>Precios claros, sin sorpresas</h1>
        <p className="precios-hero__lead">
          Un solo precio por tu hospedaje. Sin comisiones por reserva, sin cobros por
          usuario. Empieza con 14 días gratis.
        </p>

        <div className="precios-toggle" role="group" aria-label="Periodo de pago">
          <button
            type="button"
            className={`precios-toggle__opt ${!anual ? "is-active" : ""}`}
            aria-pressed={!anual}
            onClick={() => setAnual(false)}
          >
            Mensual
          </button>
          <button
            type="button"
            className={`precios-toggle__opt ${anual ? "is-active" : ""}`}
            aria-pressed={anual}
            onClick={() => setAnual(true)}
          >
            Anual <span className="precios-toggle__tag">2 meses gratis</span>
          </button>
        </div>
      </section>

      {/* Cards */}
      <section className="precios-planes" aria-label="Planes">
        {PLANES.map((p) => {
          const porMes = anual ? Math.round(p.anual / 12) : p.mensual;
          const ahorro = p.mensual * 2;
          return (
            <article key={p.id} className={`plan ${p.destacado ? "plan--destacado" : ""}`}>
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
                  <>
                    Facturado {moneda.format(p.anual)} al año ·{" "}
                    <strong>ahorras {moneda.format(ahorro)}</strong>
                  </>
                ) : (
                  "Facturación mensual"
                )}
              </p>

              <p className="plan__habitaciones">{p.habitaciones}</p>

              <a
                className={`plan__cta ${p.destacado ? "sitio__btn-primary" : "sitio__btn-outline"}`}
                href="#/registro"
              >
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
            </article>
          );
        })}
      </section>

      {/* Banner fundador */}
      <section className="fundador">
        <ShieldCheck size={28} aria-hidden="true" className="fundador__icon" />
        <div>
          <h2 className="fundador__titulo">Oferta fundador: S/99/mes de por vida</h2>
          <p className="fundador__texto">
            Los primeros 10 hospedajes que se suman pagan{" "}
            <strong>S/99 al mes para siempre</strong>, en cualquier plan. El precio no
            sube aunque crezcamos. Menciónalo al escribirnos.
          </p>
        </div>
        <a
          className="fundador__cta"
          href={waLink("Hola, quiero el precio fundador de S/99 para mi hospedaje.")}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={18} aria-hidden="true" /> Reclamar por WhatsApp
        </a>
      </section>

      {/* FAQ */}
      <section className="faq">
        <h2 className="faq__titulo">Preguntas frecuentes</h2>
        <div className="faq__grid">
          {FAQS.map((f) => (
            <div key={f.q} className="faq__item">
              <h3 className="faq__q">{f.q}</h3>
              <p className="faq__a">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="cta-final">
        <h2>¿Listo para dejar el Excel?</h2>
        <p>Prueba 14 días gratis o escríbenos y te ayudamos a empezar hoy mismo.</p>
        <div className="cta-final__acciones">
          <a className="sitio__btn-primary sitio__btn-lg" href="#/registro">
            Crear mi cuenta gratis
          </a>
          <a
            className="sitio__btn-ghost sitio__btn-lg"
            href={waLink("Hola, quiero más información sobre Stanza para mi hospedaje.")}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={18} aria-hidden="true" /> Hablar por WhatsApp
          </a>
        </div>
      </section>
    </div>
  );
}
