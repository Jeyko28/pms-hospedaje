import { useState } from "react";
import {
  Hotel,
  Check,
  Star,
  MessageCircle,
  Moon,
  Sun,
  ShieldCheck,
} from "lucide-react";
import Button from "../components/Button";
import { useTheme } from "../hooks/useTheme";
import "./Precios.css";

/**
 * Precios — página PÚBLICA de precios (marketing). Sin login.
 * Se llega por #/precios (ver main.jsx). Muestra los 3 planes, el toggle
 * mensual/anual, el precio fundador y CTAs a registro / WhatsApp.
 *
 * Decisión de negocio (2026-06-24): planes flat por rango de habitaciones,
 * NUNCA por usuario ni comisión. El core (reservas, calendario, link público)
 * jamás se cobra por separado. Anual = paga 10 meses, usa 12 (2 gratis).
 */

// 🔧 CONFIGURABLE — número de WhatsApp del negocio (formato internacional, sin +).
// Perú: 51 + 9 dígitos. Actual: +51 981 487 284.
const WHATSAPP = "51981487284";
const waLink = (texto) =>
  `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;

const moneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  maximumFractionDigits: 0,
});

// Planes. mensual = precio/mes; anual = total/año (paga 10, usa 12).
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
  const { theme, toggle } = useTheme();
  const [anual, setAnual] = useState(false);

  return (
    <div className="precios">
      {/* ---------------- Barra superior ---------------- */}
      <header className="precios__topbar">
        <a className="precios__brand" href="#/precios">
          <span className="precios__brand-mark" aria-hidden="true">
            <Hotel size={22} strokeWidth={2} />
          </span>
          <span className="precios__brand-name">PMS Hospedaje</span>
        </a>
        <nav className="precios__topnav">
          <button
            type="button"
            className="precios__icon-btn"
            onClick={toggle}
            aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <a className="precios__login" href="#/login">
            Iniciar sesión
          </a>
        </nav>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="precios__hero">
        <span className="precios__badge">
          <Star size={14} aria-hidden="true" /> Precio fundador — S/99/mes de por vida
        </span>
        <h1 className="precios__h1">Precios claros, sin sorpresas</h1>
        <p className="precios__lead">
          Un solo precio por tu hospedaje. Sin comisiones por reserva, sin cobros por
          usuario. Empieza con 14 días gratis.
        </p>

        {/* Toggle mensual / anual */}
        <div className="precios__toggle" role="group" aria-label="Periodo de pago">
          <button
            type="button"
            className={`precios__toggle-opt ${!anual ? "is-active" : ""}`}
            aria-pressed={!anual}
            onClick={() => setAnual(false)}
          >
            Mensual
          </button>
          <button
            type="button"
            className={`precios__toggle-opt ${anual ? "is-active" : ""}`}
            aria-pressed={anual}
            onClick={() => setAnual(true)}
          >
            Anual <span className="precios__toggle-tag">2 meses gratis</span>
          </button>
        </div>
      </section>

      {/* ---------------- Cards de planes ---------------- */}
      <section className="precios__planes" aria-label="Planes">
        {PLANES.map((p) => {
          const porMes = anual ? Math.round(p.anual / 12) : p.mensual;
          const ahorro = p.mensual * 2; // 2 meses gratis al año
          return (
            <article
              key={p.id}
              className={`plan ${p.destacado ? "plan--destacado" : ""}`}
            >
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

              <Button
                className="plan__cta"
                variant={p.destacado ? "primary" : "secondary"}
                onClick={() => {
                  window.location.hash = "#/registro";
                }}
              >
                Empieza gratis
              </Button>

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

      {/* ---------------- Banner fundador ---------------- */}
      <section className="precios__fundador">
        <ShieldCheck size={28} aria-hidden="true" className="precios__fundador-icon" />
        <div>
          <h2 className="precios__fundador-titulo">
            Oferta fundador: S/99/mes de por vida
          </h2>
          <p className="precios__fundador-texto">
            Los primeros 10 hospedajes que se suman pagan{" "}
            <strong>S/99 al mes para siempre</strong>, en cualquier plan. El precio no
            sube aunque crezcamos. Menciónalo al escribirnos.
          </p>
        </div>
        <a
          className="precios__fundador-cta"
          href={waLink("Hola, quiero el precio fundador de S/99 para mi hospedaje.")}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={18} aria-hidden="true" /> Reclamar por WhatsApp
        </a>
      </section>

      {/* ---------------- FAQ ---------------- */}
      <section className="precios__faq">
        <h2 className="precios__faq-titulo">Preguntas frecuentes</h2>
        <div className="precios__faq-grid">
          {FAQS.map((f) => (
            <div key={f.q} className="precios__faq-item">
              <h3 className="precios__faq-q">{f.q}</h3>
              <p className="precios__faq-a">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- CTA final ---------------- */}
      <section className="precios__final">
        <h2 className="precios__final-titulo">¿Listo para dejar el Excel?</h2>
        <p className="precios__final-texto">
          Prueba 14 días gratis o escríbenos y te ayudamos a empezar hoy mismo.
        </p>
        <div className="precios__final-acciones">
          <Button onClick={() => (window.location.hash = "#/registro")}>
            Crear mi cuenta gratis
          </Button>
          <a
            className="precios__wa"
            href={waLink("Hola, quiero más información sobre el PMS para mi hospedaje.")}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={18} aria-hidden="true" /> Hablar por WhatsApp
          </a>
        </div>
      </section>

      <footer className="precios__footer">
        PMS Hospedaje · Hecho en Perú para hospedajes del Perú
      </footer>
    </div>
  );
}
