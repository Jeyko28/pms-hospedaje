import {
  Globe,
  CalendarRange,
  ConciergeBell,
  Receipt,
  BarChart3,
  ShieldCheck,
  Sparkles,
  MessageCircle,
  Check,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import { waLink } from "./datos";
import { Reveal } from "./useReveal";
import { Frame, CalendarMockup, DashboardMockup } from "./Mockups";

/**
 * Inicio — landing principal premium. Mensaje central: profesional y potente
 * pero fácil, en soles, sin comisión de Booking. Hero con producto visible +
 * secciones reveladas al scroll.
 */

const FUNCIONES = [
  { icon: Globe, titulo: "Reservas directas, sin comisión", texto: "Tu propio link de reservas. El huésped reserva solo y no pagas el 15% de Booking." },
  { icon: CalendarRange, titulo: "Calendario claro", texto: "Todas tus habitaciones y fechas de un vistazo. Sin sobreventa, sin cuadernos." },
  { icon: ConciergeBell, titulo: "Check-in en segundos", texto: "Llegadas, salidas y cobros de saldo desde recepción, sin fricción." },
  { icon: Receipt, titulo: "Comprobantes y facturación", texto: "Cobros, facturas y comprobantes en PDF. Integración con SUNAT en camino." },
  { icon: BarChart3, titulo: "Reportes claros", texto: "Ocupación, ingresos y origen de tus reservas. Sin ser contador." },
  { icon: ShieldCheck, titulo: "En la nube, a salvo", texto: "Datos respaldados. Entra desde el celular o la compu, sin instalar nada." },
];

const PASOS = [
  { n: "1", titulo: "Crea tu cuenta gratis", texto: "Regístrate en 2 minutos y carga tus habitaciones. 14 días de prueba, sin tarjeta." },
  { n: "2", titulo: "Comparte tu link", texto: "Ponlo en WhatsApp, Instagram o Google y recibe reservas directas." },
  { n: "3", titulo: "Gestiona todo en un lugar", texto: "Calendario, check-in, cobros y reportes. Deja el cuaderno para siempre." },
];

// Preguntas frecuentes: específicas del producto y ordenadas para resolver
// objeciones de compra (facilidad → confianza → capacidades). Respuestas
// honestas (SUNAT en camino; suscripción por Yape/transferencia).
const FAQS = [
  {
    q: "¿Necesito instalar algo?",
    a: "No. Stanza funciona 100% en la nube, desde el navegador. Entras desde tu celular, tablet o computadora sin descargar ni instalar nada.",
  },
  {
    q: "¿Funciona desde cualquier dispositivo?",
    a: "Sí. Se usa igual de bien en el celular de recepción que en la computadora de la oficina. Solo necesitas internet.",
  },
  {
    q: "¿Cuánto tiempo toma empezar?",
    a: "Minutos. Creas tu cuenta, cargas tus habitaciones y ya puedes recibir reservas. Si quieres, te acompañamos por WhatsApp el primer día.",
  },
  {
    q: "¿Cómo funciona la prueba gratis?",
    a: "Tienes 14 días gratis con todas las funciones y sin tarjeta. Al terminar decides si continúas; si no, no se te cobra nada.",
  },
  {
    q: "¿Puedo cancelar cuando quiera?",
    a: "Sí. No hay contratos de permanencia: pagas mes a mes (o al año, con descuento) y cancelas cuando quieras. Tu información queda disponible para descargar.",
  },
  {
    q: "¿Mis datos están seguros?",
    a: "Sí. Tu información vive en la nube con respaldos, y cada hospedaje solo ve sus propios datos. Nada de cuadernos que se pierden ni archivos en una sola computadora.",
  },
  {
    q: "¿Funciona con SUNAT?",
    a: "Generas tus comprobantes (boletas y facturas) y los tienes en PDF. La conexión directa con SUNAT está en camino: dejamos todo listo para activarla en cuanto tengas tu emisor autorizado.",
  },
  {
    q: "¿Puedo administrar varios hospedajes?",
    a: "Sí. El plan Pro incluye gestión multipropiedad para manejar varias propiedades desde una sola cuenta. Escríbenos y lo configuramos contigo.",
  },
  {
    q: "¿Qué métodos de pago aceptan?",
    a: "Tu suscripción se paga por Yape o transferencia (el plan anual trae 2 meses gratis). Y a tus huéspedes les cobras en efectivo, Yape, Plin, tarjeta o transferencia, todo registrado en caja.",
  },
  {
    q: "¿Cómo funcionan las actualizaciones?",
    a: "Automáticas y sin costo. Como está en la nube, siempre usas la última versión con las mejoras nuevas; no tienes que instalar ni actualizar nada.",
  },
  {
    q: "¿Qué pasa si necesito ayuda?",
    a: "Nos escribes por WhatsApp y te ayuda una persona real, en español. En los planes superiores el soporte es prioritario.",
  },
];

export default function Inicio() {
  return (
    <div className="sitio-inicio">
      {/* ---------------- Hero ---------------- */}
      <section className="hero">
        <span className="s-eyebrow">
          <Sparkles size={14} aria-hidden="true" /> Hecho en Perú para hospedajes del Perú
        </span>
        <h1 className="hero__titulo">
          Moderniza tu hospedaje,{" "}
          <span className="hero__acento">sin complicarte</span>
        </h1>
        <p className="hero__lead">
          Deja el Excel y el cuaderno. Gestiona reservas directas{" "}
          <strong>sin comisión</strong>, recepción, caja y comprobantes en un solo sistema
          hecho para Perú. Precios claros, profesional y listo para usar hoy.
        </p>
        <div className="hero__acciones">
          <a className="s-btn s-btn--primary s-btn--lg" href="#/registro">
            Empieza gratis <ArrowRight size={18} aria-hidden="true" />
          </a>
          <a
            className="s-btn s-btn--ghost s-btn--lg"
            href={waLink("Hola, quiero una demo de Stanza para mi hospedaje.")}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={18} aria-hidden="true" /> Pídenos una demo
          </a>
        </div>
        <ul className="hero__bullets">
          <li><Check size={16} aria-hidden="true" /> 14 días gratis, sin tarjeta</li>
          <li><Check size={16} aria-hidden="true" /> 0% de comisión por reserva</li>
          <li><Check size={16} aria-hidden="true" /> Soporte por WhatsApp</li>
        </ul>

        <Reveal className="hero__mockup" delay={80}>
          <Frame url="stanza.pe/calendario">
            <CalendarMockup />
          </Frame>
        </Reveal>
      </section>

      {/* ---------------- Funciones (bento) ---------------- */}
      <section className="s-section">
        <Reveal className="s-head">
          <span className="s-head__eyebrow">Todo en un lugar</span>
          <h2>Lo que tu hospedaje necesita, sin lo que sobra</h2>
          <p>Fácil por fuera, potente por dentro. Nada de menús que abruman.</p>
        </Reveal>

        <div className="bento">
          {/* Tarjeta destacada con mockup */}
          <Reveal as="article" className="bento__card bento__card--feature">
            <div>
              <span className="s-ico s-ico--success" aria-hidden="true"><Globe size={22} /></span>
              <h3>Tu web de reservas, sin comisión</h3>
              <p>
                Comparte un link y recibe reservas directas. El huésped elige fechas, ve
                disponibilidad y reserva solo. La reserva es tuya —no de Booking— y no pagas
                comisión por noche.
              </p>
            </div>
            <Frame url="stanza.pe/reservar/tu-hospedaje">
              <DashboardMockup />
            </Frame>
          </Reveal>

          {FUNCIONES.slice(1).map((f, i) => (
            <Reveal as="article" key={f.titulo} className="bento__card" delay={i * 60}>
              <span className="s-ico" aria-hidden="true"><f.icon size={22} /></span>
              <h3>{f.titulo}</h3>
              <p>{f.texto}</p>
            </Reveal>
          ))}
        </div>

        <Reveal style={{ textAlign: "center", marginTop: "2rem" }}>
          <a className="s-btn s-btn--ghost" href="#/funciones">
            Ver todas las funciones <ArrowRight size={16} aria-hidden="true" />
          </a>
        </Reveal>
      </section>

      {/* ---------------- Cómo funciona ---------------- */}
      <section className="s-section s-section--alt">
        <Reveal className="s-head">
          <span className="s-head__eyebrow">En minutos</span>
          <h2>Empieza en 3 pasos</h2>
          <p>De la prueba gratis a tu primera reserva directa.</p>
        </Reveal>
        <div className="pasos">
          {PASOS.map((p, i) => (
            <Reveal as="article" key={p.n} className="paso" delay={i * 80}>
              <span className="paso__n">{p.n}</span>
              <h3>{p.titulo}</h3>
              <p>{p.texto}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- Confianza (honesta, sin inventar) ---------------- */}
      <section className="s-section">
        <Reveal className="confianza">
          {[
            { num: "0%", label: "Comisión por reserva" },
            { num: "14 días", label: "Prueba gratis, sin tarjeta" },
            { num: "5 min", label: "Para dejar listo tu hospedaje" },
            { num: "S/", label: "Precios en soles, claros" },
          ].map((c) => (
            <div key={c.label} className="confianza__item">
              <div className="confianza__num">{c.num}</div>
              <div className="confianza__label">{c.label}</div>
            </div>
          ))}
        </Reveal>
      </section>

      {/* ---------------- Preguntas frecuentes ---------------- */}
      <section id="faq" className="s-section s-section--alt">
        <Reveal className="s-head">
          <span className="s-head__eyebrow">Preguntas frecuentes</span>
          <h2>Lo que todo hospedaje pregunta antes de empezar</h2>
          <p>Y si te queda alguna duda, te respondemos por WhatsApp.</p>
        </Reveal>
        <Reveal className="faq-acc" delay={60}>
          {FAQS.map((f) => (
            <details key={f.q} className="faq-acc__item">
              <summary className="faq-acc__q">
                {f.q}
                <ChevronDown size={18} aria-hidden="true" className="faq-acc__chevron" />
              </summary>
              <p className="faq-acc__a">{f.a}</p>
            </details>
          ))}
        </Reveal>
      </section>

      {/* ---------------- CTA final ---------------- */}
      <section className="cta-final__wrap">
        <Reveal className="cta-final">
          <h2>¿Listo para dejar el Excel?</h2>
          <p>Prueba Stanza gratis 14 días o escríbenos y te ayudamos a empezar hoy.</p>
          <div className="cta-final__acciones">
            <a className="s-btn s-btn--primary s-btn--lg" href="#/registro">
              Crear mi cuenta gratis
            </a>
            <a className="s-btn s-btn--ghost s-btn--lg" href="#/precios">
              Ver precios
            </a>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
