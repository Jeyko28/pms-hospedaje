import { useMemo, useState } from "react";
import Field from "../../components/Field";
import Button from "../../components/Button";
import SelectorHuesped from "./SelectorHuesped";
import { api } from "../../api/client";
import { ymdLocal } from "../../utils/fechas";
import "./NuevaReservaForm.css";

/**
 * NuevaReservaForm — formulario para crear una reserva.
 *
 * Decisiones de UX:
 *  - Las fechas usan <input type="date"> (date-picker nativo): elimina el
 *    teclear "YYYY-MM-DD" a mano, que era el mayor problema de la app vieja
 *    (heuristica de Nielsen: prevencion de errores).
 *  - Validamos en cliente ANTES de enviar y mostramos el error junto al campo.
 *  - El boton se deshabilita mientras se guarda (evita doble envio).
 *
 * Props:
 *   huespedes:       lista para el selector
 *   habitaciones:    lista para el selector
 *   iniciales:       valores precargados (ej. al crear desde el calendario:
 *                    habitacion_id, fecha_entrada, fecha_salida)
 *   onCreada:        callback tras crear con exito (para refrescar la lista)
 *   onCancelar:      cierra el formulario
 *   onHuespedCreado: aviso para refrescar la lista maestra de huespedes
 */
export default function NuevaReservaForm({
  huespedes,
  habitaciones,
  iniciales = {},
  onCreada,
  onCancelar,
  onHuespedCreado,
}) {
  const hoy = ymdLocal();

  const [form, setForm] = useState({
    huesped_id: "",
    // Multi-habitación: lista de ids (números). Permite reservar varias a la vez
    // (familias/grupos). Una sola = reserva individual (retrocompatible).
    habitacion_ids: iniciales.habitacion_id ? [Number(iniciales.habitacion_id)] : [],
    fecha_entrada: iniciales.fecha_entrada || hoy,
    fecha_salida: iniciales.fecha_salida || "",
    notas: "",
  });
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const set = (campo) => (e) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  function toggleHabitacion(id) {
    const num = Number(id);
    setForm((f) => {
      const ya = f.habitacion_ids.includes(num);
      return {
        ...f,
        habitacion_ids: ya
          ? f.habitacion_ids.filter((x) => x !== num)
          : [...f.habitacion_ids, num],
      };
    });
  }

  // Calcula noches y total estimado en vivo (suma de todas las habitaciones
  // seleccionadas) para feedback inmediato.
  const estimado = useMemo(() => {
    if (!form.habitacion_ids.length || !form.fecha_entrada || !form.fecha_salida)
      return null;
    const e = new Date(form.fecha_entrada);
    const s = new Date(form.fecha_salida);
    const noches = Math.round((s - e) / (1000 * 60 * 60 * 24));
    if (noches <= 0) return null;
    const precio = form.habitacion_ids.reduce((acc, id) => {
      const hab = habitaciones.find((h) => Number(h.id) === id);
      return acc + (hab ? hab.precio_base : 0);
    }, 0);
    return { noches, total: noches * precio, n: form.habitacion_ids.length };
  }, [form.habitacion_ids, form.fecha_entrada, form.fecha_salida, habitaciones]);

  function validar() {
    const e = {};
    if (!form.huesped_id) e.huesped_id = "Selecciona un huesped.";
    if (!form.habitacion_ids.length) e.habitacion_id = "Selecciona al menos una habitacion.";
    if (!form.fecha_entrada) e.fecha_entrada = "Indica la fecha de entrada.";
    if (!form.fecha_salida) e.fecha_salida = "Indica la fecha de salida.";
    if (
      form.fecha_entrada &&
      form.fecha_salida &&
      new Date(form.fecha_salida) <= new Date(form.fecha_entrada)
    ) {
      e.fecha_salida = "La salida debe ser posterior a la entrada.";
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
      if (form.habitacion_ids.length === 1) {
        // Camino individual (endpoint clásico, retrocompatible).
        await api.crearReserva({
          huesped_id: Number(form.huesped_id),
          habitacion_id: form.habitacion_ids[0],
          fecha_entrada: form.fecha_entrada,
          fecha_salida: form.fecha_salida,
          notas: form.notas,
        });
      } else {
        // Reserva de grupo: varias habitaciones en una operación.
        await api.crearReservaGrupo({
          huesped_id: Number(form.huesped_id),
          habitacion_ids: form.habitacion_ids,
          fecha_entrada: form.fecha_entrada,
          fecha_salida: form.fecha_salida,
          notas: form.notas,
        });
      }
      onCreada();
    } catch (err) {
      // Errores de negocio del backend (ej. habitacion no disponible).
      setErrorGeneral(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const formatoMoneda = new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  });

  return (
    <form className="reserva-form" onSubmit={enviar} noValidate>
      <Field
        id="huesped"
        label="Huesped"
        required
        error={errores.huesped_id}
      >
        <SelectorHuesped
          huespedes={huespedes}
          value={form.huesped_id}
          onChange={(id) => setForm((f) => ({ ...f, huesped_id: id }))}
          onHuespedCreado={onHuespedCreado}
        />
      </Field>

      <Field
        id="habitacion"
        label={
          form.habitacion_ids.length > 1
            ? `Habitaciones (${form.habitacion_ids.length} seleccionadas)`
            : "Habitacion(es)"
        }
        required
        error={errores.habitacion_id}
        hint="Marca una o varias (reserva de grupo)"
      >
        <div className="reserva-form__habs" role="group" aria-label="Habitaciones">
          {habitaciones.map((h) => {
            const sel = form.habitacion_ids.includes(Number(h.id));
            return (
              <label
                key={h.id}
                className={`reserva-form__hab${sel ? " reserva-form__hab--sel" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={sel}
                  onChange={() => toggleHabitacion(h.id)}
                />
                <span className="reserva-form__hab-txt">
                  Hab. {h.numero} — {h.tipo}
                </span>
                <span className="reserva-form__hab-precio">
                  {formatoMoneda.format(h.precio_base)}/noche
                </span>
              </label>
            );
          })}
        </div>
      </Field>

      <div className="reserva-form__fechas">
        <Field
          id="entrada"
          label="Fecha de entrada"
          required
          error={errores.fecha_entrada}
        >
          <input
            id="entrada"
            type="date"
            value={form.fecha_entrada}
            min={hoy}
            onChange={set("fecha_entrada")}
            aria-invalid={!!errores.fecha_entrada}
          />
        </Field>

        <Field
          id="salida"
          label="Fecha de salida"
          required
          error={errores.fecha_salida}
        >
          <input
            id="salida"
            type="date"
            value={form.fecha_salida}
            min={form.fecha_entrada || hoy}
            onChange={set("fecha_salida")}
            aria-invalid={!!errores.fecha_salida}
          />
        </Field>
      </div>

      <Field id="notas" label="Notas (opcional)">
        <input
          id="notas"
          type="text"
          value={form.notas}
          onChange={set("notas")}
          placeholder="Ej. llegada tarde, cama extra…"
        />
      </Field>

      {/* Estimacion en vivo: el usuario ve el costo antes de confirmar. */}
      {estimado && (
        <p className="reserva-form__estimado">
          {estimado.n > 1 ? `${estimado.n} habitaciones · ` : ""}
          {estimado.noches} {estimado.noches === 1 ? "noche" : "noches"} ·
          Total estimado <strong>{formatoMoneda.format(estimado.total)}</strong>
        </p>
      )}

      {errorGeneral && (
        <p className="reserva-form__error" role="alert">
          {errorGeneral}
        </p>
      )}

      <div className="reserva-form__acciones">
        <Button type="button" variant="secondary" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={guardando}>
          {guardando
            ? "Guardando…"
            : form.habitacion_ids.length > 1
            ? `Crear ${form.habitacion_ids.length} reservas`
            : "Crear reserva"}
        </Button>
      </div>
    </form>
  );
}
