import { useState } from "react";
import Field from "../../components/Field";
import Button from "../../components/Button";
import { api } from "../../api/client";

/**
 * HuespedForm — alta y edicion de un huesped.
 * Mismo patron que HabitacionForm: un solo formulario para crear y editar.
 *
 * Props:
 *   huesped:    objeto a editar (o null para crear)
 *   onGuardado: callback tras exito
 *   onCancelar: cierra el formulario
 */
export default function HuespedForm({ huesped, onGuardado, onCancelar }) {
  const esEdicion = !!huesped;
  const [form, setForm] = useState({
    nombre: huesped?.nombre ?? "",
    email: huesped?.email ?? "",
    telefono: huesped?.telefono ?? "",
    documento: huesped?.documento ?? "",
    direccion: huesped?.direccion ?? "",
  });
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const set = (campo) => (e) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  function validar() {
    const e = {};
    if (!form.nombre.trim()) e.nombre = "El nombre es obligatorio.";
    // Validacion suave de email: solo si escribieron algo.
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      e.email = "Escribe un correo valido.";
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  async function enviar(ev) {
    ev.preventDefault();
    setErrorGeneral(null);
    if (!validar()) return;
    setGuardando(true);
    const payload = {
      nombre: form.nombre.trim(),
      email: form.email.trim(),
      telefono: form.telefono.trim(),
      documento: form.documento.trim(),
      direccion: form.direccion.trim(),
    };
    try {
      if (esEdicion) {
        await api.editarHuesped(huesped.id, payload);
      } else {
        await api.crearHuesped(payload);
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
      <Field id="nombre" label="Nombre completo" required error={errores.nombre}>
        <input
          id="nombre"
          type="text"
          value={form.nombre}
          onChange={set("nombre")}
          placeholder="Ej. Juan Perez"
          aria-invalid={!!errores.nombre}
        />
      </Field>

      <div className="entidad-form__fila">
        <Field id="email" label="Correo (opcional)" error={errores.email}>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={set("email")}
            placeholder="correo@ejemplo.com"
            aria-invalid={!!errores.email}
          />
        </Field>

        <Field id="telefono" label="Teléfono (opcional)">
          <input
            id="telefono"
            type="tel"
            value={form.telefono}
            onChange={set("telefono")}
            placeholder="Ej. 999 888 777"
          />
        </Field>
      </div>

      <div className="entidad-form__fila">
        <Field id="documento" label="Documento (opcional)">
          <input
            id="documento"
            type="text"
            value={form.documento}
            onChange={set("documento")}
            placeholder="DNI / Pasaporte"
          />
        </Field>

        <Field id="direccion" label="Dirección (opcional)">
          <input
            id="direccion"
            type="text"
            value={form.direccion}
            onChange={set("direccion")}
            placeholder="Ciudad, calle…"
          />
        </Field>
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
          {guardando ? "Guardando…" : esEdicion ? "Guardar cambios" : "Crear huésped"}
        </Button>
      </div>
    </form>
  );
}
