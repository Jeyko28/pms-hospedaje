import { useMemo, useState } from "react";
import Field from "../../components/Field";
import Button from "../../components/Button";
import SelectorHuesped from "./SelectorHuesped";
import { api } from "../../api/client";
import { ymdLocal } from "../../utils/fechas";
import "./NuevaReservaForm.css";

/**
 * NuevaReservaForm — formulario para crear una reserva (una habitación).
 *
 * La habitación se determina por el contexto:
 *  - Desde el CALENDARIO (iniciales.habitacion_id presente): queda FIJA y se
 *    muestra solo en lectura ("Habitación seleccionada"). El flujo natural es
 *    calendario → habitación → reserva.
 *  - Desde la PÁGINA DE RESERVAS (sin preselección): se elige con un <select>
 *    simple, y se ofrece un enlace para elegirla visualmente en el calendario.
 *
 * Props:
 *   huespedes, habitaciones: listas para los selectores
 *   iniciales: valores precargados (calendario): habitacion_id, fecha_entrada, fecha_salida
 *   onCreada, onCancelar, onHuespedCreado
 *   onIrCalendario: (opcional) si se pasa, muestra el enlace "elígela en el calendario"
 */
export default function NuevaReservaForm({
  huespedes,
  habitaciones,
  iniciales = {},
  onCreada,
  onCancelar,
  onHuespedCreado,
  onIrCalendario,
}) {
  const hoy = ymdLocal();
  // La habitación viene FIJA cuando se crea desde una celda del calendario.
  const habitacionFija = iniciales.habitacion_id != null;

  const [form, setForm] = useState({
    huesped_id: "",
    habitacion_id: iniciales.habitacion_id ? Number(iniciales.habitacion_id) : "",
    fecha_entrada: iniciales.fecha_entrada || hoy,
    fecha_salida: iniciales.fecha_salida || "",
    notas: "",
  });
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const set = (campo) => (e) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  const habSel = useMemo(
    () => habitaciones.find((h) => Number(h.id) === Number(form.habitacion_id)) || null,
    [habitaciones, form.habitacion_id]
  );

  const formatoMoneda = new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  });

  // Noches y total estimado en vivo (feedback inmediato).
  const estimado = useMemo(() => {
    if (!habSel || !form.fecha_entrada || !form.fecha_salida) return null;
    const e = new Date(form.fecha_entrada);
    const s = new Date(form.fecha_salida);
    const noches = Math.round((s - e) / (1000 * 60 * 60 * 24));
    if (noches <= 0) return null;
    return { noches, total: noches * habSel.precio_base };
  }, [habSel, form.fecha_entrada, form.fecha_salida]);

  function validar() {
    const e = {};
    if (!form.huesped_id) e.huesped_id = "Selecciona un huesped.";
    if (!form.habitacion_id) e.habitacion_id = "Selecciona una habitacion.";
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
      await api.crearReserva({
        huesped_id: Number(form.huesped_id),
        habitacion_id: Number(form.habitacion_id),
        fecha_entrada: form.fecha_entrada,
        fecha_salida: form.fecha_salida,
        notas: form.notas,
      });
      onCreada();
    } catch (err) {
      // Errores de negocio del backend (ej. habitacion no disponible).
      setErrorGeneral(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="reserva-form" onSubmit={enviar} noValidate>
      <Field id="huesped" label="Huesped" required error={errores.huesped_id}>
        <SelectorHuesped
          huespedes={huespedes}
          value={form.huesped_id}
          onChange={(id) => setForm((f) => ({ ...f, huesped_id: id }))}
          onHuespedCreado={onHuespedCreado}
        />
      </Field>

      {/* Habitación: fija (calendario) en solo lectura, o select (página Reservas). */}
      {habitacionFija ? (
        <Field id="habitacion" label="Habitación seleccionada">
          <div className="reserva-form__hab-sel" id="habitacion">
            <span className="reserva-form__hab-sel-nom">
              Hab. {habSel ? habSel.numero : iniciales.habitacion_id}
              {habSel ? ` · ${habSel.tipo}` : ""}
            </span>
            {habSel && (
              <span className="reserva-form__hab-sel-precio">
                {formatoMoneda.format(habSel.precio_base)}/noche
              </span>
            )}
          </div>
        </Field>
      ) : (
        <Field id="habitacion" label="Habitación" required error={errores.habitacion_id}>
          <select
            id="habitacion"
            value={form.habitacion_id}
            onChange={set("habitacion_id")}
            aria-invalid={!!errores.habitacion_id}
          >
            <option value="">Elige una habitación…</option>
            {habitaciones.map((h) => (
              <option key={h.id} value={h.id}>
                Hab. {h.numero} · {h.tipo} — {formatoMoneda.format(h.precio_base)}/noche
              </option>
            ))}
          </select>
          {onIrCalendario && (
            <button
              type="button"
              className="reserva-form__cal-link"
              onClick={onIrCalendario}
            >
              o elígela en el calendario →
            </button>
          )}
        </Field>
      )}

      <div className="reserva-form__fechas">
        <Field id="entrada" label="Fecha de entrada" required error={errores.fecha_entrada}>
          <input
            id="entrada"
            type="date"
            value={form.fecha_entrada}
            min={hoy}
            onChange={set("fecha_entrada")}
            aria-invalid={!!errores.fecha_entrada}
          />
        </Field>

        <Field id="salida" label="Fecha de salida" required error={errores.fecha_salida}>
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
          {guardando ? "Guardando…" : "Crear reserva"}
        </Button>
      </div>
    </form>
  );
}
