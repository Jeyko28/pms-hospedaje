import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import Field from "../../components/Field";
import StateMessage from "../../components/StateMessage";
import { useToast } from "../../components/Toast";
import NuevaReservaForm from "../reservas/NuevaReservaForm";
import CobroEstanciaForm from "../recepcion/CobroEstanciaForm";
import CheckinForm from "../recepcion/CheckinForm";
import CheckoutForm from "../recepcion/CheckoutForm";
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

// Fecha YYYY-MM-DD en hora LOCAL. (toISOString() daría UTC, que en husos
// detrás de UTC —ej. Perú −5— por la tarde ya es el día siguiente, lo que
// desajustaría "hoy", las fechas mínimas y la comparación de días pasados.)
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Calendario — vista TIMELINE (habitación × día) tipo Cloudbeds/HQBeds.
 * Muestra un mes: cada fila es una habitación, cada columna un día, y las
 * reservas se dibujan como barras que ocupan sus días.
 */
export default function Calendario() {
  const toast = useToast();
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth()); // 0-11
  const [seleccion, setSeleccion] = useState(null); // reserva clickeada
  const [accionando, setAccionando] = useState(false);
  const [errorAccion, setErrorAccion] = useState(null);
  const [tip, setTip] = useState(null); // tooltip al pasar el cursor: { r, hab, cx, top, bottom }
  const [nueva, setNueva] = useState(null); // reserva nueva desde celda vacia: { habitacion_id, fecha_entrada, fecha_salida }
  const [mostrarPago, setMostrarPago] = useState(false); // sub-vista de cobro en el modal de detalle
  const [mostrarCheckin, setMostrarCheckin] = useState(false); // sub-vista de check-in en el modal
  const [mostrarCheckout, setMostrarCheckout] = useState(false); // sub-vista de check-out en el modal
  const [mostrarMover, setMostrarMover] = useState(false); // sub-vista de mover de habitación (móvil/teclado)
  const [destinoHab, setDestinoHab] = useState(""); // habitación destino elegida en el selector
  const [mostrarEditar, setMostrarEditar] = useState(false); // sub-vista de editar fechas/notas
  const [editForm, setEditForm] = useState({ fecha_entrada: "", fecha_salida: "", notas: "" });
  const [arrastrando, setArrastrando] = useState(null); // reserva que se está arrastrando
  const [sobreHab, setSobreHab] = useState(null); // id de habitación bajo el cursor al arrastrar
  const [errorMover, setErrorMover] = useState(null); // aviso si el movimiento se rechaza
  const [bloqForm, setBloqForm] = useState(null); // null=cerrado | objeto=modal de bloqueo abierto
  const [guardandoBloq, setGuardandoBloq] = useState(false);

  // Datos para el formulario de nueva reserva (habitaciones con precio + huespedes).
  const habitacionesForm = useApi(api.habitaciones);
  const huespedesForm = useApi(api.huespedes);

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

  // Centra el scroll horizontal en la columna de HOY al abrir el mes actual
  // (al montar, al cambiar de mes y al pulsar "Hoy"). En otros meses no aplica.
  const scrollRef = useRef(null);
  useEffect(() => {
    const cont = scrollRef.current;
    if (!cont) return;
    if (anio !== hoy.getFullYear() || mes !== hoy.getMonth()) return;
    const COL = 44; // ancho de cada día (debe coincidir con el CSS)
    const FIJA = 120; // ancho de la columna fija de habitación
    const target = FIJA + (hoy.getDate() - 1) * COL + COL / 2 - cont.clientWidth / 2;
    cont.scrollLeft = Math.max(0, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos.data, anio, mes]);

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
      toast.success("Reserva confirmada.");
      setSeleccion(null);
      recargar();
    } catch (e) {
      setErrorAccion(e.message);
      toast.error(e.message || "No se pudo confirmar la reserva.");
    } finally {
      setAccionando(false);
    }
  }

  // Tras el check-in (desde CheckinForm): cierra la sub-vista y recarga; el
  // efecto de sync actualiza la reserva seleccionada a estado Check-in.
  function alCheckinHecho() {
    setMostrarCheckin(false);
    recargar();
    toast.success("Check-in registrado.");
  }

  // Tras el check-out (desde CheckoutForm): cierra el modal y recarga.
  function alCheckoutHecho() {
    setMostrarCheckout(false);
    setSeleccion(null);
    recargar();
    toast.success("Check-out completado.");
  }

  // Tras registrar un pago: vuelve al detalle y recarga (el efecto de sync
  // de abajo refresca el saldo de la reserva seleccionada).
  function alPagado() {
    setMostrarPago(false);
    recargar();
    toast.success("Pago registrado.");
  }

  // Abre la sub-vista de edición con las fechas/notas actuales de la reserva.
  function abrirEditar() {
    if (!seleccion) return;
    setErrorAccion(null);
    setEditForm({
      fecha_entrada: seleccion.fecha_entrada,
      fecha_salida: seleccion.fecha_salida,
      notas: seleccion.notas || "",
    });
    setMostrarEditar(true);
  }

  async function guardarEdicion() {
    if (!seleccion) return;
    if (!editForm.fecha_entrada || !editForm.fecha_salida ||
        new Date(editForm.fecha_salida) <= new Date(editForm.fecha_entrada)) {
      setErrorAccion("La salida debe ser posterior a la entrada.");
      return;
    }
    setErrorAccion(null);
    setAccionando(true);
    try {
      await api.editarReserva(seleccion.id, editForm);
      toast.success("Reserva actualizada.");
      setMostrarEditar(false);
      recargar(); // el efecto de sync actualiza la reserva seleccionada
    } catch (e) {
      setErrorAccion(e.message);
      toast.error(e.message || "No se pudo actualizar la reserva.");
    } finally {
      setAccionando(false);
    }
  }

  // Cancela la reserva (Pendiente/Confirmada): la quita del calendario.
  async function cancelarSeleccion() {
    if (!seleccion) return;
    if (!window.confirm(`¿Cancelar la reserva de ${seleccion.huesped}?`)) return;
    setErrorAccion(null);
    setAccionando(true);
    try {
      await api.cancelarReserva(seleccion.id);
      toast.success("Reserva cancelada.");
      setSeleccion(null);
      recargar();
    } catch (e) {
      setErrorAccion(e.message);
      toast.error(e.message || "No se pudo cancelar la reserva.");
    } finally {
      setAccionando(false);
    }
  }

  // Mantiene la reserva seleccionada al día tras cada recarga (saldo, estado).
  // Si ya no aparece (ej. se hizo check-out y salió del rango) cierra el modal.
  useEffect(() => {
    if (!seleccion || !datos.data) return;
    const r = datos.data.reservas.find((x) => x.id === seleccion.id);
    if (!r) {
      setSeleccion(null);
      return;
    }
    const hab = datos.data.habitaciones.find((h) => h.id === r.habitacion_id);
    setSeleccion({ ...r, habitacion: hab });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos.data]);

  // --- Arrastrar una reserva a otra habitación ---
  function alIniciarArrastre(reserva, e) {
    setTip(null);
    setArrastrando(reserva);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", String(reserva.id)); } catch (_) { /* algunos navegadores */ }
  }

  // Mover la reserva del modal a otra habitación (selector; móvil/teclado).
  async function moverSeleccionA(habId) {
    if (!seleccion || !habId) return;
    setErrorAccion(null);
    setAccionando(true);
    try {
      await api.moverReserva(seleccion.id, habId);
      toast.success("Reserva movida de habitación.");
      setMostrarMover(false);
      setDestinoHab("");
      recargar(); // el efecto de sync actualiza la reserva a la nueva habitación
    } catch (e) {
      setErrorAccion(e.message);
      toast.error(e.message || "No se pudo mover la reserva.");
    } finally {
      setAccionando(false);
    }
  }

  function alSoltarEn(habId) {
    const reserva = arrastrando;
    setArrastrando(null);
    setSobreHab(null);
    if (!reserva || habId === reserva.habitacion_id) return;
    setErrorMover(null);
    api
      .moverReserva(reserva.id, habId)
      .then(() => {
        toast.success("Reserva movida de habitación.");
        recargar();
      })
      .catch((err) => {
        setErrorMover(err.message);
        toast.error(err.message || "No se pudo mover la reserva.");
        setTimeout(() => setErrorMover(null), 5000);
      });
  }

  // Clic en una celda libre: abre el formulario de nueva reserva precargado
  // con esa habitación y día (salida por defecto = noche siguiente).
  function abrirNueva(habId, fecha) {
    const salida = ymd(new Date(new Date(fecha + "T00:00:00").getTime() + 86400000));
    setNueva({ habitacion_id: habId, fecha_entrada: fecha, fecha_salida: salida });
  }

  function alCrearNueva() {
    setNueva(null);
    recargar();
  }

  // --- Bloqueos de habitación (mantenimiento / uso propio) ---
  function abrirBloqueo() {
    const prim = datos.data?.habitaciones?.[0];
    const manana = ymd(new Date(Date.now() + 86400000));
    setBloqForm({
      habitacion_id: prim ? String(prim.id) : "",
      fecha_inicio: hoyStr,
      fecha_fin: manana,
      motivo: "",
      error: null,
    });
  }

  async function guardarBloqueo(ev) {
    ev.preventDefault();
    if (!bloqForm.habitacion_id) {
      setBloqForm((f) => ({ ...f, error: "Elige una habitación." }));
      return;
    }
    if (bloqForm.fecha_fin <= bloqForm.fecha_inicio) {
      setBloqForm((f) => ({ ...f, error: "La fecha fin debe ser posterior al inicio." }));
      return;
    }
    setGuardandoBloq(true);
    try {
      await api.crearBloqueo({
        habitacion_id: Number(bloqForm.habitacion_id),
        fecha_inicio: bloqForm.fecha_inicio,
        fecha_fin: bloqForm.fecha_fin,
        motivo: bloqForm.motivo,
      });
      toast.success("Habitación bloqueada en esas fechas.");
      setBloqForm(null);
      recargar();
    } catch (e) {
      setBloqForm((f) => ({ ...f, error: e.message || "No se pudo bloquear." }));
    } finally {
      setGuardandoBloq(false);
    }
  }

  async function eliminarBloqueo(b, hab) {
    if (!window.confirm(`¿Quitar el bloqueo de Hab. ${hab?.numero || ""}?`)) return;
    try {
      await api.eliminarBloqueo(b.id);
      toast.success("Bloqueo eliminado.");
      recargar();
    } catch (e) {
      toast.error(e.message || "No se pudo eliminar el bloqueo.");
    }
  }

  const porHabBloqueos = useMemo(() => {
    const map = {};
    (datos.data?.bloqueos || []).forEach((b) => {
      (map[b.habitacion_id] ||= []).push(b);
    });
    return map;
  }, [datos.data]);

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
        <div className="cal__nav">
          <button className="cal__nav-btn" onClick={() => mover(-1)} aria-label="Mes anterior">
            <ChevronLeft size={18} />
          </button>
          <span className="cal__mes">{MESES[mes]} {anio}</span>
          <button className="cal__nav-btn" onClick={() => mover(1)} aria-label="Mes siguiente">
            <ChevronRight size={18} />
          </button>
          <Button variant="secondary" size="sm" onClick={irHoy}>Hoy</Button>
          <Button variant="secondary" size="sm" onClick={abrirBloqueo}>Bloquear</Button>
        </div>
        {datos.data && datos.data.habitaciones.length > 0 && (
          <div className="cal__leyenda">
            {["Pendiente", "Confirmada", "Check-in", "Check-out"].map((e) => (
              <span className="cal__leyenda-item" key={e}>
                <span className="cal__leyenda-dot" style={{ backgroundColor: TONO_BARRA[e] }} />
                {presentar(ESTADO_RESERVA, e).label}
              </span>
            ))}
          </div>
        )}
      </header>

      {errorMover && (
        <div className="cal__aviso-mover" role="alert">{errorMover}</div>
      )}

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
          <div className="cal__scroll" ref={scrollRef}>
          <div
            className={"cal__grid" + (arrastrando ? " cal__grid--arrastrando" : "")}
            style={{ "--dias": numDias }}
          >
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
                  <div
                    className={
                      "cal__hab" +
                      (arrastrando && sobreHab === hab.id ? " cal__hab--drop" : "")
                    }
                    style={{ gridRow: fila, gridColumn: 1 }}
                    onDragOver={(e) => { if (arrastrando) e.preventDefault(); }}
                    onDragEnter={() => { if (arrastrando) setSobreHab(hab.id); }}
                    onDrop={(e) => { e.preventDefault(); alSoltarEn(hab.id); }}
                  >
                    <strong>Hab. {hab.numero}</strong>
                    <span className="cal__hab-tipo">{hab.tipo}</span>
                  </div>
                  {/* Celdas de fondo (una por día). Clic en una libre = nueva
                      reserva. Las fechas pasadas quedan deshabilitadas. */}
                  {dias.map((d, i) => {
                    const finde = d.getDay() === 0 || d.getDay() === 6;
                    const pasado = ymd(d) < hoyStr;
                    const esHoy = ymd(d) === hoyStr;
                    return (
                      <button
                        type="button"
                        key={ymd(d)}
                        className={
                          "cal__celda" +
                          (finde ? " cal__celda--finde" : "") +
                          (pasado ? " cal__celda--pasada" : "") +
                          (esHoy ? " cal__celda--hoy" : "") +
                          (arrastrando && sobreHab === hab.id ? " cal__celda--drop" : "")
                        }
                        style={{ gridRow: fila, gridColumn: i + 2 }}
                        disabled={pasado && !arrastrando}
                        aria-label={`Nueva reserva · Hab. ${hab.numero} · ${fechaCorta(ymd(d))}`}
                        onClick={() => abrirNueva(hab.id, ymd(d))}
                        onDragOver={(e) => { if (arrastrando) e.preventDefault(); }}
                        onDragEnter={() => { if (arrastrando) setSobreHab(hab.id); }}
                        onDrop={(e) => { e.preventDefault(); alSoltarEn(hab.id); }}
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
                        className={"cal__barra" + (arrastrando?.id === r.id ? " cal__barra--arrastrando" : "")}
                        draggable
                        onDragStart={(e) => alIniciarArrastre(r, e)}
                        onDragEnd={() => { setArrastrando(null); setSobreHab(null); }}
                        onClick={() => { setErrorAccion(null); setMostrarPago(false); setMostrarCheckin(false); setMostrarCheckout(false); setMostrarMover(false); setMostrarEditar(false); setSeleccion({ ...r, habitacion: hab }); }}
                        onMouseEnter={(e) => {
                          if (arrastrando) return;
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
                  {/* Barras de bloqueo (mantenimiento / uso propio) en gris */}
                  {(porHabBloqueos[hab.id] || []).map((b) => {
                    const t = tramo({ fecha_entrada: b.fecha_inicio, fecha_salida: b.fecha_fin });
                    if (!t) return null;
                    return (
                      <button
                        type="button"
                        key={"b" + b.id}
                        className="cal__barra cal__barra--bloqueo"
                        title={`Bloqueo${b.motivo ? ": " + b.motivo : ""} (clic para quitar)`}
                        onClick={() => eliminarBloqueo(b, hab)}
                        style={{
                          gridRow: fila,
                          gridColumn: `${t.colInicio + 1} / span ${t.span}`,
                        }}
                      >
                        <span className="cal__barra-txt">🔧 {b.motivo || "Bloqueado"}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          </div>
        </Card>
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

      {/* Modal: nueva reserva al hacer clic en una celda libre */}
      <Modal
        open={!!nueva}
        title="Nueva reserva"
        onClose={() => setNueva(null)}
      >
        {!habitacionesForm.data || !huespedesForm.data ? (
          <StateMessage variant="loading" title="Cargando datos…" />
        ) : (
          nueva && (
            <NuevaReservaForm
              huespedes={huespedesForm.data || []}
              habitaciones={habitacionesForm.data || []}
              iniciales={nueva}
              onCreada={alCrearNueva}
              onCancelar={() => setNueva(null)}
              onHuespedCreado={huespedesForm.recargar}
            />
          )
        )}
      </Modal>

      {/* Modal: bloquear una habitación por fechas (mantenimiento / uso propio) */}
      <Modal open={!!bloqForm} title="Bloquear habitación" onClose={() => setBloqForm(null)}>
        {bloqForm && (
          <form className="cal__modal" onSubmit={guardarBloqueo} noValidate>
            <Field id="bloq-hab" label="Habitación" required>
              <select
                id="bloq-hab"
                value={bloqForm.habitacion_id}
                onChange={(e) => setBloqForm((f) => ({ ...f, habitacion_id: e.target.value }))}
              >
                {(datos.data?.habitaciones || []).map((h) => (
                  <option key={h.id} value={h.id}>Hab. {h.numero} · {h.tipo}</option>
                ))}
              </select>
            </Field>
            <div className="cal__modal-fila">
              <Field id="bloq-ini" label="Desde" required>
                <input
                  id="bloq-ini"
                  type="date"
                  value={bloqForm.fecha_inicio}
                  onChange={(e) => setBloqForm((f) => ({ ...f, fecha_inicio: e.target.value }))}
                />
              </Field>
              <Field id="bloq-fin" label="Hasta (salida)" required>
                <input
                  id="bloq-fin"
                  type="date"
                  value={bloqForm.fecha_fin}
                  min={bloqForm.fecha_inicio}
                  onChange={(e) => setBloqForm((f) => ({ ...f, fecha_fin: e.target.value }))}
                />
              </Field>
            </div>
            <Field id="bloq-motivo" label="Motivo (opcional)">
              <input
                id="bloq-motivo"
                type="text"
                value={bloqForm.motivo}
                onChange={(e) => setBloqForm((f) => ({ ...f, motivo: e.target.value }))}
                placeholder="Ej. mantenimiento, uso propio…"
              />
            </Field>
            {bloqForm.error && <p className="cal__modal-error" role="alert">{bloqForm.error}</p>}
            <div className="cal__modal-acciones">
              <Button type="button" variant="secondary" onClick={() => setBloqForm(null)}>Cancelar</Button>
              <Button type="submit" loading={guardandoBloq}>Bloquear</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal de detalle/acciones al hacer clic en una reserva */}
      <Modal
        open={!!seleccion}
        title={
          mostrarPago ? "Registrar pago"
            : mostrarCheckin ? "Check-in"
            : mostrarCheckout ? "Check-out"
            : mostrarMover ? "Mover de habitación"
            : mostrarEditar ? "Editar reserva"
            : "Detalle de la reserva"
        }
        onClose={() => { setSeleccion(null); setMostrarPago(false); setMostrarCheckin(false); setMostrarCheckout(false); setMostrarMover(false); setMostrarEditar(false); }}
      >
        {seleccion && mostrarPago && (
          <CobroEstanciaForm
            estanciaId={seleccion.estancia_id}
            facturaId={seleccion.factura_id}
            fechaCheckin={seleccion.checkin_real}
            fechaSalidaEsperada={seleccion.fecha_salida}
            precioNoche={seleccion.precio_base}
            pagado={seleccion.pagado}
            onCobrado={alPagado}
            onCerrar={() => setMostrarPago(false)}
          />
        )}

        {seleccion && mostrarCheckin && (
          <CheckinForm
            reserva={seleccion}
            onCheckinHecho={alCheckinHecho}
            onCancelar={() => setMostrarCheckin(false)}
          />
        )}

        {seleccion && mostrarCheckout && (
          <CheckoutForm
            estanciaId={seleccion.estancia_id}
            fechaCheckin={seleccion.checkin_real}
            fechaSalidaEsperada={seleccion.fecha_salida}
            precioNoche={seleccion.precio_base}
            pagado={seleccion.pagado}
            onCheckoutHecho={alCheckoutHecho}
            onAjuste={recargar}
            onCancelar={() => setMostrarCheckout(false)}
          />
        )}

        {seleccion && mostrarMover && (
          <div className="cal__modal">
            <p className="cal__mover-intro">
              Mover a «{seleccion.huesped}» a otra habitación, sin cambiar las fechas
              ({fechaLegible(seleccion.fecha_entrada)} → {fechaLegible(seleccion.fecha_salida)}).
            </p>
            <Field id="mover-destino" label="Habitación destino">
              <select
                id="mover-destino"
                value={destinoHab}
                onChange={(e) => { setDestinoHab(e.target.value); setErrorAccion(null); }}
              >
                <option value="">Selecciona una habitación…</option>
                {(datos.data?.habitaciones || [])
                  .filter((h) => h.id !== seleccion.habitacion_id)
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      Hab. {h.numero} · {h.tipo}
                    </option>
                  ))}
              </select>
            </Field>
            {errorAccion && (
              <p className="cal__modal-error" role="alert">{errorAccion}</p>
            )}
            <div className="cal__modal-acciones">
              <Button variant="secondary" onClick={() => { setMostrarMover(false); setErrorAccion(null); }}>
                Cancelar
              </Button>
              <Button
                onClick={() => moverSeleccionA(Number(destinoHab))}
                disabled={!destinoHab || accionando}
              >
                {accionando ? "Moviendo…" : "Mover aquí"}
              </Button>
            </div>
          </div>
        )}

        {seleccion && mostrarEditar && (
          <div className="cal__modal">
            <p className="cal__mover-intro">
              Editar las fechas de la reserva de «{seleccion.huesped}»
              (Hab. {seleccion.habitacion.numero}).
            </p>
            <div className="cal__edit-fechas">
              <Field id="edit-entrada" label="Entrada">
                <input
                  id="edit-entrada"
                  type="date"
                  value={editForm.fecha_entrada}
                  onChange={(e) => setEditForm((f) => ({ ...f, fecha_entrada: e.target.value }))}
                />
              </Field>
              <Field id="edit-salida" label="Salida">
                <input
                  id="edit-salida"
                  type="date"
                  value={editForm.fecha_salida}
                  min={editForm.fecha_entrada || undefined}
                  onChange={(e) => setEditForm((f) => ({ ...f, fecha_salida: e.target.value }))}
                />
              </Field>
            </div>
            <Field id="edit-notas" label="Notas (opcional)">
              <input
                id="edit-notas"
                type="text"
                value={editForm.notas}
                onChange={(e) => setEditForm((f) => ({ ...f, notas: e.target.value }))}
                placeholder="Ej. llegada tarde, cama extra…"
              />
            </Field>
            {errorAccion && (
              <p className="cal__modal-error" role="alert">{errorAccion}</p>
            )}
            <div className="cal__modal-acciones">
              <Button variant="secondary" onClick={() => { setMostrarEditar(false); setErrorAccion(null); }}>
                Cancelar
              </Button>
              <Button onClick={guardarEdicion} disabled={accionando}>
                {accionando ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </div>
        )}

        {seleccion && !mostrarPago && !mostrarCheckin && !mostrarCheckout && !mostrarMover && !mostrarEditar && (() => {
          const esCheckin = seleccion.estado === "Check-in";
          const editable = seleccion.estado === "Pendiente" || seleccion.estado === "Confirmada";
          const saldo = seleccion.saldo || 0;
          return (
            <div className="cal__modal">
              <dl className="cal__modal-datos">
                <div><dt>Huésped</dt><dd>{seleccion.huesped}</dd></div>
                <div><dt>Habitación</dt><dd>Hab. {seleccion.habitacion.numero} · {seleccion.habitacion.tipo}</dd></div>
                <div><dt>Fechas</dt><dd>{fechaLegible(seleccion.fecha_entrada)} → {fechaLegible(seleccion.fecha_salida)}</dd></div>
                {/* Entrada real: solo si ya hizo check-in y difiere de lo reservado. */}
                {esCheckin && seleccion.checkin_real && seleccion.checkin_real !== seleccion.fecha_entrada && (
                  <div>
                    <dt>Entró</dt>
                    <dd><strong className="cal__modal-saldo">{fechaLegible(seleccion.checkin_real)}</strong></dd>
                  </div>
                )}
                <div><dt>Total</dt><dd>{formatoMoneda.format(seleccion.total || 0)}</dd></div>
                <div>
                  <dt>Estado</dt>
                  <dd>
                    <Badge {...badgeReserva(seleccion.estado)}>
                      {presentar(ESTADO_RESERVA, seleccion.estado).label}
                    </Badge>
                  </dd>
                </div>
                {/* Saldo: solo cuando ya hizo check-in (hay estancia). */}
                {esCheckin && seleccion.estancia_id && (
                  <div>
                    <dt>Saldo</dt>
                    <dd>
                      {saldo > 0 ? (
                        <strong className="cal__modal-saldo">{formatoMoneda.format(saldo)}</strong>
                      ) : (
                        <span className="cal__modal-pagado">Pagado</span>
                      )}
                    </dd>
                  </div>
                )}
              </dl>

              {errorAccion && (
                <p className="cal__modal-error" role="alert">{errorAccion}</p>
              )}

              {/* Aviso: no se puede cerrar con saldo pendiente. */}
              {esCheckin && saldo > 0 && (
                <p className="cal__modal-aviso">
                  Cobra el saldo pendiente para poder hacer el check-out.
                </p>
              )}

              <div className="cal__modal-acciones">
                <Button variant="secondary" onClick={() => setSeleccion(null)}>
                  Cerrar
                </Button>
                {editable && (
                  <Button variant="ghost" onClick={abrirEditar}>
                    Editar
                  </Button>
                )}
                {seleccion.estado !== "Check-out" && (
                  <Button
                    variant="ghost"
                    onClick={() => { setErrorAccion(null); setDestinoHab(""); setMostrarMover(true); }}
                  >
                    Mover de habitación
                  </Button>
                )}
                {editable && (
                  <Button variant="ghost" onClick={cancelarSeleccion} disabled={accionando}>
                    Cancelar reserva
                  </Button>
                )}
                {seleccion.estado === "Pendiente" && (
                  <Button onClick={confirmar} disabled={accionando}>
                    {accionando ? "Confirmando…" : "Confirmar reserva"}
                  </Button>
                )}
                {seleccion.estado === "Confirmada" && (
                  <Button onClick={() => { setErrorAccion(null); setMostrarCheckin(true); }}>
                    Hacer check-in
                  </Button>
                )}
                {esCheckin && (
                  <Button variant="secondary" onClick={() => { setErrorAccion(null); setMostrarPago(true); }}>
                    Cobrar
                  </Button>
                )}
                {esCheckin && (
                  <Button onClick={() => { setErrorAccion(null); setMostrarCheckout(true); }}>
                    Hacer check-out
                  </Button>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
