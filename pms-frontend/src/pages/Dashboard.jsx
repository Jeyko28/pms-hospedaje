import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { useRuta } from "../router/Router";
import StatCard from "../components/StatCard";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import StateMessage from "../components/StateMessage";
import Skeleton from "../components/Skeleton";
import LinkReservas from "../components/LinkReservas";
import { useToast } from "../components/Toast";
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

// Fecha larga y legible: "sábado, 14 de junio".
function fechaLarga(iso) {
  const d = new Date((iso || "") + "T00:00:00");
  if (isNaN(d)) return "";
  const t = d.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function Dashboard() {
  const resumen = useApi(api.resumenDashboard);
  const habitaciones = useApi(api.habitaciones);
  const agenda = useApi(api.agendaDashboard);
  const { navegar } = useRuta();
  const toast = useToast();

  const [accionId, setAccionId] = useState(null); // id en proceso (check-in/out)

  // Refresca TODO el panel (tras una acción o por el auto-refresco).
  function recargarTodo() {
    resumen.recargar();
    habitaciones.recargar();
    agenda.recargar();
  }

  // Auto-refresco: el subtítulo promete "tiempo real". Cada 60s y al volver a
  // la pestaña, así llegadas/salidas y KPIs se mantienen al día sin recargar.
  useEffect(() => {
    const intervalo = setInterval(recargarTodo, 60000);
    const alVolver = () => {
      if (document.visibilityState === "visible") recargarTodo();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function hacerCheckin(reservaId) {
    setAccionId("in-" + reservaId);
    try {
      await api.checkin(reservaId);
      toast.success("Check-in registrado.");
      recargarTodo();
    } catch (e) {
      toast.error(e.message || "No se pudo hacer el check-in.");
    } finally {
      setAccionId(null);
    }
  }

  async function hacerCheckout(estanciaId) {
    setAccionId("out-" + estanciaId);
    try {
      await api.checkout(estanciaId);
      toast.success("Check-out completado.");
      recargarTodo();
    } catch (e) {
      toast.error(e.message || "No se pudo hacer el check-out.");
    } finally {
      setAccionId(null);
    }
  }

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

        {resumen.loading && !resumen.data && (
          <div className="dashboard__kpis">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} padding="md" className="statcard">
                <div className="statcard__top">
                  <Skeleton width={44} height={44} radius="var(--radius-md)" />
                  <Skeleton width="55%" height={12} />
                </div>
                <Skeleton width="50%" height={28} />
                <Skeleton width="40%" height={12} />
              </Card>
            ))}
          </div>
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
              hint={`${resumen.data.ocupadas} ocupadas · ${resumen.data.reservadas ?? 0} reservadas`}
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

      {/* Aviso: huéspedes que ya debieron salir y siguen con check-in. */}
      {resumen.data && resumen.data.salidas_vencidas > 0 && (
        <div className="dashboard__alerta" role="alert">
          <strong>{resumen.data.salidas_vencidas}</strong>{" "}
          {resumen.data.salidas_vencidas === 1
            ? "habitación con salida vencida"
            : "habitaciones con salida vencida"}
          : hay huéspedes que ya debieron hacer check-out. Ciérralas en{" "}
          <button className="dashboard__alerta-link" onClick={() => navegar("recepcion")}>
            Recepción
          </button>
          .
        </div>
      )}

      {/* ---------- Agenda del día (llegan / salen hoy) ---------- */}
      <section aria-labelledby="agenda-title" className="dashboard__section">
        <div className="dashboard__section-head">
          <h2 id="agenda-title">Hoy</h2>
          {agenda.data && (
            <span className="dashboard__fecha">{fechaLarga(agenda.data.fecha)}</span>
          )}
        </div>

        {agenda.loading && !agenda.data && (
          <Card><StateMessage variant="loading" title="Cargando agenda…" /></Card>
        )}

        {agenda.data && (
          <div className="dashboard__agenda">
            {/* Llegadas */}
            <Card padding="sm" className="agenda-col">
              <div className="agenda-col__head">
                <span className="agenda-col__titulo">Llegan hoy</span>
                <span className="agenda-col__contador">{agenda.data.llegadas_hoy.length}</span>
              </div>
              {agenda.data.llegadas_hoy.length === 0 ? (
                <p className="agenda-col__vacio">Sin llegadas para hoy.</p>
              ) : (
                <ul className="agenda-col__lista">
                  {agenda.data.llegadas_hoy.map((r) => (
                    <li key={r.reserva_id} className="agenda-item">
                      <div className="agenda-item__info">
                        <span className="agenda-item__nombre">{r.huesped}</span>
                        <span className="agenda-item__meta">
                          Hab. {r.habitacion} · {r.tipo} · {formatoMoneda.format(r.total || 0)}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => hacerCheckin(r.reserva_id)}
                        loading={accionId === "in-" + r.reserva_id}
                      >
                        Check-in
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Salidas */}
            <Card padding="sm" className="agenda-col">
              <div className="agenda-col__head">
                <span className="agenda-col__titulo">Salen hoy</span>
                <span className="agenda-col__contador">{agenda.data.salidas_hoy.length}</span>
              </div>
              {agenda.data.salidas_hoy.length === 0 ? (
                <p className="agenda-col__vacio">Sin salidas para hoy.</p>
              ) : (
                <ul className="agenda-col__lista">
                  {agenda.data.salidas_hoy.map((s) => {
                    const conSaldo = s.saldo > 0;
                    return (
                      <li key={s.estancia_id} className="agenda-item">
                        <div className="agenda-item__info">
                          <span className="agenda-item__nombre">{s.huesped}</span>
                          <span className="agenda-item__meta">
                            Hab. {s.habitacion} · {s.tipo}
                            {conSaldo && (
                              <> · <strong className="agenda-item__saldo">
                                Debe {formatoMoneda.format(s.saldo)}
                              </strong></>
                            )}
                          </span>
                        </div>
                        {conSaldo ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => navegar("recepcion")}
                          >
                            Cobrar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => hacerCheckout(s.estancia_id)}
                            loading={accionId === "out-" + s.estancia_id}
                          >
                            Check-out
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
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
