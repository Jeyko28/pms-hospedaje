import { useState } from "react";
import Field from "../../components/Field";
import Button from "../../components/Button";
import { api } from "../../api/client";

/**
 * HospedajeForm — alta y edición de un hospedaje (cliente del SaaS).
 *
 * En CREAR: pide los datos del hospedaje + el usuario administrador inicial
 * (para que el cliente pueda entrar). En EDITAR: solo datos del hospedaje
 * (plan, estado, vencimiento); no se tocan sus usuarios desde aquí.
 *
 * Props: hospedaje (o null para crear), onGuardado, onCancelar
 */
export default function HospedajeForm({ hospedaje, onGuardado, onCancelar }) {
  const esEdicion = !!hospedaje;
  const [form, setForm] = useState({
    nombre: hospedaje?.nombre ?? "",
    plan: hospedaje?.plan ?? "trial",
    estado: hospedaje?.estado ?? "activo",
    fecha_expira: (hospedaje?.fecha_expira ?? "").slice(0, 10),
    admin_usuario: "",
    admin_nombre: "",
    admin_password: "",
  });
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const set = (campo) => (e) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  function validar() {
    const e = {};
    if (!form.nombre.trim()) e.nombre = "Indica el nombre del hospedaje.";
    if (!esEdicion) {
      if (!form.admin_usuario.trim()) e.admin_usuario = "Indica el usuario del admin.";
      if (!form.admin_nombre.trim()) e.admin_nombre = "Indica el nombre del admin.";
      if (form.admin_password.length < 6) e.admin_password = "Mínimo 6 caracteres.";
    }
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
        await api.editarHospedaje(hospedaje.id, {
          nombre: form.nombre.trim(),
          plan: form.plan,
          estado: form.estado,
          fecha_expira: form.fecha_expira,
        });
      } else {
        await api.crearHospedaje({
          nombre: form.nombre.trim(),
          plan: form.plan,
          estado: form.estado,
          fecha_expira: form.fecha_expira,
          admin_usuario: form.admin_usuario.trim(),
          admin_nombre: form.admin_nombre.trim(),
          admin_password: form.admin_password,
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
      <Field id="nombre" label="Nombre del hospedaje" required error={errores.nombre}>
        <input
          id="nombre"
          type="text"
          value={form.nombre}
          onChange={set("nombre")}
          placeholder="Ej. Hotel Sol y Mar"
          aria-invalid={!!errores.nombre}
        />
      </Field>

      <div className="entidad-form__fila">
        <Field id="plan" label="Plan">
          <select id="plan" value={form.plan} onChange={set("plan")}>
            <option value="trial">Prueba (trial)</option>
            <option value="inicia">Inicia</option>
            <option value="crece">Crece</option>
            <option value="pro">Pro</option>
          </select>
        </Field>

        <Field id="estado" label="Estado">
          <select id="estado" value={form.estado} onChange={set("estado")}>
            <option value="prueba">En prueba</option>
            <option value="activo">Activo</option>
            <option value="suspendido">Suspendido</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </Field>
      </div>

      <Field
        id="fecha_expira"
        label="Vence el (opcional)"
        hint="Fecha en que termina la suscripción o la prueba."
      >
        <input
          id="fecha_expira"
          type="date"
          value={form.fecha_expira}
          onChange={set("fecha_expira")}
        />
      </Field>

      {/* Solo al crear: datos del usuario administrador del nuevo cliente. */}
      {!esEdicion && (
        <>
          <p className="entidad-form__seccion">Usuario administrador del cliente</p>
          <div className="entidad-form__fila">
            <Field id="admin_usuario" label="Usuario" required error={errores.admin_usuario}>
              <input
                id="admin_usuario"
                type="text"
                value={form.admin_usuario}
                onChange={set("admin_usuario")}
                autoComplete="off"
                aria-invalid={!!errores.admin_usuario}
              />
            </Field>
            <Field id="admin_nombre" label="Nombre" required error={errores.admin_nombre}>
              <input
                id="admin_nombre"
                type="text"
                value={form.admin_nombre}
                onChange={set("admin_nombre")}
                aria-invalid={!!errores.admin_nombre}
              />
            </Field>
          </div>
          <Field
            id="admin_password"
            label="Contraseña inicial"
            required
            error={errores.admin_password}
            hint="El cliente podrá cambiarla luego. Mínimo 6 caracteres."
          >
            <input
              id="admin_password"
              type="text"
              value={form.admin_password}
              onChange={set("admin_password")}
              autoComplete="new-password"
              aria-invalid={!!errores.admin_password}
            />
          </Field>
        </>
      )}

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
          {guardando ? "Guardando…" : esEdicion ? "Guardar cambios" : "Crear hospedaje"}
        </Button>
      </div>
    </form>
  );
}
