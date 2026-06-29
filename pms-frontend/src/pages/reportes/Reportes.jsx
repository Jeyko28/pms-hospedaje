import { useCallback, useMemo, useState } from "react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import StatCard from "../../components/StatCard";
import Button from "../../components/Button";
import StateMessage from "../../components/StateMessage";
import Field from "../../components/Field";
import Dona from "./Dona";
import {
  IngresosChart,
  ReservationChart,
  BookingSourceChart,
  VisitorsChart,
} from "../dashboard/charts";
import "./Reportes.css";

const mesCorto = (mes) => {
  const [y, m] = (mes || "").split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  if (isNaN(d)) return mes;
  const t = d.toLocaleDateString("es-PE", { month: "short" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const diaSemana = (iso) => {
  const d = new Date((iso || "") + "T00:00:00");
  if (isNaN(d)) return "";
  const t = d.toLocaleDateString("es-PE", { weekday: "short" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const formatoMoneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

// Etiqueta y color por método de pago. Colores con tokens (adaptan a oscuro).
const METODO = {
  efectivo: { label: "Efectivo", color: "var(--color-success-600)" },
  yape: { label: "Yape", color: "var(--color-brand-600)" },
  plin: { label: "Plin", color: "var(--color-warning-600)" },
  tarjeta: { label: "Tarjeta", color: "var(--color-danger-600)" },
  transferencia: { label: "Transferencia", color: "var(--color-neutral-500)" },
};
const PALETA = [
  "var(--color-success-600)", "var(--color-brand-600)", "var(--color-warning-600)",
  "var(--color-danger-600)", "var(--color-neutral-500)",
];

// Color del nivel de ocupacion. Ademas del color, cada barra lleva su % como
// texto y title, para no depender solo del color (WCAG 1.4.1).
function tono(pct) {
  if (pct >= 80) return "alta";
  if (pct >= 50) return "media";
  if (pct > 0) return "baja";
  return "cero";
}

export default function Reportes() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);

  // El fetcher depende de anio/mes; useCallback lo recrea al cambiarlos
  // para que useApi recargue automaticamente.
  const fetcher = useCallback(() => api.ocupacion(anio, mes), [anio, mes]);
  const reporte = useApi(fetcher);

  const fetcherFin = useCallback(() => api.reporteFinanciero(anio, mes), [anio, mes]);
  const financiero = useApi(fetcherFin);

  // Analítica de captación (no depende del selector de mes): origen de reservas
  // por mes (últimos 6) y visitas al link público (últimos 7 días).
  const overview = useApi(api.dashboardOverview);
  const bookingSource = useMemo(
    () => (overview.data?.booking_source || []).map((x) => ({ ...x, label: mesCorto(x.mes) })),
    [overview.data]
  );
  const visitas = useMemo(
    () => (overview.data?.visitas || []).map((v) => ({ ...v, label: diaSemana(v.fecha) })),
    [overview.data]
  );
  const visitasVacio = visitas.every((v) => v.n === 0);

  // Tooltip del gráfico de ocupación: día sobre el que está el cursor/foco.
  const [tip, setTip] = useState(null);

  function mostrarTip(e, d, total) {
    const wrap = e.currentTarget.closest(".grafico-wrap");
    if (!wrap) return;
    const r = e.currentTarget.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    // Centramos el tooltip sobre la barra y lo mantenemos dentro del recuadro.
    const centro = r.left + r.width / 2 - wr.left;
    const left = Math.max(64, Math.min(centro, wr.width - 64));
    setTip({ dia: d.dia, pct: d.porcentaje, ocupadas: d.ocupadas, total, left });
  }
  function ocultarTip() {
    setTip(null);
  }

  // Segmentos de la dona de métodos de pago (con su color y etiqueta).
  const segmentosPago = useMemo(() => {
    if (!financiero.data) return [];
    return financiero.data.metodos_pago.map((m, i) => ({
      label: METODO[m.metodo]?.label || m.metodo,
      value: m.total,
      color: METODO[m.metodo]?.color || PALETA[i % PALETA.length],
    }));
  }, [financiero.data]);

  const maxPct = useMemo(() => {
    if (!reporte.data) return 100;
    const m = Math.max(0, ...reporte.data.dias.map((d) => d.porcentaje));
    return m > 0 ? m : 100;
  }, [reporte.data]);

  const anios = [];
  for (let a = hoy.getFullYear() - 3; a <= hoy.getFullYear() + 1; a++) anios.push(a);

  return (
    <div className="reportes">
      <header className="reportes__head" />

      {/* Selector de periodo */}
      <Card padding="sm" className="reportes__filtros">
        <Field id="mes" label="Mes">
          <select id="mes" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
            {MESES.map((nombre, i) => (
              <option key={i} value={i + 1}>
                {nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field id="anio" label="Año">
          <select id="anio" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      {/* ---------- Reporte financiero (ingresos, métodos de pago, top) ---------- */}
      {financiero.loading && !financiero.data && (
        <Card>
          <StateMessage variant="loading" title="Calculando ingresos…" />
        </Card>
      )}

      {financiero.error && (
        <Card>
          <StateMessage
            variant="error"
            title="No se pudo cargar el reporte financiero"
            message={financiero.error}
            action={
              <Button variant="secondary" onClick={financiero.recargar}>
                Reintentar
              </Button>
            }
          />
        </Card>
      )}

      {financiero.data && (
        <>
          <div className="reportes__kpis">
            <StatCard
              icon="💰"
              accent="success"
              label="Cobrado en el mes"
              value={formatoMoneda.format(financiero.data.ingresos.cobrado)}
              hint={`${financiero.data.ingresos.num_pagos} pago(s)`}
            />
            <StatCard
              icon="🎫"
              accent="brand"
              label="Ticket promedio"
              value={formatoMoneda.format(financiero.data.ingresos.ticket_promedio)}
              hint="por reserva"
            />
            <StatCard
              icon="📋"
              accent="warning"
              label="Reservas del mes"
              value={financiero.data.ingresos.num_reservas}
              hint="entran este mes"
            />
          </div>

          <div className="reportes__financiero">
            {/* Métodos de pago (dona) */}
            <Card>
              <h2>Métodos de pago</h2>
              {segmentosPago.length === 0 ? (
                <StateMessage
                  variant="empty"
                  title="Sin pagos este mes"
                  message="Cuando registres pagos verás aquí el desglose por método."
                />
              ) : (
                <Dona
                  segmentos={segmentosPago}
                  centroValor={formatoMoneda.format(financiero.data.ingresos.cobrado)}
                  centroLabel="cobrado"
                  formato={(v) => formatoMoneda.format(v)}
                />
              )}
            </Card>

            {/* Top habitaciones por ingresos */}
            <Card>
              <h2>Top habitaciones</h2>
              {financiero.data.top_habitaciones.length === 0 ? (
                <StateMessage
                  variant="empty"
                  title="Sin reservas este mes"
                  message="Las habitaciones con más ingresos aparecerán aquí."
                />
              ) : (
                <ol className="reportes__top">
                  {financiero.data.top_habitaciones.map((h, i) => {
                    const max = financiero.data.top_habitaciones[0].ingresos || 1;
                    return (
                      <li key={h.habitacion} className="top-item">
                        <span className="top-item__rank">{i + 1}</span>
                        <div className="top-item__cuerpo">
                          <div className="top-item__fila">
                            <span className="top-item__nombre">
                              Hab. {h.habitacion} · {h.tipo}
                            </span>
                            <span className="top-item__ingreso">
                              {formatoMoneda.format(h.ingresos)}
                            </span>
                          </div>
                          <div className="top-item__barra-zona">
                            <div
                              className="top-item__barra"
                              style={{ width: `${(h.ingresos / max) * 100}%` }}
                            />
                          </div>
                          <span className="top-item__meta">
                            {h.reservas} reserva(s)
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>

          </div>

          {/* Ingresos cobrados por día del mes (tendencia). */}
          <Card>
            <h2>Ingresos por día</h2>
            {(financiero.data.ingresos_por_dia || []).every((d) => d.total === 0) ? (
              <StateMessage
                variant="empty"
                title="Sin cobros este mes"
                message="La curva de ingresos diarios aparecerá cuando registres pagos."
              />
            ) : (
              <IngresosChart data={financiero.data.ingresos_por_dia} />
            )}
          </Card>

          <h2 className="reportes__sep">Ocupación</h2>
        </>
      )}

      {reporte.loading && (
        <Card>
          <StateMessage variant="loading" title="Calculando ocupación…" />
        </Card>
      )}

      {reporte.error && (
        <Card>
          <StateMessage
            variant="error"
            title="No se pudo cargar el reporte"
            message={reporte.error}
            action={
              <Button variant="secondary" onClick={reporte.recargar}>
                Reintentar
              </Button>
            }
          />
        </Card>
      )}

      {reporte.data && (
        <>
          {/* Resumen del mes */}
          <div className="reportes__kpis">
            <StatCard
              icon="📈"
              accent="success"
              label="Ocupación promedio"
              value={`${reporte.data.promedio_ocupacion}%`}
              hint={`${MESES[mes - 1]} ${anio}`}
            />
            <StatCard
              icon="🏨"
              accent="brand"
              label="Habitaciones activas"
              value={reporte.data.total_habitaciones}
            />
            <StatCard
              icon="📅"
              accent="warning"
              label="Días del mes"
              value={reporte.data.dias.length}
            />
          </div>

          {/* Grafico de barras */}
          <Card>
            <div className="reportes__grafico-head">
              <h2>Ocupación por día</h2>
              <ul className="reportes__leyenda" aria-hidden="true">
                <li>
                  <span className="punto punto--baja" /> Baja (&lt;50%)
                </li>
                <li>
                  <span className="punto punto--media" /> Media (50–79%)
                </li>
                <li>
                  <span className="punto punto--alta" /> Alta (≥80%)
                </li>
              </ul>
            </div>

            {reporte.data.total_habitaciones === 0 ? (
              <StateMessage
                variant="empty"
                title="No hay habitaciones activas"
                message="Crea habitaciones para poder medir la ocupación."
              />
            ) : (
              <div className="grafico-wrap">
                <p className="sr-only">
                  Ocupación diaria de {MESES[mes - 1]} {anio}. Promedio{" "}
                  {reporte.data.promedio_ocupacion} por ciento.
                </p>

                {tip && (
                  <div className="grafico-tip" style={{ left: tip.left }} role="status">
                    <span className="grafico-tip__dia">
                      {MESES[mes - 1]} {tip.dia}
                    </span>
                    <span className="grafico-tip__pct">{tip.pct}% ocupación</span>
                    <span className="grafico-tip__meta">
                      {tip.ocupadas} de {tip.total} habitaciones
                    </span>
                  </div>
                )}

                <div className="grafico">
                  {reporte.data.dias.map((d) => (
                    <div
                      key={d.dia}
                      className="grafico__col"
                      tabIndex={0}
                      aria-label={`Día ${d.dia}: ${d.porcentaje}% de ocupación (${d.ocupadas} de ${reporte.data.total_habitaciones} habitaciones).`}
                      onMouseEnter={(e) => mostrarTip(e, d, reporte.data.total_habitaciones)}
                      onMouseLeave={ocultarTip}
                      onFocus={(e) => mostrarTip(e, d, reporte.data.total_habitaciones)}
                      onBlur={ocultarTip}
                    >
                      <div className="grafico__barra-zona">
                        <div
                          className={`grafico__barra grafico__barra--${tono(d.porcentaje)}`}
                          style={{ height: `${(d.porcentaje / maxPct) * 100}%` }}
                        />
                      </div>
                      <span className="grafico__dia">{d.dia}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ---------- Reservas por día (booked vs canceladas, mes en curso) ---------- */}
      <h2 className="reportes__sep">Reservas</h2>
      <Card>
        <h2>Reservas por día (mes en curso)</h2>
        {overview.loading && !overview.data ? (
          <StateMessage variant="loading" title="Cargando…" />
        ) : (
          <ReservationChart data={overview.data?.reservation_daily || []} />
        )}
      </Card>

      {/* ---------- Captación: origen de reservas y visitas al link ---------- */}
      <h2 className="reportes__sep">Captación y origen</h2>
      <div className="reportes__financiero">
        <Card>
          <h2>Origen de reservas (online vs. recepción)</h2>
          {overview.loading && !overview.data ? (
            <StateMessage variant="loading" title="Cargando…" />
          ) : (
            <BookingSourceChart data={bookingSource} />
          )}
        </Card>
        <Card>
          <h2>Visitas a tu link de reservas</h2>
          {overview.loading && !overview.data ? (
            <StateMessage variant="loading" title="Cargando…" />
          ) : visitasVacio ? (
            <StateMessage
              variant="empty"
              title="Aún sin visitas"
              message="Comparte tu link de reservas para empezar a recibir tráfico."
            />
          ) : (
            <VisitorsChart data={visitas} />
          )}
        </Card>
      </div>
    </div>
  );
}
