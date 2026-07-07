import { nfMoneda, convertirDesdeBase, convertirABase } from "../../utils/moneda";
import { useEffect, useMemo, useState } from "react";
import Field from "../../components/Field";
import Button from "../../components/Button";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../auth/AuthContext";
import { ymdLocal } from "../../utils/fechas";
import "./PagoForm.css";
import "./CheckinForm.css";
import "./CobroEstanciaForm.css";

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

  // Cobro en dólares (efectivo): equivalencia + vuelto + tipo de cambio auditado.
  const { usuario } = useAuth();
  const base = usuario?.moneda || "PEN";
  const aceptaUSD = (usuario?.monedas_aceptadas || "").includes("USD") && base !== "USD";
  const tc = useApi(
    () => (aceptaUSD ? api.tipoCambio("USD") : Promise.resolve(null)),
    [aceptaUSD]
  );
  const [monedaRecibida, setMonedaRecibida] = useState("BASE");
  const [usdRecibido, setUsdRecibido] = useState("");
  const [tipoCambio, setTipoCambio] = useState("");
  useEffect(() => {
    if (tc.data?.tasa && !tipoCambio) setTipoCambio(String(tc.data.tasa));
  }, [tc.data]); // eslint-disable-line

  const tcNum = Number(tipoCambio) || 0;
  const esUSD = monedaRecibida === "USD" && tcNum > 0;
  const cobroEnUSD = esUSD ? convertirDesdeBase(montoEfectivo, tcNum) : 0;
  const recibidoEnBase = esUSD ? convertirABase(Number(usdRecibido) || 0, tcNum) : 0;
  const vuelto = esUSD ? Math.max(0, recibidoEnBase - montoEfectivo) : 0;

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
    if (esUSD && recibidoEnBase + 0.001 < valor) {
      setError(`Los dólares recibidos no cubren el cobro (equivalen a ${formatoMoneda.format(recibidoEnBase)}).`);
      return;
    }
    setGuardando(true);
    try {
      await api.recalcularEstancia(estanciaId, fecha, calc.descuento, descuentoMotivo);
      const extraUSD = esUSD
        ? { moneda_recibida: "USD", monto_recibido: Number(usdRecibido) || 0, tipo_cambio: tcNum }
        : {};
      await api.registrarPago({ factura_id: facturaId, monto: valor, metodo, referencia, ...extraUSD });
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

          {aceptaUSD && (
            <Field id="cobro-moneda-rec" label="Moneda recibida">
              <select
                id="cobro-moneda-rec"
                value={monedaRecibida}
                onChange={(e) => setMonedaRecibida(e.target.value)}
              >
                <option value="BASE">Soles (S/)</option>
                <option value="USD">Dólares (US$)</option>
              </select>
            </Field>
          )}

          {esUSD && (
            <div className="cobro-usd">
              <Field id="cobro-tc" label="Tipo de cambio (S/ por US$)" required>
                <input
                  id="cobro-tc"
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  value={tipoCambio}
                  onChange={(e) => setTipoCambio(e.target.value)}
                />
              </Field>
              <Field id="cobro-usd-recibido" label="Dólares recibidos (US$)" required>
                <input
                  id="cobro-usd-recibido"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={usdRecibido}
                  onChange={(e) => setUsdRecibido(e.target.value)}
                  placeholder={cobroEnUSD ? cobroEnUSD.toFixed(2) : ""}
                />
              </Field>
              <p className="cobro-usd__nota">
                Cobro ≈ <strong>US$ {cobroEnUSD.toFixed(2)}</strong> · Recibes US${" "}
                {(Number(usdRecibido) || 0).toFixed(2)} = {formatoMoneda.format(recibidoEnBase)} ·{" "}
                Vuelto <strong>{formatoMoneda.format(vuelto)}</strong>
              </p>
            </div>
          )}

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
