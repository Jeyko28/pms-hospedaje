import { nfMoneda } from "../../utils/moneda";
import { useState } from "react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import StateMessage from "../../components/StateMessage";
import { useToast } from "../../components/Toast";
import {
  ESTADO_HABITACION,
  ESTADO_LIMPIEZA,
  presentar,
} from "../../config/estados";
import HabitacionForm from "./HabitacionForm";
import HabitacionFotos from "./HabitacionFotos";
import "../entidades.css";

const formatoMoneda = nfMoneda({
  style: "currency",
  currency: "PEN",
});

export default function Habitaciones() {
  const habitaciones = useApi(api.habitaciones);
  const toast = useToast();
  const [modal, setModal] = useState(null); // null | {modo, habitacion}
  const [borrandoId, setBorrandoId] = useState(null);
  const [fotosDe, setFotosDe] = useState(null); // habitación en edición de fotos/detalles

  function abrirCrear() {
    setModal({ modo: "crear", habitacion: null });
  }
  function abrirEditar(h) {
    setModal({ modo: "editar", habitacion: h });
  }
  function alGuardar() {
    const creada = modal?.modo === "crear";
    setModal(null);
    habitaciones.recargar();
    toast.success(creada ? "Habitación creada." : "Habitación actualizada.");
  }

  async function eliminar(h) {
    if (!window.confirm(`Eliminar la habitacion ${h.numero}? Esta accion no se puede deshacer.`))
      return;
    setBorrandoId(h.id);
    try {
      await api.eliminarHabitacion(h.id);
      toast.success(`Habitación ${h.numero} eliminada.`);
      habitaciones.recargar();
    } catch (e) {
      toast.error(e.message || "No se pudo eliminar la habitación.");
    } finally {
      setBorrandoId(null);
    }
  }

  return (
    <div className="entidad">
      <header className="entidad__head">
        <Button icon="+" onClick={abrirCrear}>
          Nueva habitación
        </Button>
      </header>

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
            message="Crea tu primera habitación para empezar a recibir reservas."
            action={
              <Button icon="+" onClick={abrirCrear}>
                Nueva habitación
              </Button>
            }
          />
        </Card>
      )}

      {habitaciones.data && habitaciones.data.length > 0 && (
        <div className="entidad__grid">
          {habitaciones.data.map((h) => {
            // Ocupación de HOY derivada del calendario (no del flag manual).
            const ocup = presentar(ESTADO_HABITACION, h.ocupacion_hoy || h.estado);
            const limp = presentar(ESTADO_LIMPIEZA, h.estado_limpieza);
            return (
              <Card key={h.id} padding="sm" className="entidad-card">
                <div className="entidad-card__head">
                  <span className="entidad-card__titulo">Hab. {h.numero}</span>
                  <span className="entidad-card__sub">{h.tipo}</span>
                </div>
                <div className="entidad-card__precio">
                  {formatoMoneda.format(h.precio_base)}
                  <span className="entidad-card__precio-unit"> / noche</span>
                </div>
                <div className="entidad-card__badges">
                  <Badge tone={ocup.tone} icon={ocup.icon}>
                    {ocup.label}
                  </Badge>
                  <Badge tone={limp.tone} icon={limp.icon}>
                    {limp.label}
                  </Badge>
                  {h.salida_vencida && (
                    <Badge tone="warning" icon="!">
                      Salida vencida
                    </Badge>
                  )}
                </div>
                <div className="entidad-card__acciones">
                  <Button size="sm" variant="secondary" onClick={() => abrirEditar(h)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setFotosDe(h)}>
                    Fotos
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => eliminar(h)}
                    disabled={borrandoId === h.id}
                  >
                    {borrandoId === h.id ? "Eliminando…" : "Eliminar"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!modal}
        title={modal?.modo === "editar" ? "Editar habitación" : "Nueva habitación"}
        onClose={() => setModal(null)}
      >
        {modal && (
          <HabitacionForm
            habitacion={modal.habitacion}
            onGuardada={alGuardar}
            onCancelar={() => setModal(null)}
          />
        )}
      </Modal>

      <Modal
        open={!!fotosDe}
        title={fotosDe ? `Fotos y detalles · Hab. ${fotosDe.numero}` : ""}
        onClose={() => setFotosDe(null)}
      >
        {fotosDe && (
          <HabitacionFotos
            habitacion={fotosDe}
            onCerrar={(huboCambio) => {
              setFotosDe(null);
              if (huboCambio) habitaciones.recargar();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
