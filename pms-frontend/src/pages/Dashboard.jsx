import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { useRuta } from "../router/Router";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import StateMessage from "../components/StateMessage";
import Skeleton from "../components/Skeleton";
import LinkReservas from "../components/LinkReservas";
import { useToast } from "../components/Toast";
import { useAuth } from "../auth/AuthContext";
import { abrirWhatsApp, mensajeConfirmacion } from "../utils/whatsapp";
import {
  ESTADO_HABITACION,
  ESTADO_LIMPIEZA,
  presentar,
} from "../config/estados";
import KpiCard from "./dashboard/KpiCard";
import CurrentBookingTable from "./dashboard/CurrentBookingTable";
import GuestList from "./dashboard/GuestList";
import { SparkBars, MiniLine, MiniPie, C } from "./dashboard/charts";
import "./Dashboard.css";
import "./dashboard/widgets.css";

const formatoMoneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});
const moneda0 = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  maximumFractionDigits: 0,
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
  const overview = useApi(api.dashboardOverview);
  const { navegar } = useRuta();
  const toast = useToast();
  const { usuario, esAdmin } = useAuth();

  // Datos del negocio: solo el admin los consulta (recepción no tiene acceso),
  // para mostrar el aviso de "completa tu RUC" si aún faltan datos fiscales.
  const miHosp = useApi(
    () => (esAdmin ? api.miHospedaje() : Promise.resolve(null)),
    [esAdmin]
  );
  const faltaRuc = esAdmin && miHosp.data && !((miHosp.data.ruc || "").trim());

  const [accionId, setAccionId] = useState(null); // id en proceso (check-in/out/confirmar)

  // Confirmar una reserva pendiente (típicamente del link) y avisar al huésped
  // por WhatsApp con el mensaje ya armado. Cierra el ciclo del canal directo.
  async function confirmarYAvisar(p) {
    setAccionId("conf-" + p.reserva_id);
    try {
      await api.confirmarReserva(p.reserva_id);
      const texto = mensajeConfirmacion({
        hospedaje: usuario?.hospedaje_nombre,
        huesped: p.huesped,
        room: p.room,
        tipo: p.tipo,
        checkin: p.checkin,
        checkout: p.checkout,
        total: p.total,
      });
      const abrio = abrirWhatsApp(p.telefono, texto);
      toast.success(
        abrio
          ? "Reserva confirmada. Abriendo WhatsApp para avisar al huésped…"
          : "Reserva confirmada (este huésped no dejó teléfono para WhatsApp)."
      );
      recargarTodo();
    } catch (e) {
      toast.error(e.message || "No se pudo confirmar la reserva.");
    } finally {
      setAccionId(null);
    }
  }

  function recargarTodo() {
    resumen.recargar();
    habitaciones.recargar();
    agenda.recargar();
    overview.recargar();
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

  const ov = overview.data;
  const k = ov?.kpis;
  return (
    <div className="dashboard">
      {/* ---------- Encabezado ---------- */}
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

      {/* ---------- Onboarding: completar datos del negocio ---------- */}
      {faltaRuc && (
        <div className="dashboard__aviso-negocio" role="status">
          <span className="dashboard__aviso-negocio-texto">
            <strong>Completa los datos de tu negocio</strong> (RUC, razón social,
            dirección) para que tus facturas y comprobantes salgan correctos.
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navegar("configuracion")}
          >
            Completar ahora
          </Button>
        </div>
      )}

      {/* ---------- Link público de reservas ---------- */}
      <LinkReservas />

      {/* ---------- Reservas nuevas por confirmar (cierre del ciclo del link) ---------- */}
      {ov && ov.pendientes_por_confirmar?.length > 0 && (
        <Card padding="md" className="pendientes">
          <div className="pendientes__head">
            <span className="pendientes__titulo">
              🔔 {ov.pendientes_por_confirmar.length}{" "}
              {ov.pendientes_por_confirmar.length === 1
                ? "reserva nueva por confirmar"
                : "reservas nuevas por confirmar"}
            </span>
            <button className="widget__link" onClick={() => navegar("reservas")}>
              Ver en Reservas
            </button>
          </div>
          <ul className="pendientes__lista">
            {ov.pendientes_por_confirmar.slice(0, 5).map((p) => (
              <li key={p.reserva_id} className="pendientes__item">
                <div className="pendientes__info">
                  <span className="pendientes__nombre">
                    {p.huesped}
                    {p.origen === "publico" && (
                      <Badge tone="brand" icon="🔗">Link</Badge>
                    )}
                  </span>
                  <span className="pendientes__meta">
                    Hab. {p.room} · {p.tipo} ·{" "}
                    {new Date(p.checkin + "T00:00:00").toLocaleDateString("es-PE", {
                      day: "2-digit",
                      month: "short",
                    })}{" "}
                    →{" "}
                    {new Date(p.checkout + "T00:00:00").toLocaleDateString("es-PE", {
                      day: "2-digit",
                      month: "short",
                    })}{" "}
                    · {formatoMoneda.format(p.total || 0)}
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => confirmarYAvisar(p)}
                  loading={accionId === "conf-" + p.reserva_id}
                >
                  Confirmar y avisar
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ---------- KPIs con mini-gráficos ---------- */}
      <section aria-labelledby="kpis-title">
        <h2 id="kpis-title" className="sr-only">Indicadores principales</h2>

        {overview.loading && !ov && (
          <div className="dashboard__kpis">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} padding="md" className="kpi">
                <div className="kpi__main">
                  <Skeleton width="60%" height={12} />
                  <div style={{ height: 8 }} />
                  <Skeleton width="45%" height={26} />
                  <div style={{ height: 8 }} />
                  <Skeleton width="35%" height={12} />
                </div>
                <Skeleton width={64} height={48} radius="var(--radius-md)" />
              </Card>
            ))}
          </div>
        )}

        {overview.error && (
          <Card>
            <StateMessage
              variant="error"
              title="No se pudieron cargar los indicadores"
              message={overview.error}
              action={<Button variant="secondary" onClick={overview.recargar}>Reintentar</Button>}
            />
          </Card>
        )}

        {k && (() => {
          const donut = k.available_rooms.donut;
          const totalHab = k.available_rooms.total || 0;
          const ocupPct = totalHab
            ? Math.round(((donut.ocupadas + donut.reservadas) / totalHab) * 100)
            : 0;
          const donutSegs = [
            { name: "Ocupadas", value: donut.ocupadas, color: C.brand },
            { name: "Reservadas", value: donut.reservadas, color: C.warning },
            { name: "Disponibles", value: donut.disponibles, color: C.success },
            { name: "No listas", value: donut.not_ready, color: C.neutral },
          ];
          return (
            <div className="dashboard__kpis">
              <KpiCard
                title="Nuevas reservas"
                value={k.new_booking.valor}
                trendPct={k.new_booking.trend_pct}
                hint="este mes"
                chart={<SparkBars data={k.new_booking.spark} />}
              />
              <KpiCard
                title="Ocupación hoy"
                value={`${ocupPct}%`}
                hint={`${k.available_rooms.valor} libres de ${totalHab}`}
                chart={<MiniPie inner={16} segments={donutSegs} />}
              />
              {/* Revenue solo si el backend lo envía (admin). Recepción ve un KPI operativo. */}
              {k.revenue ? (
                <KpiCard
                  title="Ingresos del mes"
                  value={moneda0.format(k.revenue.valor)}
                  trendPct={k.revenue.trend_pct}
                  hint="cobrado"
                  chart={<MiniLine data={k.revenue.linea} />}
                />
              ) : (
                <KpiCard
                  title="Check-ins pendientes"
                  value={resumen.data?.checkins_pendientes ?? 0}
                  hint={`${resumen.data?.estancias_activas ?? 0} estancias activas`}
                />
              )}
              <KpiCard
                title="Check-outs"
                value={k.checkout.valor}
                trendPct={k.checkout.trend_pct}
                hint="este mes"
              />
            </div>
          );
        })()}
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

      {/* ---------- Reservas recientes (tabla) ---------- */}
      {ov && (
        <CurrentBookingTable
          bookings={ov.current_bookings}
          onVerTodas={() => navegar("reservas")}
          onAccion={() => navegar("calendario")}
        />
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
                            <Button size="sm" variant="secondary" onClick={() => navegar("recepcion")}>
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

      {/* ---------- Huéspedes recientes ---------- */}
      {ov && <GuestList guests={ov.guest_list} onVerTodos={() => navegar("huespedes")} />}

      {/* ---------- Estado de habitaciones ---------- */}
      <section aria-labelledby="hab-title" className="dashboard__section">
        <h2 id="hab-title">Estado de habitaciones</h2>

        {habitaciones.loading && (
          <Card><StateMessage variant="loading" title="Cargando habitaciones…" /></Card>
        )}

        {habitaciones.error && (
          <Card>
            <StateMessage
              variant="error"
              title="No se pudieron cargar las habitaciones"
              message={habitaciones.error}
              action={<Button variant="secondary" onClick={habitaciones.recargar}>Reintentar</Button>}
            />
          </Card>
        )}

        {habitaciones.data && habitaciones.data.length === 0 && (
          <Card>
            <StateMessage
              variant="empty"
              title="Aún no hay habitaciones"
              message="Crea tu primera habitación para empezar a gestionar reservas."
              action={<Button icon="+" onClick={() => navegar("habitaciones")}>Crear habitación</Button>}
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
                    <Badge tone={ocup.tone} icon={ocup.icon}>{ocup.label}</Badge>
                    <Badge tone={limp.tone} icon={limp.icon}>{limp.label}</Badge>
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
