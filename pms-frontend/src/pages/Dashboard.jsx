import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { useRuta } from "../router/Router";
import StatCard from "../components/StatCard";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import StateMessage from "../components/StateMessage";
import LinkReservas from "../components/LinkReservas";
import {
  ESTADO_HABITACION,
  ESTADO_LIMPIEZA,
  presentar,
} from "../config/estados";
import "./Dashboard.css";

const formatoMoneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

export default function Dashboard() {
  const resumen = useApi(api.resumenDashboard);
  const habitaciones = useApi(api.habitaciones);
  const { navegar } = useRuta();

  return (
    <div className="dashboard">
      {/* ---------- Encabezado de pagina ---------- */}
      <header className="dashboard__head">
        <div>
          <h1>Panel de control</h1>
          <p className="dashboard__subtitle">
            Resumen de tu hospedaje en tiempo real.
          </p>
        </div>
        <Button icon="+" onClick={() => navegar("reservas")}>
          Nueva reserva
        </Button>
      </header>

      {/* ---------- Link público de reservas (para compartir) ---------- */}
      <LinkReservas />

      {/* ---------- Tarjetas de KPI ---------- */}
      <section aria-labelledby="kpis-title">
        <h2 id="kpis-title" className="sr-only">
          Indicadores principales
        </h2>

        {resumen.loading && (
          <StateMessage variant="loading" title="Cargando datos…" />
        )}

        {resumen.error && (
          <Card>
            <StateMessage
              variant="error"
              title="No se pudieron cargar los indicadores"
              message={resumen.error}
              action={
                <Button variant="secondary" onClick={resumen.recargar}>
                  Reintentar
                </Button>
              }
            />
          </Card>
        )}

        {resumen.data && (
          <div className="dashboard__kpis">
            <StatCard
              icon="🏨"
              accent="brand"
              label="Habitaciones"
              value={resumen.data.total_habitaciones}
              hint={`${resumen.data.disponibles} disponibles`}
            />
            <StatCard
              icon="📈"
              accent="success"
              label="Ocupación"
              value={`${resumen.data.ocupacion_pct}%`}
              hint={`${resumen.data.ocupadas} ocupadas`}
            />
            <StatCard
              icon="🛎️"
              accent="warning"
              label="Check-ins pendientes"
              value={resumen.data.checkins_pendientes}
              hint={`${resumen.data.estancias_activas} estancias activas`}
            />
            <StatCard
              icon="💰"
              accent="success"
              label="Ingresos del mes"
              value={formatoMoneda.format(resumen.data.ingresos_mes)}
            />
          </div>
        )}
      </section>

      {/* ---------- Estado de habitaciones ---------- */}
      <section aria-labelledby="hab-title" className="dashboard__section">
        <h2 id="hab-title">Estado de habitaciones</h2>

        {habitaciones.loading && (
          <Card>
            <StateMessage variant="loading" title="Cargando habitaciones…" />
          </Card>
        )}

        {habitaciones.error && (
          <Card>
            <StateMessage
              variant="error"
              title="No se pudieron cargar las habitaciones"
              message={habitaciones.error}
              action={
                <Button variant="secondary" onClick={habitaciones.recargar}>
                  Reintentar
                </Button>
              }
            />
          </Card>
        )}

        {habitaciones.data && habitaciones.data.length === 0 && (
          <Card>
            <StateMessage
              variant="empty"
              title="Aún no hay habitaciones"
              message="Crea tu primera habitación para empezar a gestionar reservas."
              action={<Button icon="+">Crear habitación</Button>}
            />
          </Card>
        )}

        {habitaciones.data && habitaciones.data.length > 0 && (
          <div className="dashboard__rooms">
            {habitaciones.data.map((hab) => {
              const ocup = presentar(ESTADO_HABITACION, hab.estado);
              const limp = presentar(ESTADO_LIMPIEZA, hab.estado_limpieza);
              return (
                <Card key={hab.id} padding="sm" className="room">
                  <div className="room__head">
                    <span className="room__number">Hab. {hab.numero}</span>
                    <span className="room__type">{hab.tipo}</span>
                  </div>
                  <div className="room__price">
                    {formatoMoneda.format(hab.precio_base)}
                    <span className="room__price-unit"> / noche</span>
                  </div>
                  <div className="room__badges">
                    <Badge tone={ocup.tone} icon={ocup.icon}>
                      {ocup.label}
                    </Badge>
                    <Badge tone={limp.tone} icon={limp.icon}>
                      {limp.label}
                    </Badge>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
