import {
  Globe,
  CalendarRange,
  ConciergeBell,
  Receipt,
  BarChart3,
  Users,
  Check,
  ArrowRight,
} from "lucide-react";
import { Reveal } from "./useReveal";
import {
  Frame,
  CalendarMockup,
  DashboardMockup,
  ReservaMockup,
  RecepcionMockup,
  ComprobanteMockup,
  EquipoMockup,
} from "./Mockups";

/**
 * Funciones — detalle por área, con foco en beneficios. Algunas áreas llevan un
 * mockup de producto para dar peso visual; el resto, una lista de puntos.
 */
const AREAS = [
  {
    icon: Globe,
    titulo: "Motor de reservas y link público",
    intro: "Tu propia página de reservas, sin intermediarios.",
    puntos: [
      "Link único para WhatsApp, Instagram o Google",
      "El huésped elige fechas, ve disponibilidad y reserva solo",
      "0% de comisión: la reserva es tuya, no de Booking",
      "Personaliza tu URL con el nombre de tu hospedaje",
    ],
    mockup: "reserva",
  },
  {
    icon: CalendarRange,
    titulo: "Calendario tipo timeline",
    intro: "Todas tus habitaciones y fechas, de un vistazo.",
    puntos: [
      "Vista habitación × día, como los PMS profesionales",
      "Arrastra y mueve reservas entre habitaciones",
      "Bloqueo automático de sobreventa",
      "Crea reservas directo desde una celda libre",
    ],
    mockup: "calendar",
  },
  {
    icon: ConciergeBell,
    titulo: "Recepción: check-in y check-out",
    intro: "El día a día de tu recepción, sin fricción.",
    puntos: [
      "Check-in y check-out en segundos",
      "Cobro de saldos con Yape, Plin, tarjeta o efectivo",
      "Estado de cada habitación (limpia, ocupada, mantenimiento)",
      "Cobro por noches reales al entrar o salir",
    ],
    mockup: "recepcion",
  },
  {
    icon: Receipt,
    titulo: "Facturación y comprobantes",
    intro: "Comprobantes al día, pensado para Perú.",
    puntos: [
      "Genera comprobantes desde cada factura pagada",
      "Historial de comprobantes y facturas",
      "Descarga en PDF",
      "Integración con SUNAT en camino",
    ],
    mockup: "comprobante",
  },
  {
    icon: BarChart3,
    titulo: "Reportes y control",
    intro: "Sabe cómo va tu negocio sin ser contador.",
    puntos: [
      "Ocupación diaria y promedio del mes",
      "Ingresos y ticket promedio",
      "Origen de reservas: link público vs. recepción",
      "Indicadores clave en un panel claro",
    ],
    mockup: "dashboard",
  },
  {
    icon: Users,
    titulo: "Multiusuario y roles",
    intro: "Tú y tu equipo, cada uno con lo suyo.",
    puntos: [
      "Cuentas de recepción con permisos limitados",
      "Admin ve reportes e ingresos; recepción, la operación",
      "Modo claro/oscuro y diseño accesible",
      "Desde el celular o la compu, sin instalar nada",
    ],
    mockup: "equipo",
  },
];

// Cada área tiene un mockup COHERENTE con su mensaje (no un dashboard genérico
// repetido). El url del "navegador" también refuerza la sección.
const MOCKUPS = {
  reserva: { url: "vantry.pe/reservar/tu-hospedaje", Comp: ReservaMockup },
  calendar: { url: "vantry.pe/calendario", Comp: CalendarMockup },
  recepcion: { url: "vantry.pe/recepcion", Comp: RecepcionMockup },
  comprobante: { url: "vantry.pe/comprobantes", Comp: ComprobanteMockup },
  dashboard: { url: "vantry.pe/reportes", Comp: DashboardMockup },
  equipo: { url: "vantry.pe/usuarios", Comp: EquipoMockup },
};

function MockupDe({ tipo }) {
  const m = MOCKUPS[tipo] || MOCKUPS.reserva;
  const Comp = m.Comp;
  return (
    <Frame url={m.url}>
      <Comp />
    </Frame>
  );
}

export default function Funciones() {
  return (
    <div className="sitio-funciones">
      <div className="pagina-head">
        <h1>Un PMS completo, sin la complejidad</h1>
        <p>
          Reservas, calendario, recepción, facturación y reportes. Todo lo que un hospedaje
          pequeño o mediano necesita para dejar el Excel.
        </p>
      </div>

      {AREAS.map((a, i) => (
        <Reveal as="section" key={a.titulo} className={`area ${i % 2 === 1 ? "area--alt" : ""}`}>
          <div className="area__texto">
            <span className="s-ico" aria-hidden="true"><a.icon size={22} /></span>
            <h2 className="area__titulo">{a.titulo}</h2>
            <p className="area__intro">{a.intro}</p>
            <ul className="area__puntos">
              {a.puntos.map((p) => (
                <li key={p}>
                  <Check size={16} aria-hidden="true" className="area__check" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="area__visual">
            <MockupDe tipo={a.mockup} />
          </div>
        </Reveal>
      ))}

      <section className="cta-final__wrap">
        <Reveal className="cta-final">
          <h2>Pruébalo con tu propio hospedaje</h2>
          <p>14 días gratis, sin tarjeta. Verás la diferencia el primer día.</p>
          <div className="cta-final__acciones">
            <a className="s-btn s-btn--primary s-btn--lg" href="#/registro">
              Empieza gratis <ArrowRight size={18} aria-hidden="true" />
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
