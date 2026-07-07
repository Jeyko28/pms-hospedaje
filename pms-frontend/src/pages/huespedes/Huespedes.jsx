import { nfMoneda } from "../../utils/moneda";
import { useMemo, useState } from "react";
import { LayoutGrid, List, Archive, RotateCcw, Star } from "lucide-react";
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
import { descargarCSV } from "../../utils/exportar";
import { normalizar } from "../../utils/normalizar";
import HuespedForm from "./HuespedForm";
import "../entidades.css";
import "./Huespedes.css";

const moneda0 = nfMoneda({
  style: "currency",
  currency: "PEN",
  maximumFractionDigits: 0,
});

const fechaCorta = (iso) => {
  if (!iso) return null;
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (isNaN(d)) return null;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
};

// Estado del huésped → tono del badge.
const ESTADO_TONO = { VIP: "brand", Frecuente: "info", Nuevo: "neutral" };

const VISTA_KEY = "pms-huespedes-vista";

export default function Huespedes() {
  const [vista, setVista] = useState(() => {
    const v = localStorage.getItem(VISTA_KEY);
    return v === "lista" ? "lista" : "tarjetas";
  });
  const [verArchivados, setVerArchivados] = useState(false);
  const huespedes = useApi(() => api.huespedes(verArchivados), [verArchivados]);
  const toast = useToast();
  const { esAdmin } = useAuth();
  const [modal, setModal] = useState(null);
  const [accionId, setAccionId] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  function cambiarVista(v) {
    setVista(v);
    localStorage.setItem(VISTA_KEY, v);
  }

  async function exportar() {
    try {
      await descargarCSV("huespedes", "huespedes.csv");
    } catch (e) {
      toast.error(e.message || "No se pudo exportar.");
    }
  }

  const filtrados = useMemo(() => {
    if (!huespedes.data) return [];
    const t = normalizar(busqueda.trim());
    if (!t) return huespedes.data;
    return huespedes.data.filter(
      (h) =>
        normalizar(h.nombre).includes(t) ||
        normalizar(h.email || "").includes(t) ||
        normalizar(h.documento || "").includes(t) ||
        normalizar(h.telefono || "").includes(t)
    );
  }, [huespedes.data, busqueda]);

  function alGuardar() {
    const creado = modal?.modo === "crear";
    setModal(null);
    huespedes.recargar();
    toast.success(creado ? "Huésped registrado." : "Huésped actualizado.");
  }

  async function archivar(h) {
    if (!window.confirm(`¿Archivar a ${h.nombre}? Conservará todo su historial y podrás restaurarlo.`)) return;
    setAccionId(h.id);
    try {
      await api.archivarHuesped(h.id);
      toast.success(`${h.nombre} archivado.`);
      huespedes.recargar();
    } catch (e) {
      toast.error(e.message || "No se pudo archivar el huésped.");
    } finally {
      setAccionId(null);
    }
  }

  async function desarchivar(h) {
    setAccionId(h.id);
    try {
      await api.desarchivarHuesped(h.id);
      toast.success(`${h.nombre} restaurado.`);
      huespedes.recargar();
    } catch (e) {
      toast.error(e.message || "No se pudo restaurar el huésped.");
    } finally {
      setAccionId(null);
    }
  }

  const iniciales = (nombre) =>
    (nombre || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join("");

  // Resumen de acciones por huésped (archivar/desarchivar + editar).
  function acciones(h) {
    return (
      <div className="entidad-card__acciones">
        <Button size="sm" variant="secondary" onClick={() => setModal({ modo: "editar", huesped: h })}>
          Editar
        </Button>
        {h.archivado ? (
          <Button size="sm" variant="ghost" onClick={() => desarchivar(h)} disabled={accionId === h.id}>
            <RotateCcw size={14} /> Restaurar
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => archivar(h)} disabled={accionId === h.id}>
            <Archive size={14} /> Archivar
          </Button>
        )}
      </div>
    );
  }

  function estadoBadge(m) {
    if (!m) return null;
    return (
      <Badge tone={ESTADO_TONO[m.estado] || "neutral"} icon={m.estado === "VIP" ? undefined : undefined}>
        {m.estado === "VIP" && <Star size={12} style={{ verticalAlign: "-2px" }} />} {m.estado}
      </Badge>
    );
  }

  return (
    <div className="entidad">
      <header className="entidad__head entidad__head--between">
        <div className="hsp-toolbar">
          {/* Toggle de vista */}
          <div className="hsp-vista" role="group" aria-label="Modo de vista">
            <button
              type="button"
              className={`hsp-vista__btn ${vista === "tarjetas" ? "is-active" : ""}`}
              aria-pressed={vista === "tarjetas"}
              onClick={() => cambiarVista("tarjetas")}
              title="Tarjetas"
            >
              <LayoutGrid size={16} /> <span className="hsp-vista__label">Tarjetas</span>
            </button>
            <button
              type="button"
              className={`hsp-vista__btn ${vista === "lista" ? "is-active" : ""}`}
              aria-pressed={vista === "lista"}
              onClick={() => cambiarVista("lista")}
              title="Lista"
            >
              <List size={16} /> <span className="hsp-vista__label">Lista</span>
            </button>
          </div>
          <label className="hsp-archivados">
            <input
              type="checkbox"
              checked={verArchivados}
              onChange={(e) => setVerArchivados(e.target.checked)}
            />
            Mostrar archivados
          </label>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {esAdmin && (
            <Button variant="secondary" onClick={exportar}>
              Exportar
            </Button>
          )}
          <Button icon="+" onClick={() => setModal({ modo: "crear", huesped: null })}>
            Nuevo huésped
          </Button>
        </div>
      </header>

      <Card padding="sm">
        <Field id="buscar" label="Buscar">
          <input
            id="buscar"
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre, correo, documento o teléfono…"
          />
        </Field>
      </Card>

      {huespedes.loading && (
        <Card><StateMessage variant="loading" title="Cargando huéspedes…" /></Card>
      )}

      {huespedes.error && (
        <Card>
          <StateMessage
            variant="error"
            title="No se pudieron cargar los huéspedes"
            message={huespedes.error}
            action={<Button variant="secondary" onClick={huespedes.recargar}>Reintentar</Button>}
          />
        </Card>
      )}

      {huespedes.data && filtrados.length === 0 && (
        <Card>
          <StateMessage
            variant="empty"
            title={huespedes.data.length === 0 ? "Aún no hay huéspedes" : "Sin resultados"}
            message={
              huespedes.data.length === 0
                ? "Registra tu primer huésped para asociarlo a una reserva."
                : "Prueba con otro término de búsqueda."
            }
            action={
              huespedes.data.length === 0 ? (
                <Button icon="+" onClick={() => setModal({ modo: "crear", huesped: null })}>
                  Nuevo huésped
                </Button>
              ) : null
            }
          />
        </Card>
      )}

      {/* ---------- Vista TARJETAS ---------- */}
      {filtrados.length > 0 && vista === "tarjetas" && (
        <div className="entidad__grid">
          {filtrados.map((h) => {
            const m = h.metricas;
            return (
              <Card key={h.id} padding="sm" className={`entidad-card huesped-card ${h.archivado ? "is-archived" : ""}`}>
                <div className="huesped-card__head">
                  <span className="huesped-card__avatar" aria-hidden="true">{iniciales(h.nombre)}</span>
                  <span className="entidad-card__titulo">{h.nombre}</span>
                  {estadoBadge(m)}
                </div>

                {m && (
                  <div className="huesped-card__metricas">
                    <div><strong>{m.reservas}</strong><span>reservas</span></div>
                    <div><strong>{moneda0.format(m.gasto_total)}</strong><span>gastado</span></div>
                    <div><strong>{m.noches}</strong><span>noches</span></div>
                  </div>
                )}

                <div className="huesped-card__extra">
                  {m?.proxima_reserva ? (
                    <span className="huesped-card__prox">Próxima: {fechaCorta(m.proxima_reserva)}</span>
                  ) : m?.ultima_visita ? (
                    <span>Última visita: {fechaCorta(m.ultima_visita)}</span>
                  ) : (
                    <span className="huesped-card__sin-datos">Sin estadías aún</span>
                  )}
                  {(h.email || h.telefono) && (
                    <span className="huesped-card__contacto">
                      {h.telefono || h.email}
                    </span>
                  )}
                  {m?.cancelaciones > 0 && (
                    <span className="huesped-card__canc">{m.cancelaciones} cancelación(es)</span>
                  )}
                </div>

                {acciones(h)}
              </Card>
            );
          })}
        </div>
      )}

      {/* ---------- Vista LISTA (optimizada para muchos) ---------- */}
      {filtrados.length > 0 && vista === "lista" && (
        <Card padding="none" className="hsp-lista-card">
          <div className="hsp-lista-scroll">
            <table className="hsp-tabla">
              <thead>
                <tr>
                  <th>Huésped</th>
                  <th>Estado</th>
                  <th className="hsp-num">Reservas</th>
                  <th className="hsp-num">Noches</th>
                  <th className="hsp-num">Gastado</th>
                  <th>Última visita</th>
                  <th>Próxima</th>
                  <th>Contacto</th>
                  <th className="hsp-acc">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((h) => {
                  const m = h.metricas || {};
                  return (
                    <tr key={h.id} className={h.archivado ? "is-archived" : ""}>
                      <td>
                        <div className="hsp-tabla__nombre">
                          <span className="huesped-card__avatar huesped-card__avatar--sm" aria-hidden="true">{iniciales(h.nombre)}</span>
                          <span>{h.nombre}</span>
                        </div>
                      </td>
                      <td>{estadoBadge(m)}</td>
                      <td className="hsp-num">{m.reservas ?? 0}</td>
                      <td className="hsp-num">{m.noches ?? 0}</td>
                      <td className="hsp-num">{moneda0.format(m.gasto_total || 0)}</td>
                      <td>{fechaCorta(m.ultima_visita) || "—"}</td>
                      <td>{fechaCorta(m.proxima_reserva) || "—"}</td>
                      <td className="hsp-tabla__contacto">{h.telefono || h.email || "—"}</td>
                      <td className="hsp-acc">
                        <button className="hsp-tabla__link" onClick={() => setModal({ modo: "editar", huesped: h })}>Editar</button>
                        {h.archivado ? (
                          <button className="hsp-tabla__link" onClick={() => desarchivar(h)} disabled={accionId === h.id}>Restaurar</button>
                        ) : (
                          <button className="hsp-tabla__link" onClick={() => archivar(h)} disabled={accionId === h.id}>Archivar</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={!!modal}
        title={modal?.modo === "editar" ? "Editar huésped" : "Nuevo huésped"}
        onClose={() => setModal(null)}
      >
        {modal && (
          <HuespedForm
            huesped={modal.huesped}
            onGuardado={alGuardar}
            onCancelar={() => setModal(null)}
          />
        )}
      </Modal>
    </div>
  );
}
