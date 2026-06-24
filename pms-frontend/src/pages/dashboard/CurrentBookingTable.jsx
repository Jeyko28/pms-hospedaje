import { MoreHorizontal } from "lucide-react";
import Card from "../../components/Card";
import Badge from "../../components/Badge";
import { ESTADO_RESERVA, presentar } from "../../config/estados";
import "./widgets.css";

const fechaCorta = (iso) => {
  const d = new Date((iso || "") + "T00:00:00");
  if (isNaN(d)) return iso || "—";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * CurrentBookingTable — últimas reservas (Room, Name, Check In, Check Out,
 * Mobile, Status, Acción). El botón de acción y "Ver todas" llevan al
 * Calendario / Reservas (no reinventa las acciones que ya existen allí).
 *
 * Props: bookings = [{reserva_id, room, name, mobile, checkin, checkout, estado}]
 *        onVerTodas, onAccion (callbacks de navegación)
 */
export default function CurrentBookingTable({ bookings, onVerTodas, onAccion }) {
  const filas = bookings || [];
  return (
    <Card padding="md" className="cbt">
      <div className="widget__head">
        <h2 className="widget__title">Reservas recientes</h2>
        <button type="button" className="widget__link" onClick={onVerTodas}>
          Ver todas
        </button>
      </div>

      {filas.length === 0 ? (
        <p className="widget__empty">Aún no hay reservas registradas.</p>
      ) : (
        <div className="cbt__scroll">
          <table className="cbt__table">
            <thead>
              <tr>
                <th>Hab.</th>
                <th>Huésped</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Móvil</th>
                <th>Estado</th>
                <th aria-label="Acciones"></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((b) => {
                const est = presentar(ESTADO_RESERVA, b.estado);
                return (
                  <tr key={b.reserva_id}>
                    <td className="cbt__room">{b.room}</td>
                    <td className="cbt__name">{b.name}</td>
                    <td>{fechaCorta(b.checkin)}</td>
                    <td>{fechaCorta(b.checkout)}</td>
                    <td className="cbt__mobile">{b.mobile || "—"}</td>
                    <td>
                      <Badge tone={est.tone} icon={est.icon}>
                        {est.label}
                      </Badge>
                    </td>
                    <td className="cbt__actions">
                      <button
                        type="button"
                        className="cbt__action"
                        aria-label={`Ver reserva de ${b.name} en el calendario`}
                        onClick={onAccion}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
