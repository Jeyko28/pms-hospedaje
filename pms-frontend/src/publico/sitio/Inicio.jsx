import {
  CalendarRange,
  Globe,
  ConciergeBell,
  Receipt,
  BarChart3,
  ShieldCheck,
  Star,
  MessageCircle,
  Check,
} from "lucide-react";
import { waLink } from "./datos";

/**
 * Inicio — landing principal del sitio. Mensaje central (de ANALISIS_COMPETITIVO):
 * simple, en soles, sin comisiones. Diferenciador estrella: motor de reservas
 * propio sin pagar comisión a Booking.
 */

const FUNCIONES = [
  {
    icon: Globe,
    titulo: "Tu web de reservas, sin comisión",
    texto:
      "Recibe reservas directas por tu propio link. El huésped reserva solo y tú no pagas el 15% de Booking. El link es tuyo para siempre.",
  },
  {
    icon: CalendarRange,
    titulo: "Calendario claro",
    texto:
      "Ve todas tus habitaciones y fechas de un vistazo. Arrastra, mueve y evita sobreventa sin cuadernos ni Excel.",
  },
  {
    icon: ConciergeBell,
    titulo: "Check-in y check-out en segundos",
    texto:
      "Registra llegadas y salidas, cobra saldos y controla el estado de cada habitación desde recepción.",
  },
  {
    icon: Receipt,
    titulo: "Boleta electrónica",
    texto:
      "Emite comprobantes y lleva tu facturación al día, pensado para las reglas de Perú.",
  },
  {
    icon: BarChart3,
    titulo: "Reportes que entiendes",
    texto:
      "Ocupación, ingresos y origen de tus reservas. Sabe cómo va tu hospedaje sin ser contador.",
  },
  {
    icon: ShieldCheck,
    titulo: "En la nube, siempre a salvo",
    texto:
      "Tus datos guardados y respaldados. Entra desde el celular o la compu, sin instalar nada.",
  },
];

const PASOS = [
  {
    n: "1",
    titulo: "Crea tu cuenta gratis",
    texto: "Regístrate en 2 minutos y carga tus habitaciones. 14 días de prueba, sin tarjeta.",
  },
  {
    n: "2",
    titulo: "Comparte tu link de reservas",
    texto: "Ponlo en tu WhatsApp, Instagram o Google y empieza a recibir reservas directas.",
  },
  {
    n: "3",
    titulo: "Gestiona todo desde un lugar",
    texto: "Calendario, check-in, cobros y reportes. Deja el cuaderno para siempre.",
  },
];

export default function Inicio() {
  return (
    <div className="sitio-inicio">
      {/* ---------------- Hero ---------------- */}
      <section className="hero">
        <span className="hero__badge">
          <Star size={14} aria-hidden="true" /> Precio fundador — S/99/mes de por vida
        </span>
        <h1 className="hero__titulo">
          El software simple para tu hospedaje, <span className="hero__acento">en soles</span>
        </h1>
        <p className="hero__lead">
          Reservas, calendario, check-in y boletas en un solo lugar. Recibe reservas
          directas por tu propia web <strong>sin pagar comisión a Booking</strong>. Tan
          fácil que lo usas el primer día.
        </p>
        <div className="hero__acciones">
          <a className="sitio__btn-primary sitio__btn-lg" href="#/registro">
            Empieza gratis
          </a>
          <a
            className="sitio__btn-ghost sitio__btn-lg"
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
      </section>

      {/* ---------------- Funciones destacadas ---------------- */}
      <section className="bloque">
        <div className="bloque__head">
          <h2>Todo lo que tu hospedaje necesita</h2>
          <p>Sin funciones que sobran ni menús que abruman. Lo justo, bien hecho.</p>
        </div>
        <div className="grid-funciones">
          {FUNCIONES.map((f) => (
            <article key={f.titulo} className="func-card">
              <span className="func-card__icon" aria-hidden="true">
                <f.icon size={22} />
              </span>
              <h3 className="func-card__titulo">{f.titulo}</h3>
              <p className="func-card__texto">{f.texto}</p>
            </article>
          ))}
        </div>
        <div className="bloque__cta-inline">
          <a className="sitio__link-fuerte" href="#/funciones">
            Ver todas las funciones →
          </a>
        </div>
      </section>

      {/* ---------------- Cómo funciona ---------------- */}
      <section className="bloque bloque--alt">
        <div className="bloque__head">
          <h2>Empieza en 3 pasos</h2>
          <p>De la prueba gratis a recibir tu primera reserva directa.</p>
        </div>
        <div className="grid-pasos">
          {PASOS.map((p) => (
            <article key={p.n} className="paso-card">
              <span className="paso-card__num">{p.n}</span>
              <h3 className="paso-card__titulo">{p.titulo}</h3>
              <p className="paso-card__texto">{p.texto}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------- CTA final ---------------- */}
      <section className="cta-final">
        <h2>¿Listo para dejar el Excel?</h2>
        <p>Prueba Stanza gratis 14 días o escríbenos y te ayudamos a empezar hoy.</p>
        <div className="cta-final__acciones">
          <a className="sitio__btn-primary sitio__btn-lg" href="#/registro">
            Crear mi cuenta gratis
          </a>
          <a className="sitio__btn-ghost sitio__btn-lg" href="#/precios">
            Ver precios
          </a>
        </div>
      </section>
    </div>
  );
}
