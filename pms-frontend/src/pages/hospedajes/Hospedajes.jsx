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
import { normalizar } from "../../utils/normalizar";
import HospedajeForm from "./HospedajeForm";
import RegistrarPagoForm from "./RegistrarPagoForm";
import "../entidades.css";

const formatoFecha = (iso) => {
  if (!iso) return "—";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (isNaN(d)) return String(iso).slice(0, 10);
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
};

const moneda = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

/**
 * Hospedajes — panel del SUPER ADMIN (dueño del SaaS).
 * Lista todos los clientes (hospedajes), permite crear nuevos y
 * activar/suspender/editar su plan y vencimiento.
 */
export default function Hospedajes() {
  const hospedajes = useApi(api.hospedajes);
  const pagos = useApi(api.pagosSuscripcion);
  const toast = useToast();
  const [modal, setModal] = useState(null); // null | {modo, hospedaje}
  const [pagoDe, setPagoDe] = useState(null); // null | hospedaje (modal registrar pago)
  const [histAbierto, setHistAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [cambiandoId, setCambiandoId] = useState(null);

  const filtrados = useMemo(() => {
    if (!hospedajes.data) return [];
    const t = normalizar(busqueda.trim());
    if (!t) return hospedajes.data;
    return hospedajes.data.filter((h) => normalizar(h.nombre).includes(t));
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

  function alRegistrarPago(r) {
    setPagoDe(null);
    hospedajes.recargar();
    pagos.recargar();
    toast.success(`Pago registrado. Cliente activo hasta ${formatoFecha(r.fecha_expira)}.`);
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
        <Button icon="+" onClick={() => setModal({ modo: "crear", hospedaje: null })}>
          Nuevo hospedaje
        </Button>
        <Button variant="secondary" onClick={() => setHistAbierto(true)}>
          Historial de pagos
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
          <Card padding="sm" className="facturas__resumen-item">
            <span className="facturas__resumen-label">Recaudado</span>
            <span className="facturas__resumen-valor facturas__resumen-valor--ok">
              {pagos.data ? moneda.format(pagos.data.total_recaudado || 0) : "—"}
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
                    onClick={() => setPagoDe(h)}
                  >
                    Registrar pago
                  </Button>
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

      {/* Registrar pago de suscripción (activa/extiende automáticamente) */}
      <Modal
        open={!!pagoDe}
        title="Registrar pago de suscripción"
        onClose={() => setPagoDe(null)}
      >
        {pagoDe && (
          <RegistrarPagoForm
            hospedaje={pagoDe}
            onGuardado={alRegistrarPago}
            onCancelar={() => setPagoDe(null)}
          />
        )}
      </Modal>

      {/* Historial de pagos del SaaS */}
      <Modal
        open={histAbierto}
        title="Historial de pagos"
        onClose={() => setHistAbierto(false)}
      >
        {pagos.loading && <StateMessage variant="loading" title="Cargando pagos…" />}
        {pagos.error && (
          <StateMessage variant="error" title="No se pudieron cargar los pagos" message={pagos.error} />
        )}
        {pagos.data && (
          <div className="pagos-hist">
            <p className="pagos-hist__total">
              Total recaudado: <strong>{moneda.format(pagos.data.total_recaudado || 0)}</strong>{" "}
              · {pagos.data.cantidad} pago(s)
            </p>
            {pagos.data.pagos.length === 0 ? (
              <StateMessage variant="empty" title="Aún no hay pagos registrados" />
            ) : (
              <ul className="pagos-hist__lista">
                {pagos.data.pagos.map((p) => (
                  <li key={p.id} className="pagos-hist__item">
                    <div>
                      <strong>{p.hospedaje_nombre || `#${p.hospedaje_id}`}</strong>
                      <span className="pagos-hist__meta">
                        {p.plan} · {p.periodo} · {p.metodo}
                      </span>
                      {p.nota && <span className="pagos-hist__nota">{p.nota}</span>}
                    </div>
                    <div className="pagos-hist__derecha">
                      <span className="pagos-hist__monto">{moneda.format(p.monto)}</span>
                      <span className="pagos-hist__meta">
                        {formatoFecha(p.fecha_pago)} → vence {formatoFecha(p.cubre_hasta)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
