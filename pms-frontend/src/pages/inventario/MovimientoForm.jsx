import { useState } from "react";
import Field from "../../components/Field";
import Button from "../../components/Button";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";

const TIPOS = [
  ["entrada", "+ Entrada"],
  ["salida", "− Salida"],
  ["ajuste", "Ajuste"],
];

const fh = (iso) => String(iso || "").slice(0, 16).replace("T", " ");

/**
 * MovimientoForm — registra un movimiento de stock (entrada/salida/ajuste) y
 * muestra los movimientos recientes del producto.
 */
export default function MovimientoForm({ item, onHecho, onCancelar }) {
  const [tipo, setTipo] = useState("entrada");
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const movs = useApi(() => api.movimientosInventario(item.id), [item.id]);

  async function enviar(ev) {
    ev.preventDefault();
    setError(null);
    const c = Number(cantidad);
    if (cantidad === "" || Number.isNaN(c) || c < 0) {
      setError("Indica una cantidad válida.");
      return;
    }
    if (tipo !== "ajuste" && c <= 0) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }
    setGuardando(true);
    try {
      const r = await api.movimientoInventario(item.id, {
        tipo,
        cantidad: c,
        motivo: motivo.trim(),
        costo_unitario: Number(costo) || 0,
      });
      onHecho(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="entidad-form" onSubmit={enviar} noValidate>
      <p className="entidad-form__seccion">
        {item.nombre} · stock actual: <strong>{item.stock} {item.unidad}</strong>
      </p>

      <div className="inv-tipos" role="group" aria-label="Tipo de movimiento">
        {TIPOS.map(([v, l]) => (
          <button
            key={v}
            type="button"
            className={`inv-tipo inv-tipo--${v} ${tipo === v ? "is-active" : ""}`}
            aria-pressed={tipo === v}
            onClick={() => setTipo(v)}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="entidad-form__fila">
        <Field id="mov-cant" label={tipo === "ajuste" ? "Stock real (absoluto)" : "Cantidad"} required>
          <input id="mov-cant" type="number" min="0" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoFocus />
        </Field>
        {tipo === "entrada" && (
          <Field id="mov-costo" label="Costo unitario (opcional)">
            <input id="mov-costo" type="number" min="0" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} />
          </Field>
        )}
      </div>

      <Field id="mov-motivo" label="Motivo (opcional)">
        <input
          id="mov-motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={
            tipo === "entrada" ? "Compra, reposición…" : tipo === "salida" ? "Venta, consumo, merma…" : "Corrección de conteo"
          }
        />
      </Field>

      {error && <p className="entidad-form__error" role="alert">{error}</p>}

      <div className="entidad-form__acciones">
        <Button type="button" variant="secondary" onClick={onCancelar}>Cancelar</Button>
        <Button type="submit" disabled={guardando}>{guardando ? "Registrando…" : "Registrar"}</Button>
      </div>

      {movs.data && movs.data.length > 0 && (
        <details className="inv-hist">
          <summary>Movimientos recientes ({movs.data.length})</summary>
          <ul className="inv-hist__lista">
            {movs.data.map((m) => (
              <li key={m.id} className="inv-hist__item">
                <span className={`inv-hist__tipo inv-hist__tipo--${m.tipo}`}>{m.tipo}</span>
                <span className="inv-hist__cant">{m.cantidad} → queda {m.stock_resultante}</span>
                <span className="inv-hist__meta">
                  {m.usuario_nombre ? `${m.usuario_nombre} · ` : ""}{fh(m.fecha)}
                  {m.motivo ? ` · ${m.motivo}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </form>
  );
}
