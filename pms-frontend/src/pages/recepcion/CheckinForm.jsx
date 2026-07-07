import { nfMoneda } from "../../utils/moneda";
import { useMemo, useState } from "react";
import Field from "../../components/Field";
import Button from "../../components/Button";
import { api } from "../../api/client";
import { ymdLocal } from "../../utils/fechas";
import "./CheckinForm.css";

const formatoMoneda = nfMoneda({
  style: "currency",
  currency: "PEN",
});

function noches(desde, hasta) {
  const a = new Date(desde + "T00:00:00");
  const b = new Date(hasta + "T00:00:00");
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}
const fmt = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? iso : d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
};

/**
 * CheckinForm — confirma el check-in eligiendo la FECHA REAL de entrada.
 *
 * El cobro se calcula por NOCHES REALES (entrada real -> salida reservada) x
 * precio/noche, no por lo reservado: así un check-in adelantado o atrasado se
 * cobra correcto. Muestra en vivo lo reservado vs. lo real y el total.
 *
 * Props:
 *   reserva:        { id, fecha_entrada, fecha_salida, total }
 *   onCheckinHecho: callback tras el check-in (refresca la vista)
 *   onCancelar:     cierra el formulario
 */
export default function CheckinForm({ reserva, onCheckinHecho, onCancelar }) {
  const hoy = ymdLocal();
  // Fecha máxima = la noche anterior a la salida (al menos 1 noche).
  const maxFecha = useMemo(() => {
    const d = new Date(reserva.fecha_salida + "T00:00:00");
    d.setDate(d.getDate() - 1);
    return ymdLocal(d);
  }, [reserva.fecha_salida]);

  const [fecha, setFecha] = useState(hoy <= maxFecha ? hoy : reserva.fecha_entrada);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const nochesReservadas = noches(reserva.fecha_entrada, reserva.fecha_salida);
  const precioNoche = nochesReservadas > 0 ? (reserva.total || 0) / nochesReservadas : 0;

  const calc = useMemo(() => {
    const n = noches(fecha, reserva.fecha_salida);
    return { noches: n, total: n > 0 ? Math.round(n * precioNoche * 100) / 100 : 0, valido: n > 0 };
  }, [fecha, reserva.fecha_salida, precioNoche]);

  const difiere = fecha !== reserva.fecha_entrada;

  async function confirmar(ev) {
    ev.preventDefault();
    if (!calc.valido) {
      setError("La fecha de entrada debe ser anterior a la de salida.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await api.checkin(reserva.id, fecha);
      onCheckinHecho();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="checkin-form" onSubmit={confirmar} noValidate>
      <Field id="fecha-entrada-real" label="Fecha de entrada (real)" required>
        <input
          id="fecha-entrada-real"
          type="date"
          value={fecha}
          max={maxFecha}
          onChange={(e) => setFecha(e.target.value)}
        />
      </Field>

      <div className="checkin-form__resumen">
        <div className="checkin-form__linea">
          <span>Reservó</span>
          <span>{fmt(reserva.fecha_entrada)} → {fmt(reserva.fecha_salida)} · {nochesReservadas} noche(s)</span>
        </div>
        <div className={"checkin-form__linea" + (difiere ? " checkin-form__linea--alerta" : "")}>
          <span>Real</span>
          <span>{fmt(fecha)} → {fmt(reserva.fecha_salida)} · {calc.noches} noche(s)</span>
        </div>
        <div className="checkin-form__total">
          <span>Total a cobrar</span>
          <strong>{formatoMoneda.format(calc.total)}</strong>
        </div>
        {difiere && calc.valido && (
          <p className="checkin-form__nota">
            La entrada real no coincide con la reservada: se cobrará por {calc.noches} noche(s).
          </p>
        )}
      </div>

      {error && (
        <p className="checkin-form__error" role="alert">{error}</p>
      )}

      <div className="checkin-form__acciones">
        <Button type="button" variant="secondary" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={guardando || !calc.valido}>
          {guardando ? "Procesando…" : "Confirmar check-in"}
        </Button>
      </div>
    </form>
  );
}
