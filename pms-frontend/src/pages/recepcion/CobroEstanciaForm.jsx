import { useMemo, useState } from "react";
import Field from "../../components/Field";
import Button from "../../components/Button";
import { api } from "../../api/client";
import { ymdLocal } from "../../utils/fechas";
import "./PagoForm.css";
import "./CheckinForm.css";
import "./CobroEstanciaForm.css";

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
const r2 = (x) => Math.round(x * 100) / 100;

/**
 * CobroEstanciaForm — cobra a un huésped alojado por su ESTADÍA REAL + CONSUMOS.
 *
 * El recepcionista elige la fecha real de salida; el monto se calcula por las
 * noches reales (entrada real → salida) × precio + los consumos cargados a la
 * reserva, con el desglose Reservado vs Real. Al cobrar: primero recalcula la
 * factura (hospedaje) y luego registra el pago (que cubre hospedaje + consumos).
 *
 * Props:
 *   estanciaId, facturaId, fechaCheckin, fechaSalidaEsperada, precioNoche, pagado,
 *   consumosTotal (suma de consumos de la reserva)
 *   onCobrado, onCerrar
 */
export default function CobroEstanciaForm({
  estanciaId,
  facturaId,
  fechaCheckin,
  fechaSalidaEsperada,
  precioNoche = 0,
  pagado = 0,
  consumosTotal = 0,
  onCobrado,
  onCerrar,
}) {
  const hoy = ymdLocal();
  const minFecha = useMemo(() => {
    const d = new Date(fechaCheckin + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return ymdLocal(d);
  }, [fechaCheckin]);

  const fechaInicial = hoy >= fechaSalidaEsperada ? hoy : fechaSalidaEsperada;
  const [fecha, setFecha] = useState(fechaInicial >= minFecha ? fechaInicial : minFecha);

  const nochesReservadas = noches(fechaCheckin, fechaSalidaEsperada);
  const totalReservado = r2(nochesReservadas * precioNoche);

  const [descuento, setDescuento] = useState("");
  const [descuentoMotivo, setDescuentoMotivo] = useState("");

  const calc = useMemo(() => {
    const n = noches(fechaCheckin, fecha);
    const subtotal = n > 0 ? r2(n * precioNoche) : 0;
    const desc = Math.min(Math.max(0, Number(descuento) || 0), subtotal);
    // Total = hospedaje (noches reales − descuento) + consumos.
    const total = r2(subtotal - desc + (consumosTotal || 0));
    const saldo = r2(total - pagado);
    return { noches: n, subtotal, descuento: desc, total, saldo, valido: n > 0 };
  }, [fecha, fechaCheckin, precioNoche, pagado, descuento, consumosTotal]);

  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [referencia, setReferencia] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

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
      setError("No hay saldo por cobrar.");
      return;
    }
    if (valor > calc.saldo + 0.001) {
      setError(`El monto no puede superar el saldo (${formatoMoneda.format(calc.saldo)}).`);
      return;
    }
    setGuardando(true);
    try {
      await api.recalcularEstancia(estanciaId, fecha, calc.descuento, descuentoMotivo);
      await api.registrarPago({ factura_id: facturaId, monto: valor, metodo, referencia });
      onCobrado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="pago-form cobro-form" onSubmit={cobrar} noValidate>
      <div className="cobro-form__cols">
        {/* Columna izquierda: SOLO el detalle/desglose */}
        <div className="cobro-form__col">
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
            {consumosTotal > 0 && (
              <div className="checkin-form__linea">
                <span>Consumos</span>
                <span>{formatoMoneda.format(consumosTotal)}</span>
              </div>
            )}
            <div className="checkin-form__total">
              <span>Total a cobrar</span>
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
        </div>

        {/* Columna derecha: TODOS los campos del cobro, en orden */}
        <div className="cobro-form__col">
          <Field id="cobro-fecha-salida" label="Fecha de salida (real)" required>
            <input
              id="cobro-fecha-salida"
              type="date"
              value={fecha}
              min={minFecha}
              onChange={(e) => { setFecha(e.target.value); setMonto(""); }}
            />
          </Field>

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
        </div>
      </div>

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
