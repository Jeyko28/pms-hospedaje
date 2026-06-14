import { useMemo, useState } from "react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import StateMessage from "../../components/StateMessage";
import Field from "../../components/Field";
import { ESTADO_RESERVA, presentar } from "../../config/estados";
import NuevaReservaForm from "./NuevaReservaForm";
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

  const [modalAbierto, setModalAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [cancelandoId, setCancelandoId] = useState(null);
  const [confirmandoId, setConfirmandoId] = useState(null);

  // Filtrado en cliente: por texto (huesped/habitacion) y por estado.
  const filtradas = useMemo(() => {
    if (!reservas.data) return [];
    const texto = busqueda.trim().toLowerCase();
    return reservas.data.filter((r) => {
      const coincideTexto =
        !texto ||
        r.huesped.toLowerCase().includes(texto) ||
        String(r.habitacion).toLowerCase().includes(texto);
      const coincideEstado =
        filtroEstado === "todos" || r.estado === filtroEstado;
      return coincideTexto && coincideEstado;
    });
  }, [reservas.data, busqueda, filtroEstado]);

  function alCrear() {
    setModalAbierto(false);
    reservas.recargar();
  }

  async function cancelar(id) {
    if (!window.confirm(`Cancelar la reserva #${id}?`)) return;
    setCancelandoId(id);
    try {
      await api.cancelarReserva(id);
      reservas.recargar();
    } catch (e) {
      window.alert(e.message);
    } finally {
      setCancelandoId(null);
    }
  }

  async function confirmar(id) {
    setConfirmandoId(id);
    try {
      await api.confirmarReserva(id);
      reservas.recargar();
    } catch (e) {
      window.alert(e.message);
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
        <div>
          <h1>Reservas</h1>
          <p className="reservas__subtitle">
            Gestiona las reservas de tu hospedaje.
          </p>
        </div>
        <Button icon="+" onClick={() => setModalAbierto(true)}>
          Nueva reserva
        </Button>
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

      {/* ---------- Lista de reservas (tarjetas escaneables) ---------- */}
      {filtradas.length > 0 && (
        <div className="reservas__lista">
          {filtradas.map((r) => {
            const est = presentar(ESTADO_RESERVA, r.estado);
            const cancelable =
              r.estado !== "Cancelada" && r.estado !== "Check-out";
            return (
              <Card key={r.id} padding="sm" className="reserva-item">
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
                  {/* Reserva del motor público: confirmar antes de operar. */}
                  {r.estado === "Pendiente" && (
                    <Button
                      size="sm"
                      onClick={() => confirmar(r.id)}
                      disabled={confirmandoId === r.id}
                    >
                      {confirmandoId === r.id ? "Confirmando…" : "Confirmar"}
                    </Button>
                  )}
                  {cancelable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelar(r.id)}
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
    </div>
  );
}
