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
import { ESTADO_HOSPEDAJE, PLAN_HOSPEDAJE, presentar } from "../../config/estados";
import HospedajeForm from "./HospedajeForm";
import "../entidades.css";

const formatoFecha = (iso) => {
  if (!iso) return "—";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (isNaN(d)) return String(iso).slice(0, 10);
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * Hospedajes — panel del SUPER ADMIN (dueño del SaaS).
 * Lista todos los clientes (hospedajes), permite crear nuevos y
 * activar/suspender/editar su plan y vencimiento.
 */
export default function Hospedajes() {
  const hospedajes = useApi(api.hospedajes);
  const toast = useToast();
  const [modal, setModal] = useState(null); // null | {modo, hospedaje}
  const [busqueda, setBusqueda] = useState("");
  const [cambiandoId, setCambiandoId] = useState(null);

  const filtrados = useMemo(() => {
    if (!hospedajes.data) return [];
    const t = busqueda.trim().toLowerCase();
    if (!t) return hospedajes.data;
    return hospedajes.data.filter((h) => h.nombre.toLowerCase().includes(t));
  }, [hospedajes.data, busqueda]);

  // Resumen rápido del negocio.
  const resumen = useMemo(() => {
    const d = hospedajes.data || [];
    return {
      total: d.length,
      activos: d.filter((h) => h.estado === "activo").length,
      suspendidos: d.filter((h) => h.estado === "suspendido").length,
    };
  }, [hospedajes.data]);

  function alGuardar() {
    const creado = modal?.modo === "crear";
    setModal(null);
    hospedajes.recargar();
    toast.success(creado ? "Hospedaje creado." : "Hospedaje actualizado.");
  }

  // Activar/suspender rápido desde la tarjeta.
  async function alternarSuspension(h) {
    const nuevoEstado = h.estado === "suspendido" ? "activo" : "suspendido";
    const verbo = nuevoEstado === "suspendido" ? "suspender" : "reactivar";
    if (!window.confirm(`¿Seguro que deseas ${verbo} "${h.nombre}"?`)) return;
    setCambiandoId(h.id);
    try {
      await api.editarHospedaje(h.id, {
        nombre: h.nombre,
        plan: h.plan,
        estado: nuevoEstado,
        fecha_expira: (h.fecha_expira || "").slice(0, 10),
      });
      toast.success(nuevoEstado === "suspendido" ? `"${h.nombre}" suspendido.` : `"${h.nombre}" reactivado.`);
      hospedajes.recargar();
    } catch (e) {
      toast.error(e.message || "No se pudo cambiar el estado.");
    } finally {
      setCambiandoId(null);
    }
  }

  return (
    <div className="entidad">
      <header className="entidad__head">
        <div>
          <h1>Hospedajes</h1>
          <p className="entidad__subtitle">
            Panel de administración del servicio. Gestiona los hospedajes clientes.
          </p>
        </div>
        <Button icon="+" onClick={() => setModal({ modo: "crear", hospedaje: null })}>
          Nuevo hospedaje
        </Button>
      </header>

      {/* Resumen */}
      {hospedajes.data && hospedajes.data.length > 0 && (
        <div className="facturas__resumen">
          <Card padding="sm" className="facturas__resumen-item">
            <span className="facturas__resumen-label">Total clientes</span>
            <span className="facturas__resumen-valor">{resumen.total}</span>
          </Card>
          <Card padding="sm" className="facturas__resumen-item">
            <span className="facturas__resumen-label">Activos</span>
            <span className="facturas__resumen-valor facturas__resumen-valor--ok">
              {resumen.activos}
            </span>
          </Card>
          <Card padding="sm" className="facturas__resumen-item">
            <span className="facturas__resumen-label">Suspendidos</span>
            <span className="facturas__resumen-valor facturas__resumen-valor--warn">
              {resumen.suspendidos}
            </span>
          </Card>
        </div>
      )}

      <Card padding="sm">
        <Field id="buscar" label="Buscar">
          <input
            id="buscar"
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre del hospedaje…"
          />
        </Field>
      </Card>

      {hospedajes.loading && (
        <Card><StateMessage variant="loading" title="Cargando hospedajes…" /></Card>
      )}

      {hospedajes.error && (
        <Card>
          <StateMessage
            variant="error"
            title="No se pudieron cargar los hospedajes"
            message={hospedajes.error}
            action={<Button variant="secondary" onClick={hospedajes.recargar}>Reintentar</Button>}
          />
        </Card>
      )}

      {hospedajes.data && filtrados.length === 0 && (
        <Card>
          <StateMessage
            variant="empty"
            title={hospedajes.data.length === 0 ? "Aún no hay hospedajes" : "Sin resultados"}
            message={
              hospedajes.data.length === 0
                ? "Crea el primer hospedaje cliente."
                : "Prueba con otro término de búsqueda."
            }
          />
        </Card>
      )}

      {filtrados.length > 0 && (
        <div className="entidad__grid">
          {filtrados.map((h) => {
            const est = presentar(ESTADO_HOSPEDAJE, h.estado);
            const plan = presentar(PLAN_HOSPEDAJE, h.plan);
            const suspendido = h.estado === "suspendido";
            return (
              <Card key={h.id} padding="sm" className="entidad-card">
                <div className="entidad-card__head">
                  <span className="entidad-card__titulo">{h.nombre}</span>
                  <span className="entidad-card__sub">#{h.id}</span>
                </div>

                <div className="entidad-card__badges">
                  <Badge tone={est.tone} icon={est.icon}>{est.label}</Badge>
                  <Badge tone={plan.tone} icon={plan.icon}>{plan.label}</Badge>
                </div>

                <ul className="huesped-card__datos">
                  <li><span aria-hidden="true">👤</span> {h.usuarios} usuario(s)</li>
                  <li><span aria-hidden="true">🛏️</span> {h.habitaciones} habitación(es)</li>
                  <li><span aria-hidden="true">📅</span> Vence: {formatoFecha(h.fecha_expira)}</li>
                </ul>

                <div className="entidad-card__acciones">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setModal({ modo: "editar", hospedaje: h })}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => alternarSuspension(h)}
                    disabled={cambiandoId === h.id}
                  >
                    {cambiandoId === h.id
                      ? "…"
                      : suspendido
                      ? "Reactivar"
                      : "Suspender"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!modal}
        title={modal?.modo === "editar" ? "Editar hospedaje" : "Nuevo hospedaje"}
        onClose={() => setModal(null)}
      >
        {modal && (
          <HospedajeForm
            hospedaje={modal.hospedaje}
            onGuardado={alGuardar}
            onCancelar={() => setModal(null)}
          />
        )}
      </Modal>
    </div>
  );
}
