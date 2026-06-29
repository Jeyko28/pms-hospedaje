import { useMemo, useState } from "react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import StateMessage from "../../components/StateMessage";
import Field from "../../components/Field";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../auth/AuthContext";
import { abrirWhatsApp, mensajeConfirmacion } from "../../utils/whatsapp";
import { descargarCSV } from "../../utils/exportar";
import { ESTADO_RESERVA, presentar } from "../../config/estados";
import { normalizar } from "../../utils/normalizar";
import NuevaReservaForm from "./NuevaReservaForm";
import DetalleReserva from "./DetalleReserva";
import "./Reservas.css";

const formatoMoneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

const formatoFecha = (iso) => {
  // Muestra la fecha de forma legible (15 jun 2025) en vez de 2025-06-15.
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default function Reservas() {
  const reservas = useApi(api.reservas);
  const huespedes = useApi(api.huespedes);
  const habitaciones = useApi(api.habitaciones);
  const toast = useToast();
  const { usuario, esAdmin } = useAuth();

  async function exportar() {
    try {
      await descargarCSV("reservas", "reservas.csv");
    } catch (e) {
      toast.error(e.message || "No se pudo exportar.");
    }
  }

  const [modalAbierto, setModalAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroYear, setFiltroYear] = useState("todos");
  const [cancelandoId, setCancelandoId] = useState(null);
  const [confirmandoId, setConfirmandoId] = useState(null);
  const [reservaSeleccionada, setReservaSeleccionada] = useState(null);

  // Extraer años disponibles para el filtro.
  const aniosDisponibles = useMemo(() => {
    if (!reservas.data) return [];
    const set = new Set();
    for (const r of reservas.data) {
      if (r.fecha_entrada) {
        set.add(new Date(r.fecha_entrada + "T00:00:00").getFullYear());
      }
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [reservas.data]);

  // Filtrado en cliente: por texto, estado y año.
  const filtradas = useMemo(() => {
    if (!reservas.data) return [];
    const texto = normalizar(busqueda.trim());
    return reservas.data
      .filter((r) => {
        const coincideTexto =
          !texto ||
          normalizar(r.huesped).includes(texto) ||
          normalizar(String(r.habitacion)).includes(texto);
        const coincideEstado =
          filtroEstado === "todos" || r.estado === filtroEstado;
        const coincideYear =
          filtroYear === "todos" ||
          (r.fecha_entrada &&
            new Date(r.fecha_entrada + "T00:00:00").getFullYear() === Number(filtroYear));
        return coincideTexto && coincideEstado && coincideYear;
      })
      .sort((a, b) => (a.fecha_entrada || "").localeCompare(b.fecha_entrada || ""));
  }, [reservas.data, busqueda, filtroEstado, filtroYear]);

  // Agrupar por mes (Junio 2026, Julio 2026, etc.) para mostrar separadores.
  const mesesNombres = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const agrupadas = useMemo(() => {
    const grupos = [];
    let mesActual = null;
    for (const r of filtradas) {
      const d = r.fecha_entrada ? new Date(r.fecha_entrada + "T00:00:00") : null;
      const clave = d ? `${d.getFullYear()}-${d.getMonth()}` : "sin-fecha";
      if (clave !== mesActual) {
        mesActual = clave;
        const label = d
          ? `${mesesNombres[d.getMonth()]} ${d.getFullYear()}`
          : "Sin fecha";
        grupos.push({ label, key: clave, date: d, reservas: [] });
      }
      grupos[grupos.length - 1].reservas.push(r);
    }

    // Reordenar: mes actual primero, luego futuros, luego pasados.
    const ahora = new Date();
    const claveActual = `${ahora.getFullYear()}-${ahora.getMonth()}`;
    const futuros = [];
    const pasados = [];
    let actual = null;
    for (const g of grupos) {
      if (g.key === claveActual) {
        actual = g;
      } else if (g.date && g.date >= ahora) {
        futuros.push(g);
      } else {
        pasados.push(g);
      }
    }
    return [...(actual ? [actual] : []), ...futuros, ...pasados];
  }, [filtradas]);

  function alCrear() {
    setModalAbierto(false);
    reservas.recargar();
    toast.success("Reserva creada.");
  }

  async function cancelar(id) {
    if (!window.confirm(`Cancelar la reserva #${id}?`)) return;
    setCancelandoId(id);
    try {
      await api.cancelarReserva(id);
      toast.success(`Reserva #${id} cancelada.`);
      reservas.recargar();
    } catch (e) {
      toast.error(e.message || "No se pudo cancelar la reserva.");
    } finally {
      setCancelandoId(null);
    }
  }

  async function confirmar(r) {
    setConfirmandoId(r.id);
    try {
      await api.confirmarReserva(r.id);
      const texto = mensajeConfirmacion({
        hospedaje: usuario?.hospedaje_nombre,
        huesped: r.huesped,
        room: r.habitacion,
        tipo: r.tipo,
        checkin: r.fecha_entrada,
        checkout: r.fecha_salida,
        total: r.total,
      });
      const abrio = abrirWhatsApp(r.telefono, texto);
      toast.success(
        abrio
          ? "Reserva confirmada. Abriendo WhatsApp para avisar al huésped…"
          : "Reserva confirmada (este huésped no dejó teléfono para WhatsApp)."
      );
      reservas.recargar();
    } catch (e) {
      toast.error(e.message || "No se pudo confirmar la reserva.");
    } finally {
      setConfirmandoId(null);
    }
  }

  // Solo bloqueamos con el spinner en la carga INICIAL (sin datos aun). En las
  // recargas en segundo plano (ej. tras crear un huesped) mantenemos el
  // formulario montado para no perder lo ya escrito.
  const cargandoDatosForm = !huespedes.data || !habitaciones.data;

  return (
    <div className="reservas">
      <header className="reservas__head">
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {esAdmin && (
            <Button variant="secondary" onClick={exportar}>
              Exportar
            </Button>
          )}
          <Button icon="+" onClick={() => setModalAbierto(true)}>
            Nueva reserva
          </Button>
        </div>
      </header>

      {/* ---------- Filtros ---------- */}
      <Card padding="sm" className="reservas__filtros">
        <div className="reservas__buscar">
          <Field id="buscar" label="Buscar">
            <input
              id="buscar"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Huesped o numero de habitacion…"
            />
          </Field>
        </div>
        <div className="reservas__filtro-estado">
          <Field id="estado" label="Estado">
            <select
              id="estado"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
            >
              <option value="todos">Todos</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Confirmada">Confirmada</option>
              <option value="Check-in">Check-in</option>
              <option value="Check-out">Check-out</option>
              <option value="Cancelada">Cancelada</option>
            </select>
          </Field>
        </div>
        <div className="reservas__filtro-year">
          <Field id="year" label="Año">
            <select
              id="year"
              value={filtroYear}
              onChange={(e) => setFiltroYear(e.target.value)}
            >
              <option value="todos">Todos</option>
              {aniosDisponibles.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      {/* ---------- Estados de carga / error / vacio ---------- */}
      {reservas.loading && (
        <Card>
          <StateMessage variant="loading" title="Cargando reservas…" />
        </Card>
      )}

      {reservas.error && (
        <Card>
          <StateMessage
            variant="error"
            title="No se pudieron cargar las reservas"
            message={reservas.error}
            action={
              <Button variant="secondary" onClick={reservas.recargar}>
                Reintentar
              </Button>
            }
          />
        </Card>
      )}

      {reservas.data && filtradas.length === 0 && (
        <Card>
          <StateMessage
            variant="empty"
            title={
              reservas.data.length === 0
                ? "Aun no hay reservas"
                : "Sin resultados"
            }
            message={
              reservas.data.length === 0
                ? "Crea tu primera reserva para empezar."
                : "Prueba con otra busqueda o cambia el filtro de estado."
            }
            action={
              reservas.data.length === 0 ? (
                <Button icon="+" onClick={() => setModalAbierto(true)}>
                  Nueva reserva
                </Button>
              ) : null
            }
          />
        </Card>
      )}

      {/* ---------- Lista de reservas agrupadas por mes ---------- */}
      {filtradas.length > 0 && (
        <div className="reservas__lista">
          {agrupadas.map((grupo) => (
            <div key={grupo.label} className="reservas__mes">
              <h3 className="reservas__mes-titulo">{grupo.label}</h3>
              <span className="reservas__mes-conteo">{grupo.reservas.length} reserva{grupo.reservas.length !== 1 ? "s" : ""}</span>
              <div className="reservas__mes-items">
                {grupo.reservas.map((r) => {
                  const est = presentar(ESTADO_RESERVA, r.estado);
                  const cancelable =
                    r.estado !== "Cancelada" && r.estado !== "Check-out";
                  return (
                    <Card
                      key={r.id}
                      padding="sm"
                      className="reserva-item"
                      onClick={() => setReservaSeleccionada(r.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <div className="reserva-item__main">
                        <div className="reserva-item__huesped">
                          <span className="reserva-item__nombre">{r.huesped}</span>
                          <Badge tone={est.tone} icon={est.icon}>
                            {est.label}
                          </Badge>
                        </div>
                        <div className="reserva-item__meta">
                          <span>Hab. {r.habitacion}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {formatoFecha(r.fecha_entrada)} →{" "}
                            {formatoFecha(r.fecha_salida)}
                          </span>
                        </div>
                      </div>
                      <div className="reserva-item__lado">
                        <span className="reserva-item__total">
                          {formatoMoneda.format(r.total || 0)}
                        </span>
                        {r.estado === "Pendiente" && (
                          <Button
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); confirmar(r); }}
                            loading={confirmandoId === r.id}
                          >
                            Confirmar y avisar
                          </Button>
                        )}
                        {cancelable && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); cancelar(r.id); }}
                            disabled={cancelandoId === r.id}
                          >
                            {cancelandoId === r.id ? "Cancelando…" : "Cancelar"}
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Modal: nueva reserva ---------- */}
      <Modal
        open={modalAbierto}
        title="Nueva reserva"
        onClose={() => setModalAbierto(false)}
      >
        {cargandoDatosForm ? (
          <StateMessage variant="loading" title="Cargando datos…" />
        ) : (
          <NuevaReservaForm
            huespedes={huespedes.data || []}
            habitaciones={habitaciones.data || []}
            onCreada={alCrear}
            onCancelar={() => setModalAbierto(false)}
            onHuespedCreado={huespedes.recargar}
          />
        )}
      </Modal>

      {/* ---------- Modal: detalle de reserva ---------- */}
      <DetalleReserva
        reservaId={reservaSeleccionada}
        onClose={() => setReservaSeleccionada(null)}
      />
    </div>
  );
}
