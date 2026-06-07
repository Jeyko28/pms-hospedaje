import { useState } from "react";
import Field from "../../components/Field";
import Button from "../../components/Button";
import { api } from "../../api/client";

/**
 * HabitacionForm — alta y edicion de una habitacion.
 *
 * Sirve para los dos casos: si recibe `habitacion`, edita; si no, crea.
 * Reutilizar el mismo formulario mantiene consistencia (misma validacion,
 * mismos campos) y reduce codigo.
 *
 * Props:
 *   habitacion: objeto a editar (o null para crear)
 *   onGuardada: callback tras exito
 *   onCancelar: cierra el formulario
 */
const TIPOS = ["Individual", "Doble", "Triple", "Suite", "Familiar"];
const LIMPIEZA = ["Limpia", "Sucia", "Revisión"];
const OCUPACION = ["disponible", "ocupada", "mantenimiento"];

export default function HabitacionForm({ habitacion, onGuardada, onCancelar }) {
  const esEdicion = !!habitacion;
  const [form, setForm] = useState({
    numero: habitacion?.numero ?? "",
    tipo: habitacion?.tipo ?? "Individual",
    precio_base: habitacion?.precio_base ?? "",
    estado_limpieza: habitacion?.estado_limpieza ?? "Limpia",
    estado: habitacion?.estado ?? "disponible",
  });
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const set = (campo) => (e) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  function validar() {
    const e = {};
    if (!form.numero.trim()) e.numero = "Indica el numero de habitacion.";
    if (!form.tipo.trim()) e.tipo = "Selecciona un tipo.";
    const precio = Number(form.precio_base);
    if (form.precio_base === "" || isNaN(precio) || precio < 0)
      e.precio_base = "Indica un precio valido (mayor o igual a 0).";
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  async function enviar(ev) {
    ev.preventDefault();
    setErrorGeneral(null);
    if (!validar()) return;
    setGuardando(true);
    const payload = {
      numero: form.numero.trim(),
      tipo: form.tipo.trim(),
      precio_base: Number(form.precio_base),
      estado_limpieza: form.estado_limpieza,
      estado: form.estado,
    };
    try {
      if (esEdicion) {
        await api.editarHabitacion(habitacion.id, payload);
      } else {
        await api.crearHabitacion(payload);
      }
      onGuardada();
    } catch (err) {
      setErrorGeneral(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="entidad-form" onSubmit={enviar} noValidate>
      <div className="entidad-form__fila">
        <Field id="numero" label="Numero" required error={errores.numero}>
          <input
            id="numero"
            type="text"
            value={form.numero}
            onChange={set("numero")}
            placeholder="Ej. 101"
            aria-invalid={!!errores.numero}
          />
        </Field>

        <Field id="tipo" label="Tipo" required error={errores.tipo}>
          <select id="tipo" value={form.tipo} onChange={set("tipo")}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        id="precio"
        label="Precio por noche (S/)"
        required
        error={errores.precio_base}
      >
        <input
          id="precio"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={form.precio_base}
          onChange={set("precio_base")}
          placeholder="Ej. 65.00"
          aria-invalid={!!errores.precio_base}
        />
      </Field>

      <div className="entidad-form__fila">
        <Field id="limpieza" label="Estado de limpieza">
          <select
            id="limpieza"
            value={form.estado_limpieza}
            onChange={set("estado_limpieza")}
          >
            {LIMPIEZA.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>

        <Field id="ocupacion" label="Estado de ocupacion">
          <select id="ocupacion" value={form.estado} onChange={set("estado")}>
            {OCUPACION.map((o) => (
              <option key={o} value={o}>
                {o.charAt(0).toUpperCase() + o.slice(1)}
              </option>
            ))}
          </select>
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
          {guardando ? "Guardando…" : esEdicion ? "Guardar cambios" : "Crear habitacion"}
        </Button>
      </div>
    </form>
  );
}
