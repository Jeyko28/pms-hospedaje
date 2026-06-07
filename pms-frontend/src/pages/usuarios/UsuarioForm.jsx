import { useState } from "react";
import Field from "../../components/Field";
import Button from "../../components/Button";
import { api } from "../../api/client";

/**
 * UsuarioForm — alta y edicion de un usuario del sistema.
 * En edicion, el campo usuario no se puede cambiar y la contrasena es
 * opcional (vacia = no se modifica).
 *
 * Props: usuario (o null para crear), onGuardado, onCancelar
 */
export default function UsuarioForm({ usuario, onGuardado, onCancelar }) {
  const esEdicion = !!usuario;
  const [form, setForm] = useState({
    usuario: usuario?.usuario ?? "",
    nombre: usuario?.nombre ?? "",
    password: "",
    rol: usuario?.rol ?? "recepcion",
    activo: usuario?.activo ?? true,
  });
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const set = (campo) => (e) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  function validar() {
    const e = {};
    if (!esEdicion && !form.usuario.trim())
      e.usuario = "Indica un nombre de usuario.";
    if (!form.nombre.trim()) e.nombre = "Indica el nombre.";
    // En alta la contrasena es obligatoria; en edicion solo si la escriben.
    if (!esEdicion && form.password.length < 6)
      e.password = "Mínimo 6 caracteres.";
    if (esEdicion && form.password && form.password.length < 6)
      e.password = "Mínimo 6 caracteres.";
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  async function enviar(ev) {
    ev.preventDefault();
    setErrorGeneral(null);
    if (!validar()) return;
    setGuardando(true);
    try {
      if (esEdicion) {
        await api.editarUsuario(usuario.id, {
          nombre: form.nombre.trim(),
          rol: form.rol,
          activo: !!form.activo,
          password: form.password, // vacio = no cambiar
        });
      } else {
        await api.crearUsuario({
          usuario: form.usuario.trim(),
          nombre: form.nombre.trim(),
          password: form.password,
          rol: form.rol,
        });
      }
      onGuardado();
    } catch (err) {
      setErrorGeneral(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="entidad-form" onSubmit={enviar} noValidate>
      <Field
        id="usuario"
        label="Usuario"
        required={!esEdicion}
        error={errores.usuario}
        hint={esEdicion ? "El nombre de usuario no se puede cambiar." : undefined}
      >
        <input
          id="usuario"
          type="text"
          value={form.usuario}
          onChange={set("usuario")}
          disabled={esEdicion}
          autoComplete="off"
          aria-invalid={!!errores.usuario}
        />
      </Field>

      <Field id="nombre" label="Nombre completo" required error={errores.nombre}>
        <input
          id="nombre"
          type="text"
          value={form.nombre}
          onChange={set("nombre")}
          aria-invalid={!!errores.nombre}
        />
      </Field>

      <Field
        id="password"
        label={esEdicion ? "Nueva contraseña (opcional)" : "Contraseña"}
        required={!esEdicion}
        error={errores.password}
        hint={esEdicion ? "Déjalo vacío para mantener la actual." : "Mínimo 6 caracteres."}
      >
        <input
          id="password"
          type="password"
          value={form.password}
          onChange={set("password")}
          autoComplete="new-password"
          aria-invalid={!!errores.password}
        />
      </Field>

      <div className="entidad-form__fila">
        <Field id="rol" label="Rol">
          <select id="rol" value={form.rol} onChange={set("rol")}>
            <option value="recepcion">Recepción</option>
            <option value="admin">Administrador</option>
          </select>
        </Field>

        {esEdicion && (
          <Field id="activo" label="Estado">
            <select
              id="activo"
              value={form.activo ? "1" : "0"}
              onChange={(e) =>
                setForm((f) => ({ ...f, activo: e.target.value === "1" }))
              }
            >
              <option value="1">Activo</option>
              <option value="0">Inactivo</option>
            </select>
          </Field>
        )}
      </div>

      {errorGeneral && (
        <p className="entidad-form__error" role="alert">
          {errorGeneral}
        </p>
      )}

      <div className="entidad-form__acciones">
        <Button type="button" variant="secondary" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : esEdicion ? "Guardar cambios" : "Crear usuario"}
        </Button>
      </div>
    </form>
  );
}
