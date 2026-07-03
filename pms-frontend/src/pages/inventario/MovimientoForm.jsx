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
const g = (n) => Number(n ?? 0).toLocaleString("es-PE", { maximumFractionDigits: 3 });

/**
 * MovimientoForm — registra un movimiento de stock (entrada/salida/ajuste) y
 * muestra los movimientos recientes. Si el producto tiene presentación de compra
 * (ej. saco = N kg), la ENTRADA puede registrarse en presentaciones y se
 * convierte a la unidad base automáticamente.
 */
export default function MovimientoForm({ item, onHecho, onCancelar }) {
  const tienePres = !!(item.presentacion && item.presentacion_factor > 0);
  const [tipo, setTipo] = useState("entrada");
  const [enPres, setEnPres] = useState(tienePres); // registrar en presentación (solo entrada)
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const movs = useApi(() => api.movimientosInventario(item.id), [item.id]);

  // La presentación solo aplica a entradas (compras a granel).
  const usaPres = tipo === "entrada" && tienePres && enPres;
  const unidadEntrada = usaPres ? item.presentacion : item.unidad;
  const cantNum = Number(cantidad) || 0;
  const equivalente = usaPres ? cantNum * item.presentacion_factor : null;

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
        en_presentacion: usaPres,
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
        {item.nombre} · stock actual: <strong>{g(item.stock)} {item.unidad}</strong>
        {tienePres && (
          <span className="inv-pres-nota"> · 1 {item.presentacion} = {g(item.presentacion_factor)} {item.unidad}</span>
        )}
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

      {/* Entrada por presentación o por unidad base */}
      {tipo === "entrada" && tienePres && (
        <div className="inv-unidad-toggle" role="group" aria-label="Registrar en">
          <span>Registrar en:</span>
          <button type="button" className={enPres ? "is-active" : ""} onClick={() => setEnPres(true)}>
            {item.presentacion}
          </button>
          <button type="button" className={!enPres ? "is-active" : ""} onClick={() => setEnPres(false)}>
            {item.unidad}
          </button>
        </div>
      )}

      <div className="entidad-form__fila">
        <Field
          id="mov-cant"
          label={tipo === "ajuste" ? `Stock real (${item.unidad})` : `Cantidad (${unidadEntrada})`}
          required
          hint={usaPres && equivalente ? `= ${g(equivalente)} ${item.unidad}` : undefined}
        >
          <input id="mov-cant" type="number" min="0" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoFocus />
        </Field>
        {tipo === "entrada" && (
          <Field id="mov-costo" label={`Costo por ${unidadEntrada} (opcional)`}>
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
            tipo === "entrada" ? "Compra, reposición…" : tipo === "salida" ? "Consumo, merma…" : "Corrección de conteo"
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
                <span className="inv-hist__cant">{g(m.cantidad)} {item.unidad} → queda {g(m.stock_resultante)}</span>
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
