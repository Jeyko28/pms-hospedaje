import { useState } from "react";
import Field from "../../components/Field";
import Button from "../../components/Button";
import { api } from "../../api/client";
import "./PagoForm.css";

const formatoMoneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

/**
 * PagoForm — registrar un pago contra la factura de una estancia.
 *
 * Pensado para el contexto peruano: incluye Yape y Plin ademas de los
 * metodos clasicos. Pre-rellena el monto con el saldo pendiente para
 * agilizar el caso comun (pagar todo lo que falta).
 *
 * Props:
 *   estancia:  objeto con factura_id y saldo
 *   onPagado:  callback tras registrar (refresca la lista)
 *   onCerrar:  cierra el formulario
 */
export default function PagoForm({ estancia, onPagado, onCerrar }) {
  const saldo = estancia.saldo ?? 0;
  const [monto, setMonto] = useState(saldo > 0 ? String(saldo) : "");
  const [metodo, setMetodo] = useState("efectivo");
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  async function enviar(ev) {
    ev.preventDefault();
    setError(null);
    const valor = Number(monto);
    if (!valor || valor <= 0) {
      setError("Ingresa un monto mayor a cero.");
      return;
    }
    if (valor > saldo) {
      setError(
        `El monto no puede superar el saldo pendiente (${formatoMoneda.format(saldo)}).`
      );
      return;
    }
    setGuardando(true);
    try {
      await api.registrarPago({
        factura_id: estancia.factura_id,
        monto: valor,
        metodo,
        referencia,
      });
      onPagado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="pago-form" onSubmit={enviar} noValidate>
      <p className="pago-form__saldo">
        Saldo pendiente:{" "}
        <strong>{formatoMoneda.format(saldo)}</strong>
      </p>

      <Field id="monto" label="Monto a pagar" required>
        <input
          id="monto"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
      </Field>

      <Field id="metodo" label="Metodo de pago" required>
        <select
          id="metodo"
          value={metodo}
          onChange={(e) => setMetodo(e.target.value)}
        >
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="transferencia">Transferencia</option>
          <option value="yape">Yape</option>
          <option value="plin">Plin</option>
        </select>
      </Field>

      <Field id="ref" label="Referencia (opcional)">
        <input
          id="ref"
          type="text"
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
          placeholder="Ej. n.o de operacion"
        />
      </Field>

      {error && (
        <p className="pago-form__error" role="alert">
          {error}
        </p>
      )}

      <div className="pago-form__acciones">
        <Button type="button" variant="secondary" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={guardando}>
          {guardando ? "Registrando…" : "Registrar pago"}
        </Button>
      </div>
    </form>
  );
}
