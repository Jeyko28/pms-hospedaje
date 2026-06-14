import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import StateMessage from "../../components/StateMessage";
import { ESTADO_RESERVA, presentar } from "../../config/estados";
import "./Calendario.css";

// Fecha legible: "2026-06-14" -> "14 jun 2026".
function fechaLegible(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

// Fecha compacta para el tooltip: "14 jun".
function fechaCorta(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

// Noches entre entrada y salida (salida no se cuenta).
function noches(entrada, salida) {
  const e = new Date(entrada + "T00:00:00");
  const s = new Date(salida + "T00:00:00");
  const n = Math.round((s - e) / 86400000);
  return n > 0 ? n : 1;
}

// Props de Badge (tone, icon) a partir del estado de la reserva.
function badgeReserva(estado) {
  const e = presentar(ESTADO_RESERVA, estado);
  return { tone: e.tone, icon: e.icon };
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DIAS_SEMANA = ["D", "L", "M", "M", "J", "V", "S"];
const formatoMoneda = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

// Color de la barra según el estado de la reserva (reusa los tonos del sistema).
const TONO_BARRA = {
  Pendiente: "var(--color-warning-600)",
  Confirmada: "var(--color-brand-600)",
  "Check-in": "var(--color-success-600)",
  "Check-out": "var(--color-neutral-400)",
};

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Calendario — vista TIMELINE (habitación × día) tipo Cloudbeds/HQBeds.
 * Muestra un mes: cada fila es una habitación, cada columna un día, y las
 * reservas se dibujan como barras que ocupan sus días.
 */
export default function Calendario() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth()); // 0-11
  const [seleccion, setSeleccion] = useState(null); // reserva clickeada
  const [accionando, setAccionando] = useState(false);
  const [errorAccion, setErrorAccion] = useState(null);
  const [tip, setTip] = useState(null); // tooltip al pasar el cursor: { r, hab, cx, top, bottom }

  // Rango del mes visible.
  const primerDia = useMemo(() => new Date(anio, mes, 1), [anio, mes]);
  const numDias = useMemo(() => new Date(anio, mes + 1, 0).getDate(), [anio, mes]);
  const desde = ymd(primerDia);
  const hasta = ymd(new Date(anio, mes, numDias));

  const datos = useApi(() => api.reservasCalendario(desde, hasta), [desde, hasta]);

  // Auto-refresco inteligente: recarga cada 45s y al volver a la pestaña, para
  // que las reservas que entran por el link público aparezcan casi al instante
  // sin que el usuario tenga que recargar manualmente.
  const { recargar } = datos;
  useEffect(() => {
    const intervalo = setInterval(recargar, 45000);
    const alVolver = () => {
      if (document.visibilityState === "visible") recargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [recargar]);

  const dias = useMemo(
    () => Array.from({ length: numDias }, (_, i) => new Date(anio, mes, i + 1)),
    [anio, mes, numDias]
  );
  const hoyStr = ymd(hoy);

  function mover(delta) {
    let m = mes + delta;
    let a = anio;
    if (m < 0) { m = 11; a--; }
    if (m > 11) { m = 0; a++; }
    setMes(m);
    setAnio(a);
  }
  function irHoy() {
    setAnio(hoy.getFullYear());
    setMes(hoy.getMonth());
  }

  // Acciones desde el modal de la reserva seleccionada.
  async function confirmar() {
    if (!seleccion) return;
    setErrorAccion(null);
    setAccionando(true);
    try {
      await api.confirmarReserva(seleccion.id);
      setSeleccion(null);
      recargar();
    } catch (e) {
      setErrorAccion(e.message);
    } finally {
      setAccionando(false);
    }
  }

  async function hacerCheckin() {
    if (!seleccion) return;
    setErrorAccion(null);
    setAccionando(true);
    try {
      await api.checkin(seleccion.id);
      setSeleccion(null);
      recargar();
    } catch (e) {
      setErrorAccion(e.message);
    } finally {
      setAccionando(false);
    }
  }

  // Para una reserva, calcula en qué columna empieza y cuántos días ocupa
  // DENTRO del mes visible (recorta si entra/sale del mes).
  function tramo(reserva) {
    const e = new Date(reserva.fecha_entrada + "T00:00:00");
    const s = new Date(reserva.fecha_salida + "T00:00:00");
    const inicioMes = new Date(anio, mes, 1);
    const finMes = new Date(anio, mes, numDias);
    // La reserva ocupa noches: de entrada a salida-1.
    const ini = e < inicioMes ? inicioMes : e;
    const finNoche = new Date(s.getTime() - 86400000); // salida - 1 día
    const fin = finNoche > finMes ? finMes : finNoche;
    if (fin < ini) return null;
    const colInicio = ini.getDate(); // 1-based
    const span = Math.round((fin - ini) / 86400000) + 1;
    return { colInicio, span };
  }

  // Reservas agrupadas por habitación.
  const porHabitacion = useMemo(() => {
    const map = {};
    (datos.data?.reservas || []).forEach((r) => {
      (map[r.habitacion_id] ||= []).push(r);
    });
    return map;
  }, [datos.data]);

  return (
    <div className="cal">
      <header className="cal__head">
        <div>
          <h1>Calendario</h1>
          <p className="cal__subtitle">Vista de ocupación por habitación.</p>
        </div>
        <div className="cal__nav">
          <button className="cal__nav-btn" onClick={() => mover(-1)} aria-label="Mes anterior">
            <ChevronLeft size={18} />
          </button>
          <span className="cal__mes">{MESES[mes]} {anio}</span>
          <button className="cal__nav-btn" onClick={() => mover(1)} aria-label="Mes siguiente">
            <ChevronRight size={18} />
          </button>
          <Button variant="secondary" size="sm" onClick={irHoy}>Hoy</Button>
        </div>
      </header>

      {datos.loading && (
        <Card><StateMessage variant="loading" title="Cargando calendario…" /></Card>
      )}

      {datos.error && (
        <Card>
          <StateMessage
            variant="error"
            title="No se pudo cargar el calendario"
            message={datos.error}
            action={<Button variant="secondary" onClick={datos.recargar}>Reintentar</Button>}
          />
        </Card>
      )}

      {datos.data && datos.data.habitaciones.length === 0 && (
        <Card>
          <StateMessage
            variant="empty"
            title="Aún no hay habitaciones"
            message="Crea habitaciones para verlas en el calendario."
          />
        </Card>
      )}

      {datos.data && datos.data.habitaciones.length > 0 && (
        <Card padding="none" className="cal__wrap">
          <div className="cal__grid" style={{ "--dias": numDias }}>
            {/* Esquina + cabecera de días */}
            <div className="cal__esquina">Habitación</div>
            {dias.map((d) => {
              const esHoy = ymd(d) === hoyStr;
              const finde = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div
                  key={ymd(d)}
                  className={
                    "cal__dia" + (esHoy ? " cal__dia--hoy" : "") + (finde ? " cal__dia--finde" : "")
                  }
                >
                  <span className="cal__dia-sem">{DIAS_SEMANA[d.getDay()]}</span>
                  <span className="cal__dia-num">{d.getDate()}</span>
                </div>
              );
            })}

            {/* Filas: una por habitación. fila 1 = cabecera de días, por eso
                la primera habitación va en la fila 2 (índice + 2). */}
            {datos.data.habitaciones.map((hab, idx) => {
              const fila = idx + 2; // fila del grid (1 es la cabecera)
              return (
                <div key={hab.id} style={{ display: "contents" }}>
                  <div className="cal__hab" style={{ gridRow: fila, gridColumn: 1 }}>
                    <strong>Hab. {hab.numero}</strong>
                    <span className="cal__hab-tipo">{hab.tipo}</span>
                  </div>
                  {/* Celdas de fondo (una por día) */}
                  {dias.map((d, i) => {
                    const finde = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <div
                        key={ymd(d)}
                        className={"cal__celda" + (finde ? " cal__celda--finde" : "")}
                        style={{ gridRow: fila, gridColumn: i + 2 }}
                      />
                    );
                  })}
                  {/* Barras de reservas (encima de las celdas de esa fila) */}
                  {(porHabitacion[hab.id] || []).map((r) => {
                    const t = tramo(r);
                    if (!t) return null;
                    return (
                      <button
                        type="button"
                        key={r.id}
                        className="cal__barra"
                        onClick={() => { setErrorAccion(null); setSeleccion({ ...r, habitacion: hab }); }}
                        onMouseEnter={(e) => {
                          const rc = e.currentTarget.getBoundingClientRect();
                          setTip({ r, hab, cx: rc.left + rc.width / 2, top: rc.top, bottom: rc.bottom });
                        }}
                        onMouseLeave={() => setTip(null)}
                        style={{
                          gridRow: fila,
                          gridColumn: `${t.colInicio + 1} / span ${t.span}`,
                          backgroundColor: TONO_BARRA[r.estado] || "var(--color-neutral-500)",
                        }}
                      >
                        <span className="cal__barra-txt">{r.huesped}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Leyenda */}
      {datos.data && datos.data.habitaciones.length > 0 && (
        <div className="cal__leyenda">
          {["Pendiente", "Confirmada", "Check-in", "Check-out"].map((e) => (
            <span className="cal__leyenda-item" key={e}>
              <span className="cal__leyenda-color" style={{ backgroundColor: TONO_BARRA[e] }} />
              {presentar(ESTADO_RESERVA, e).label}
            </span>
          ))}
        </div>
      )}

      {/* Tooltip flotante al pasar el cursor sobre una reserva (preview rápido).
          position: fixed para no recortarse con el scroll del calendario. Se
          coloca encima de la barra, o debajo si está muy cerca del borde superior. */}
      {tip && (() => {
        const abajo = tip.top < 220;
        const est = presentar(ESTADO_RESERVA, tip.r.estado);
        const color = TONO_BARRA[tip.r.estado] || "var(--color-neutral-500)";
        return (
          <div
            className={"cal__tip" + (abajo ? " cal__tip--abajo" : "")}
            style={{ left: tip.cx, top: abajo ? tip.bottom + 10 : tip.top - 10 }}
          >
            <div className="cal__tip-head">
              <span className="cal__tip-dot" style={{ backgroundColor: color }} />
              <strong>{tip.r.huesped}</strong>
            </div>
            <div className="cal__tip-row">Hab. {tip.hab.numero} · {tip.hab.tipo}</div>
            <div className="cal__tip-row">
              {fechaCorta(tip.r.fecha_entrada)} → {fechaCorta(tip.r.fecha_salida)}
              {" · "}{noches(tip.r.fecha_entrada, tip.r.fecha_salida)} noche(s)
            </div>
            <div className="cal__tip-foot">
              <Badge {...badgeReserva(tip.r.estado)}>{est.label}</Badge>
              <span className="cal__tip-total">{formatoMoneda.format(tip.r.total || 0)}</span>
            </div>
          </div>
        );
      })()}

      {/* Modal de detalle/acciones al hacer clic en una reserva */}
      <Modal
        open={!!seleccion}
        title="Detalle de la reserva"
        onClose={() => setSeleccion(null)}
      >
        {seleccion && (
          <div className="cal__modal">
            <dl className="cal__modal-datos">
              <div><dt>Huésped</dt><dd>{seleccion.huesped}</dd></div>
              <div><dt>Habitación</dt><dd>Hab. {seleccion.habitacion.numero} · {seleccion.habitacion.tipo}</dd></div>
              <div><dt>Fechas</dt><dd>{fechaLegible(seleccion.fecha_entrada)} → {fechaLegible(seleccion.fecha_salida)}</dd></div>
              <div><dt>Total</dt><dd>{formatoMoneda.format(seleccion.total || 0)}</dd></div>
              <div>
                <dt>Estado</dt>
                <dd>
                  <Badge {...badgeReserva(seleccion.estado)}>
                    {presentar(ESTADO_RESERVA, seleccion.estado).label}
                  </Badge>
                </dd>
              </div>
            </dl>

            {errorAccion && (
              <p className="cal__modal-error" role="alert">{errorAccion}</p>
            )}

            <div className="cal__modal-acciones">
              <Button variant="secondary" onClick={() => setSeleccion(null)}>
                Cerrar
              </Button>
              {seleccion.estado === "Pendiente" && (
                <Button onClick={confirmar} disabled={accionando}>
                  {accionando ? "Confirmando…" : "Confirmar reserva"}
                </Button>
              )}
              {seleccion.estado === "Confirmada" && (
                <Button onClick={hacerCheckin} disabled={accionando}>
                  {accionando ? "Procesando…" : "Hacer check-in"}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
