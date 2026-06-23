import { useMemo, useState } from "react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Modal from "../../components/Modal";
import StateMessage from "../../components/StateMessage";
import Field from "../../components/Field";
import { useToast } from "../../components/Toast";
import HuespedForm from "./HuespedForm";
import "../entidades.css";

export default function Huespedes() {
  const huespedes = useApi(api.huespedes);
  const toast = useToast();
  const [modal, setModal] = useState(null); // null | {modo, huesped}
  const [borrandoId, setBorrandoId] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  const filtrados = useMemo(() => {
    if (!huespedes.data) return [];
    const t = busqueda.trim().toLowerCase();
    if (!t) return huespedes.data;
    return huespedes.data.filter(
      (h) =>
        h.nombre.toLowerCase().includes(t) ||
        (h.email || "").toLowerCase().includes(t) ||
        (h.documento || "").toLowerCase().includes(t) ||
        (h.telefono || "").toLowerCase().includes(t)
    );
  }, [huespedes.data, busqueda]);

  function alGuardar() {
    const creado = modal?.modo === "crear";
    setModal(null);
    huespedes.recargar();
    toast.success(creado ? "Huésped registrado." : "Huésped actualizado.");
  }

  async function eliminar(h) {
    if (!window.confirm(`Eliminar a ${h.nombre}?`)) return;
    setBorrandoId(h.id);
    try {
      await api.eliminarHuesped(h.id);
      toast.success(`${h.nombre} eliminado.`);
      huespedes.recargar();
    } catch (e) {
      toast.error(e.message || "No se pudo eliminar el huésped.");
    } finally {
      setBorrandoId(null);
    }
  }

  // Iniciales para el avatar (apoyo visual, no sustituye al nombre).
  const iniciales = (nombre) =>
    nombre
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join("");

  return (
    <div className="entidad">
      <header className="entidad__head">
        <div>
          <h1>Huéspedes</h1>
          <p className="entidad__subtitle">
            Tu directorio de huéspedes registrados.
          </p>
        </div>
        <Button icon="+" onClick={() => setModal({ modo: "crear", huesped: null })}>
          Nuevo huésped
        </Button>
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
        <Card>
          <StateMessage variant="loading" title="Cargando huéspedes…" />
        </Card>
      )}

      {huespedes.error && (
        <Card>
          <StateMessage
            variant="error"
            title="No se pudieron cargar los huéspedes"
            message={huespedes.error}
            action={
              <Button variant="secondary" onClick={huespedes.recargar}>
                Reintentar
              </Button>
            }
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

      {filtrados.length > 0 && (
        <div className="entidad__grid">
          {filtrados.map((h) => (
            <Card key={h.id} padding="sm" className="entidad-card">
              <div className="huesped-card__head">
                <span className="huesped-card__avatar" aria-hidden="true">
                  {iniciales(h.nombre)}
                </span>
                <span className="entidad-card__titulo">{h.nombre}</span>
              </div>
              <ul className="huesped-card__datos">
                {h.email && (
                  <li>
                    <span aria-hidden="true">✉️</span> {h.email}
                  </li>
                )}
                {h.telefono && (
                  <li>
                    <span aria-hidden="true">📞</span> {h.telefono}
                  </li>
                )}
                {h.documento && (
                  <li>
                    <span aria-hidden="true">🪪</span> {h.documento}
                  </li>
                )}
                {!h.email && !h.telefono && !h.documento && (
                  <li className="huesped-card__sin-datos">Sin datos de contacto</li>
                )}
              </ul>
              <div className="entidad-card__acciones">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setModal({ modo: "editar", huesped: h })}
                >
                  Editar
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
          ))}
        </div>
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
