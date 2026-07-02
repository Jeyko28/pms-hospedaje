import {
  Globe,
  CalendarRange,
  ConciergeBell,
  Receipt,
  BarChart3,
  Users,
  Check,
} from "lucide-react";

/**
 * Funciones — detalle de lo que hace Stanza, por área, con foco en beneficios
 * (no en jerga técnica). Cada bloque alterna el lado del texto/lista.
 */

const AREAS = [
  {
    icon: Globe,
    titulo: "Motor de reservas y link público",
    intro: "Tu propia página de reservas, sin intermediarios.",
    puntos: [
      "Link único para compartir en WhatsApp, Instagram o Google",
      "El huésped elige fechas, ve disponibilidad y reserva solo",
      "0% de comisión: la reserva es tuya, no de Booking",
      "Personaliza tu URL con el nombre de tu hospedaje",
    ],
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
  },
  {
    icon: Receipt,
    titulo: "Facturación y boleta electrónica",
    intro: "Comprobantes al día, pensado para Perú.",
    puntos: [
      "Emite boletas desde cada factura pagada",
      "Historial de comprobantes y facturas",
      "Descarga en PDF",
      "Base lista para SUNAT en producción",
    ],
  },
  {
    icon: BarChart3,
    titulo: "Reportes y control",
    intro: "Sabe cómo va tu negocio sin ser contador.",
    puntos: [
      "Ocupación diaria y promedio del mes",
      "Ingresos y ticket promedio",
      "Origen de reservas: link público vs. recepción",
      "Panel con los indicadores clave del hospedaje",
    ],
  },
  {
    icon: Users,
    titulo: "Multiusuario y roles",
    intro: "Tú y tu equipo, cada uno con lo suyo.",
    puntos: [
      "Cuentas para recepción con permisos limitados",
      "El administrador ve reportes e ingresos; recepción, la operación",
      "Modo claro/oscuro y diseño accesible",
      "Entra desde el celular o la compu, sin instalar nada",
    ],
  },
];

export default function Funciones() {
  return (
    <div className="sitio-funciones">
      <section className="pagina-head">
        <h1>Funciones</h1>
        <p>
          Un PMS completo para hospedajes pequeños y medianos: reservas, calendario,
          recepción, facturación y reportes. Simple por fuera, potente por dentro.
        </p>
      </section>

      {AREAS.map((a, i) => (
        <section key={a.titulo} className={`area ${i % 2 === 1 ? "area--alt" : ""}`}>
          <div className="area__texto">
            <span className="area__icon" aria-hidden="true">
              <a.icon size={24} />
            </span>
            <h2 className="area__titulo">{a.titulo}</h2>
            <p className="area__intro">{a.intro}</p>
          </div>
          <ul className="area__puntos">
            {a.puntos.map((p) => (
              <li key={p}>
                <Check size={16} aria-hidden="true" className="area__check" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="cta-final">
        <h2>Pruébalo con tu propio hospedaje</h2>
        <p>14 días gratis, sin tarjeta. Verás la diferencia el primer día.</p>
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
