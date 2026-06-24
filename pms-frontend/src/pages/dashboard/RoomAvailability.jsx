import Card from "../../components/Card";
import "./widgets.css";

/**
 * RoomAvailability — composición de habitaciones HOY: barra apilada +
 * cuadrícula con los números (Ocupadas / Reservadas / Disponibles / No listas).
 * "No listas" = en mantenimiento o sucias (no vendibles ahora).
 *
 * Props: donut = { ocupadas, reservadas, disponibles, not_ready }
 */
export default function RoomAvailability({ donut }) {
  const d = donut || { ocupadas: 0, reservadas: 0, disponibles: 0, not_ready: 0 };
  const total = d.ocupadas + d.reservadas + d.disponibles + d.not_ready;
  const pct = (n) => (total ? (n / total) * 100 : 0);

  const segmentos = [
    { key: "ocupadas", label: "Ocupadas", value: d.ocupadas, clase: "ocup" },
    { key: "reservadas", label: "Reservadas", value: d.reservadas, clase: "resv" },
    { key: "disponibles", label: "Disponibles", value: d.disponibles, clase: "disp" },
    { key: "not_ready", label: "No listas", value: d.not_ready, clase: "noready" },
  ];

  return (
    <Card padding="md" className="ravail">
      <h2 className="widget__title">Disponibilidad de habitaciones</h2>

      <div className="ravail__bar" role="img" aria-label={`Total ${total} habitaciones`}>
        {total === 0 ? (
          <div className="ravail__seg ravail__seg--empty" style={{ width: "100%" }} />
        ) : (
          segmentos
            .filter((s) => s.value > 0)
            .map((s) => (
              <div
                key={s.key}
                className={`ravail__seg ravail__seg--${s.clase}`}
                style={{ width: `${pct(s.value)}%` }}
                title={`${s.label}: ${s.value}`}
              />
            ))
        )}
      </div>

      <div className="ravail__grid">
        {segmentos.map((s) => (
          <div key={s.key} className="ravail__cell">
            <span className={`ravail__dot ravail__dot--${s.clase}`} aria-hidden="true" />
            <div>
              <p className="ravail__num">{s.value}</p>
              <p className="ravail__label">{s.label}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
