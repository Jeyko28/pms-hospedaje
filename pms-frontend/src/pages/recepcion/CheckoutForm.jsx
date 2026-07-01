import { useMemo, useState } from "react";
import Field from "../../components/Field";
import Button from "../../components/Button";
import { api } from "../../api/client";
import { ymdLocal } from "../../utils/fechas";
import "./CheckinForm.css";

const formatoMoneda = new Intl.NumberFormat("es-PE", {
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
 * CheckoutForm — cierra una estancia eligiendo la FECHA REAL de salida.
 *
 * El cobro final se recalcula por las NOCHES REALES (entrada real -> salida
 * real) x precio: si el huésped se va antes cobra menos (puede quedar saldo a
 * favor); si se extiende, cobra más. Muestra en vivo lo facturado vs. lo real.
 *
 * Props:
 *   estanciaId, fechaCheckin, fechaSalidaEsperada, totalFacturado, saldo
 *   onCheckoutHecho: callback tras cerrar (refresca la vista)
 *   onAjuste:        callback si el total se ajustó pero falta cobrar (refresca saldo)
 *   onCancelar:      cierra el formulario
 */
export default function CheckoutForm({
  estanciaId,
  fechaCheckin,
  fechaSalidaEsperada,
  precioNoche = 0,
  pagado = 0,
  consumosTotal = 0,
  onCheckoutHecho,
  onAjuste,
  onCancelar,
}) {
  const hoy = ymdLocal();
  const minFecha = useMemo(() => {
    const d = new Date(fechaCheckin + "T00:00:00");
    d.setDate(d.getDate() + 1); // al menos 1 noche
    return ymdLocal(d);
  }, [fechaCheckin]);

  const [fecha, setFecha] = useState(hoy >= minFecha ? hoy : minFecha);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  // Base: precio REAL de la habitación (igual que el backend). Antes se derivaba
  // de total/noches, lo que daba un precio inflado si la factura ya fue recalculada.
  const nochesReservadas = noches(fechaCheckin, fechaSalidaEsperada);
  const totalReservado = Math.round(nochesReservadas * precioNoche * 100) / 100;

  const calc = useMemo(() => {
    const n = noches(fechaCheckin, fecha);
    const total = n > 0 ? Math.round(n * precioNoche * 100) / 100 : 0;
    // El saldo se compara contra el total CON consumos (igual que el backend
    // `total_con_consumos`): si no, lo pagado por consumos aparecería como
    // devolución falsa.
    const totalConConsumos = Math.round((total + consumosTotal) * 100) / 100;
    const saldoResultante = Math.round((totalConConsumos - pagado) * 100) / 100;
    return { noches: n, total, totalConConsumos, saldoResultante, valido: n > 0 };
  }, [fecha, fechaCheckin, precioNoche, pagado, consumosTotal]);

  const difiere = fecha !== fechaSalidaEsperada;

  async function confirmar(ev) {
    ev.preventDefault();
    if (!calc.valido) {
      setError("La fecha de salida debe ser posterior a la de entrada.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await api.checkout(estanciaId, fecha);
      onCheckoutHecho();
    } catch (e) {
      // 409 = el total se ajustó pero falta cobrar el saldo: avisa y refresca.
      setError(e.message);
      onAjuste?.();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="checkin-form" onSubmit={confirmar} noValidate>
      <Field id="fecha-salida-real" label="Fecha de salida (real)" required>
        <input
          id="fecha-salida-real"
          type="date"
          value={fecha}
          min={minFecha}
          onChange={(e) => setFecha(e.target.value)}
        />
      </Field>

      <div className="checkin-form__resumen">
        <div className="checkin-form__linea">
          <span>Reservado</span>
          <span>
            {fmt(fechaCheckin)} → {fmt(fechaSalidaEsperada)} · {nochesReservadas} noche(s) ·{" "}
            {formatoMoneda.format(totalReservado)}
          </span>
        </div>
        <div className={"checkin-form__linea" + (difiere ? " checkin-form__linea--alerta" : "")}>
          <span>Real</span>
          <span>{fmt(fechaCheckin)} → {fmt(fecha)} · {calc.noches} noche(s)</span>
        </div>
        {consumosTotal > 0 ? (
          <>
            <div className="checkin-form__linea">
              <span>Estadía real</span>
              <span>{formatoMoneda.format(calc.total)}</span>
            </div>
            <div className="checkin-form__linea">
              <span>Consumos</span>
              <span>{formatoMoneda.format(consumosTotal)}</span>
            </div>
            <div className="checkin-form__total">
              <span>Total a cobrar</span>
              <strong>{formatoMoneda.format(calc.totalConConsumos)}</strong>
            </div>
          </>
        ) : (
          <div className="checkin-form__total">
            <span>Total por estadía real</span>
            <strong>{formatoMoneda.format(calc.total)}</strong>
          </div>
        )}
        {calc.valido && calc.saldoResultante > 0 && (
          <p className="checkin-form__nota">
            Falta cobrar {formatoMoneda.format(calc.saldoResultante)}: regístralo en «Cobrar»
            antes de cerrar.
          </p>
        )}
        {calc.valido && calc.saldoResultante < 0 && (
          <p className="checkout-form__credito">
            A favor del huésped: {formatoMoneda.format(-calc.saldoResultante)} (devolución).
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
          {guardando ? "Procesando…" : "Confirmar check-out"}
        </Button>
      </div>
    </form>
  );
}
