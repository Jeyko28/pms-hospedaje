import { useState } from "react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Field from "../../components/Field";
import Modal from "../../components/Modal";
import StateMessage from "../../components/StateMessage";
import { useToast } from "../../components/Toast";
import { ESTADO_HABITACION, ESTADO_LIMPIEZA, presentar } from "../../config/estados";
import "../entidades.css";
import "./Housekeeping.css";

// Una habitación "necesita atención" si no está limpia.
const porLimpiar = (h) =>
  h.estado_limpieza === "Sucia" ||
  h.estado_limpieza === "Revisión" ||
  h.estado_limpieza === "Revision";

const ESTADOS = ["Limpia", "Sucia", "Revisión"];

export default function Housekeeping() {
  const habitaciones = useApi(api.habitaciones);
  const tareas = useApi(api.tareasLimpieza);
  const toast = useToast();

  const [filtro, setFiltro] = useState("limpiar"); // limpiar | limpias | todas
  const [accionId, setAccionId] = useState(null); // habitación en proceso
  const [asignar, setAsignar] = useState(null); // null | habitacion
  const [form, setForm] = useState({ asignado_a: "", notas: "" });
  const [guardandoAsig, setGuardandoAsig] = useState(false);

  const data = habitaciones.data || [];
  const numPorLimpiar = data.filter(porLimpiar).length;

  // Filtrar + ordenar (las que necesitan atención y con salida vencida primero).
  let lista = data;
  if (filtro === "limpiar") lista = data.filter(porLimpiar);
  else if (filtro === "limpias") lista = data.filter((h) => !porLimpiar(h));
  lista = [...lista].sort((a, b) => {
    const aw = (porLimpiar(a) ? 2 : 0) + (a.salida_vencida ? 1 : 0);
    const bw = (porLimpiar(b) ? 2 : 0) + (b.salida_vencida ? 1 : 0);
    return bw - aw;
  });

  async function cambiar(h, estado) {
    if (h.estado_limpieza === estado) return;
    setAccionId(h.id);
    try {
      await api.cambiarLimpieza(h.id, estado);
      habitaciones.recargar();
      tareas.recargar(); // al quedar Limpia, su tarea pendiente se cierra (backend)
      toast.success(`Hab. ${h.numero}: ${estado}.`);
    } catch (e) {
      toast.error(e.message || "No se pudo cambiar el estado.");
    } finally {
      setAccionId(null);
    }
  }

  function abrirAsignar(h) {
    setForm({ asignado_a: "", notas: "" });
    setAsignar(h);
  }

  async function guardarAsignar(ev) {
    ev.preventDefault();
    setGuardandoAsig(true);
    try {
      await api.crearTareaLimpieza({
        habitacion_id: asignar.id,
        asignado_a: form.asignado_a.trim(),
        notas: form.notas.trim(),
      });
      setAsignar(null);
      habitaciones.recargar();
      tareas.recargar();
      toast.success(`Tarea asignada en Hab. ${asignar.numero}.`);
    } catch (e) {
      toast.error(e.message || "No se pudo asignar la tarea.");
    } finally {
      setGuardandoAsig(false);
    }
  }

  // Mapa habitacion_id -> tarea pendiente (asignación opcional mostrada en la tarjeta).
  const tareaPorHab = {};
  (tareas.data || []).forEach((t) => {
    tareaPorHab[t.habitacion_id] = t;
  });

  return (
    <div className="entidad hk">
      <header className="entidad__head" />

      {/* Filtros rápidos */}
      <div className="hk__filtros" role="tablist" aria-label="Filtrar habitaciones">
        <button
          className={`hk__chip${filtro === "limpiar" ? " hk__chip--activo" : ""}`}
          onClick={() => setFiltro("limpiar")}
        >
          Por limpiar{numPorLimpiar > 0 ? ` (${numPorLimpiar})` : ""}
        </button>
        <button
          className={`hk__chip${filtro === "limpias" ? " hk__chip--activo" : ""}`}
          onClick={() => setFiltro("limpias")}
        >
          Limpias
        </button>
        <button
          className={`hk__chip${filtro === "todas" ? " hk__chip--activo" : ""}`}
          onClick={() => setFiltro("todas")}
        >
          Todas
        </button>
      </div>

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

      {habitaciones.data && lista.length === 0 && (
        <Card>
          <StateMessage
            variant="empty"
            title={filtro === "limpiar" ? "¡Todo limpio!" : "Sin habitaciones"}
            message={
              filtro === "limpiar"
                ? "No hay habitaciones pendientes de limpieza."
                : "No hay habitaciones que mostrar con este filtro."
            }
          />
        </Card>
      )}

      {lista.length > 0 && (
        <div className="entidad__grid">
          {lista.map((h) => {
            const ocup = presentar(ESTADO_HABITACION, h.ocupacion_hoy || h.estado);
            const limp = presentar(ESTADO_LIMPIEZA, h.estado_limpieza);
            return (
              <Card key={h.id} padding="sm" className="entidad-card">
                <div className="entidad-card__head">
                  <span className="entidad-card__titulo">Hab. {h.numero}</span>
                  <span className="entidad-card__sub">{h.tipo}</span>
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
                  {tareaPorHab[h.id] && (
                    <Badge tone="info" icon="👤">
                      {tareaPorHab[h.id].asignado_a || "Asignada"}
                    </Badge>
                  )}
                </div>

                {/* Cambio rápido de estado (segmentado) */}
                <div className="hk__estados" role="group" aria-label="Cambiar estado de limpieza">
                  {ESTADOS.map((est) => {
                    const activo =
                      h.estado_limpieza === est ||
                      (est === "Revisión" && h.estado_limpieza === "Revision");
                    return (
                      <Button
                        key={est}
                        size="sm"
                        variant={activo ? "primary" : "secondary"}
                        disabled={activo || accionId === h.id}
                        onClick={() => cambiar(h, est)}
                      >
                        {est}
                      </Button>
                    );
                  })}
                </div>

                <div className="entidad-card__acciones">
                  <Button size="sm" variant="ghost" onClick={() => abrirAsignar(h)}>
                    Asignar a alguien
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: asignar limpieza */}
      <Modal
        open={!!asignar}
        title={asignar ? `Asignar limpieza · Hab. ${asignar.numero}` : "Asignar limpieza"}
        onClose={() => setAsignar(null)}
      >
        {asignar && (
          <form className="hk__form" onSubmit={guardarAsignar}>
            <Field id="hk-asignado" label="Responsable (opcional)">
              <input
                id="hk-asignado"
                type="text"
                value={form.asignado_a}
                onChange={(e) => setForm((f) => ({ ...f, asignado_a: e.target.value }))}
                placeholder="Ej. María"
                autoFocus
              />
            </Field>
            <Field id="hk-notas" label="Nota (opcional)">
              <input
                id="hk-notas"
                type="text"
                value={form.notas}
                onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                placeholder="Ej. Cambiar sábanas, revisar baño"
              />
            </Field>
            <p className="hk__form-hint">
              Al asignar, la habitación quedará marcada como <strong>Sucia</strong> hasta
              que se complete la tarea.
            </p>
            <div className="hk__form-acciones">
              <Button type="button" variant="secondary" onClick={() => setAsignar(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardandoAsig}>
                {guardandoAsig ? "Asignando…" : "Asignar"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
