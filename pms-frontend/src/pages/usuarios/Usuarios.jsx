import { useState } from "react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../auth/AuthContext";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import StateMessage from "../../components/StateMessage";
import { useToast } from "../../components/Toast";
import UsuarioForm from "./UsuarioForm";
import "../entidades.css";

export default function Usuarios() {
  const usuarios = useApi(api.usuarios);
  const { usuario: yo } = useAuth();
  const toast = useToast();
  const [modal, setModal] = useState(null); // null | {modo, usuario}
  const [borrandoId, setBorrandoId] = useState(null);

  function alGuardar() {
    const creado = modal?.modo === "crear";
    setModal(null);
    usuarios.recargar();
    toast.success(creado ? "Usuario creado." : "Usuario actualizado.");
  }

  async function eliminar(u) {
    if (!window.confirm(`Eliminar al usuario "${u.nombre}"?`)) return;
    setBorrandoId(u.id);
    try {
      await api.eliminarUsuario(u.id);
      toast.success(`Usuario "${u.nombre}" eliminado.`);
      usuarios.recargar();
    } catch (e) {
      toast.error(e.message || "No se pudo eliminar el usuario.");
    } finally {
      setBorrandoId(null);
    }
  }

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
        <Button icon="+" onClick={() => setModal({ modo: "crear", usuario: null })}>
          Nuevo usuario
        </Button>
      </header>

      {usuarios.loading && (
        <Card>
          <StateMessage variant="loading" title="Cargando usuarios…" />
        </Card>
      )}

      {usuarios.error && (
        <Card>
          <StateMessage
            variant="error"
            title="No se pudieron cargar los usuarios"
            message={usuarios.error}
            action={
              <Button variant="secondary" onClick={usuarios.recargar}>
                Reintentar
              </Button>
            }
          />
        </Card>
      )}

      {usuarios.data && usuarios.data.length > 0 && (
        <div className="entidad__grid">
          {usuarios.data.map((u) => (
            <Card key={u.id} padding="sm" className="entidad-card">
              <div className="huesped-card__head">
                <span className="huesped-card__avatar" aria-hidden="true">
                  {iniciales(u.nombre)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <span className="entidad-card__titulo">{u.nombre}</span>
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                    @{u.usuario}
                  </div>
                </div>
              </div>

              <div className="entidad-card__badges">
                {u.rol === "admin" ? (
                  <Badge tone="info" icon="★">
                    Administrador
                  </Badge>
                ) : (
                  <Badge tone="neutral" icon="•">
                    Recepción
                  </Badge>
                )}
                {u.activo ? (
                  <Badge tone="success" icon="✓">
                    Activo
                  </Badge>
                ) : (
                  <Badge tone="warning" icon="!">
                    Inactivo
                  </Badge>
                )}
                {u.id === yo?.id && (
                  <Badge tone="neutral" icon="●">
                    Tú
                  </Badge>
                )}
              </div>

              <div className="entidad-card__acciones">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setModal({ modo: "editar", usuario: u })}
                >
                  Editar
                </Button>
                {/* No mostrar "Eliminar" sobre uno mismo. */}
                {u.id !== yo?.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => eliminar(u)}
                    disabled={borrandoId === u.id}
                  >
                    {borrandoId === u.id ? "Eliminando…" : "Eliminar"}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!modal}
        title={modal?.modo === "editar" ? "Editar usuario" : "Nuevo usuario"}
        onClose={() => setModal(null)}
      >
        {modal && (
          <UsuarioForm
            usuario={modal.usuario}
            onGuardado={alGuardar}
            onCancelar={() => setModal(null)}
          />
        )}
      </Modal>
    </div>
  );
}
