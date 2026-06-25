import { useMemo, useState } from "react";
import Field from "../../components/Field";
import Button from "../../components/Button";
import { api } from "../../api/client";
import { ymdLocal } from "../../utils/fechas";
import "./PagoForm.css";
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
 * CobroEstanciaForm — cobra a un huésped alojado por su ESTADÍA REAL.
 *
 * El recepcionista elige la fecha real de salida; el monto se calcula por las
 * noches reales (entrada real → salida) × precio de la habitación, con el
 * desglose Reservado vs Real. Al cobrar: primero recalcula la factura (persiste
 * el total real) y luego registra el pago. El check-out queda como cierre limpio.
 *
 * Props:
 *   estanciaId, facturaId, fechaCheckin, fechaSalidaEsperada, precioNoche, pagado
 *   onCobrado: callback tras cobrar (refresca la vista)
 *   onCerrar:  cierra el formulario
 */
export default function CobroEstanciaForm({
  estanciaId,
  facturaId,
  fechaCheckin,
  fechaSalidaEsperada,
  precioNoche = 0,
  pagado = 0,
  onCobrado,
  onCerrar,
}) {
  const hoy = ymdLocal();
  const minFecha = useMemo(() => {
    const d = new Date(fechaCheckin + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return ymdLocal(d);
  }, [fechaCheckin]);

  // Por defecto: hoy si el huésped ya pasó su salida (se quedó de más), o la
  // fecha reservada si aún no llega a ella (cobro por adelantado del total).
  const fechaInicial = hoy >= fechaSalidaEsperada ? hoy : fechaSalidaEsperada;
  const [fecha, setFecha] = useState(fechaInicial >= minFecha ? fechaInicial : minFecha);

  const nochesReservadas = noches(fechaCheckin, fechaSalidaEsperada);
  const totalReservado = Math.round(nochesReservadas * precioNoche * 100) / 100;

  // Descuento / cortesía (opcional). Se descuenta del subtotal por noches reales.
  const [descuento, setDescuento] = useState("");
  const [descuentoMotivo, setDescuentoMotivo] = useState("");

  const calc = useMemo(() => {
    const n = noches(fechaCheckin, fecha);
    const subtotal = n > 0 ? Math.round(n * precioNoche * 100) / 100 : 0;
    const desc = Math.min(Math.max(0, Number(descuento) || 0), subtotal);
    const total = Math.round((subtotal - desc) * 100) / 100;
    const saldo = Math.round((total - pagado) * 100) / 100;
    return { noches: n, subtotal, descuento: desc, total, saldo, valido: n > 0 };
  }, [fecha, fechaCheckin, precioNoche, pagado, descuento]);

  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [referencia, setReferencia] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  // Monto sugerido = saldo a cobrar para la fecha elegida (se sincroniza).
  const sugerido = calc.saldo > 0 ? calc.saldo : 0;
  const montoEfectivo = monto === "" ? sugerido : Number(monto);

  const difiere = fecha !== fechaSalidaEsperada;

  async function cobrar(ev) {
    ev.preventDefault();
    setError(null);
    if (!calc.valido) {
      setError("La fecha de salida debe ser posterior a la de entrada.");
      return;
    }
    const valor = montoEfectivo;
    if (!valor || valor <= 0) {
      setError("No hay saldo por cobrar para esa fecha.");
      return;
    }
    if (valor > calc.saldo + 0.001) {
      setError(`El monto no puede superar el saldo (${formatoMoneda.format(calc.saldo)}).`);
      return;
    }
    setGuardando(true);
    try {
      // 1) Persistir la factura por la estadía real elegida (con descuento).
      await api.recalcularEstancia(estanciaId, fecha, calc.descuento, descuentoMotivo);
      // 2) Registrar el pago.
      await api.registrarPago({ factura_id: facturaId, monto: valor, metodo, referencia });
      onCobrado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="pago-form" onSubmit={cobrar} noValidate>
      <Field id="cobro-fecha-salida" label="Fecha de salida (real)" required>
        <input
          id="cobro-fecha-salida"
          type="date"
          value={fecha}
          min={minFecha}
          onChange={(e) => { setFecha(e.target.value); setMonto(""); }}
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
          <span>
            {fmt(fechaCheckin)} → {fmt(fecha)} · {calc.noches} noche(s) ·{" "}
            {formatoMoneda.format(calc.subtotal)}
          </span>
        </div>
        {calc.descuento > 0 && (
          <div className="checkin-form__linea">
            <span>Descuento</span>
            <span>− {formatoMoneda.format(calc.descuento)}</span>
          </div>
        )}
        <div className="checkin-form__total">
          <span>Total por estadía real</span>
          <strong>{formatoMoneda.format(calc.total)}</strong>
        </div>
        <div className="checkin-form__linea">
          <span>Ya pagado</span>
          <span>{formatoMoneda.format(pagado)}</span>
        </div>
        <div className="checkin-form__total">
          <span>Saldo a cobrar</span>
          <strong>{formatoMoneda.format(Math.max(0, calc.saldo))}</strong>
        </div>
      </div>

      <Field id="cobro-descuento" label="Descuento / cortesía (opcional, S/)">
        <input
          id="cobro-descuento"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={descuento}
          onChange={(e) => { setDescuento(e.target.value); setMonto(""); }}
          placeholder="0.00"
        />
      </Field>

      {calc.descuento > 0 && (
        <Field id="cobro-descuento-motivo" label="Motivo del descuento (opcional)">
          <input
            id="cobro-descuento-motivo"
            type="text"
            value={descuentoMotivo}
            onChange={(e) => setDescuentoMotivo(e.target.value)}
            placeholder="Ej. cliente frecuente, cortesía agencia"
          />
        </Field>
      )}

      <Field id="cobro-monto" label="Monto a cobrar" required>
        <input
          id="cobro-monto"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={monto === "" ? (sugerido || "") : monto}
          onChange={(e) => setMonto(e.target.value)}
        />
      </Field>

      <Field id="cobro-metodo" label="Método de pago" required>
        <select id="cobro-metodo" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="transferencia">Transferencia</option>
          <option value="yape">Yape</option>
          <option value="plin">Plin</option>
        </select>
      </Field>

      <Field id="cobro-ref" label="Referencia (opcional)">
        <input
          id="cobro-ref"
          type="text"
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
          placeholder="Ej. n.o de operación"
        />
      </Field>

      {error && <p className="pago-form__error" role="alert">{error}</p>}

      <div className="pago-form__acciones">
        <Button type="button" variant="secondary" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={guardando || calc.saldo <= 0}>
          {guardando ? "Cobrando…" : `Cobrar ${formatoMoneda.format(montoEfectivo || 0)}`}
        </Button>
      </div>
    </form>
  );
}
