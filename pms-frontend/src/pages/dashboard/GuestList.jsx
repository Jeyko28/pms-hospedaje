import Card from "../../components/Card";
import "./widgets.css";

const iniciales = (nombre) =>
  (nombre || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("") || "?";

const fechaCorta = (iso) => {
  const d = new Date((iso || "") + "T00:00:00");
  if (isNaN(d)) return iso || "—";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
};

/**
 * GuestList — huéspedes recientes (avatar de iniciales, nombre, habitación,
 * fecha de entrada). "Ver todos" lleva a la sección Huéspedes.
 *
 * Props: guests = [{nombre, room, tipo, fecha}], onVerTodos
 */
export default function GuestList({ guests, onVerTodos }) {
  const lista = guests || [];
  return (
    <Card padding="md" className="glist">
      <div className="widget__head">
        <h2 className="widget__title">Huéspedes recientes</h2>
        <button type="button" className="widget__link" onClick={onVerTodos}>
          Ver todos
        </button>
      </div>

      {lista.length === 0 ? (
        <p className="widget__empty">Aún no hay huéspedes.</p>
      ) : (
        <ul className="glist__items">
          {lista.map((g, i) => (
            <li key={i} className="glist__item">
              <span className="glist__avatar" aria-hidden="true">
                {iniciales(g.nombre)}
              </span>
              <div className="glist__info">
                <span className="glist__name">{g.nombre}</span>
                <span className="glist__meta">
                  Hab. {g.room} · {g.tipo}
                </span>
              </div>
              <span className="glist__fecha">{fechaCorta(g.fecha)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
