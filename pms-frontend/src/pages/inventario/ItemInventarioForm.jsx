import { useState } from "react";
import Field from "../../components/Field";
import Button from "../../components/Button";
import { api } from "../../api/client";

const CATEGORIAS = ["Cocina", "Minimarket", "Limpieza", "Operación"];
// Unidades de medida frecuentes en un hospedaje. "Otra…" permite una personalizada.
const UNIDADES = [
  "unidad", "kg", "g", "litro", "ml", "saco", "paquete",
  "caja", "bolsa", "botella", "lata", "docena", "arroba",
];

/**
 * ItemInventarioForm — alta/edición de un producto de inventario. El STOCK solo
 * se define al crear; luego se cambia con movimientos (trazabilidad).
 *
 * Cada producto se mide en su UNIDAD base (kg, litro, unidad, saco…). De forma
 * opcional, puede comprarse por PRESENTACIÓN (ej. "1 saco = 50 kg"): el factor lo
 * define el dueño por producto.
 */
export default function ItemInventarioForm({ item, onGuardado, onCancelar }) {
  const esEdicion = !!item;
  const [form, setForm] = useState({
    nombre: item?.nombre ?? "",
    categoria: item?.categoria ?? "Operación",
    unidad: item?.unidad ?? "unidad",
    stock: item?.stock ?? 0,
    stock_minimo: item?.stock_minimo ?? 0,
    costo_unitario: item?.costo_unitario ?? 0,
    proveedor: item?.proveedor ?? "",
    presentacion: item?.presentacion ?? "",
    presentacion_factor: item?.presentacion_factor ?? 0,
  });
  const [usaPres, setUsaPres] = useState(
    !!(item?.presentacion || item?.presentacion_factor)
  );
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const set = (c) => (e) => setForm((f) => ({ ...f, [c]: e.target.value }));

  // Unidad: el select muestra "Otra…" cuando la unidad no está en la lista.
  const unidadEnLista = UNIDADES.includes(form.unidad);
  const selUnidad = unidadEnLista ? form.unidad : "otra";
  function cambiarUnidad(e) {
    const v = e.target.value;
    setForm((f) => ({ ...f, unidad: v === "otra" ? "" : v }));
  }

  async function enviar(ev) {
    ev.preventDefault();
    setError(null);
    if (!form.nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    const unidadFinal = (form.unidad || "").trim() || "unidad";
    if (usaPres) {
      if (!form.presentacion.trim()) {
        setError("Indica el nombre de la presentación (ej. saco, caja).");
        return;
      }
      if (!(Number(form.presentacion_factor) > 0)) {
        setError(`Indica cuántos ${unidadFinal} trae 1 ${form.presentacion.trim()}.`);
        return;
      }
    }
    setGuardando(true);
    try {
      const datos = {
        nombre: form.nombre.trim(),
        categoria: form.categoria,
        unidad: unidadFinal,
        stock: Number(form.stock) || 0,
        stock_minimo: Number(form.stock_minimo) || 0,
        costo_unitario: Number(form.costo_unitario) || 0,
        proveedor: form.proveedor.trim(),
        presentacion: usaPres ? form.presentacion.trim() : "",
        presentacion_factor: usaPres ? Number(form.presentacion_factor) || 0 : 0,
      };
      if (esEdicion) await api.editarItemInventario(item.id, datos);
      else await api.crearItemInventario(datos);
      onGuardado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  const unidadFinal = (form.unidad || "").trim() || "unidad";

  return (
    <form className="entidad-form" onSubmit={enviar} noValidate>
      <Field id="inv-nombre" label="Producto" required>
        <input id="inv-nombre" value={form.nombre} onChange={set("nombre")} placeholder="Ej. Papa rosada, Arroz, Pollo…" autoFocus />
      </Field>
      <div className="entidad-form__fila">
        <Field id="inv-cat" label="Categoría">
          <select id="inv-cat" value={form.categoria} onChange={set("categoria")}>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field id="inv-unidad" label="Unidad de medida" hint="Cómo mides este producto.">
          <select id="inv-unidad" value={selUnidad} onChange={cambiarUnidad}>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
            <option value="otra">Otra…</option>
          </select>
        </Field>
      </div>

      {selUnidad === "otra" && (
        <Field id="inv-unidad-otra" label="Unidad personalizada" required>
          <input
            id="inv-unidad-otra"
            value={form.unidad}
            onChange={set("unidad")}
            placeholder="Ej. balde, plancha, rollo…"
            autoFocus
          />
        </Field>
      )}

      <div className="entidad-form__fila">
        {!esEdicion && (
          <Field id="inv-stock" label={`Stock inicial (${unidadFinal})`}>
            <input id="inv-stock" type="number" min="0" step="any" value={form.stock} onChange={set("stock")} />
          </Field>
        )}
        <Field id="inv-min" label="Stock mínimo (alerta)">
          <input id="inv-min" type="number" min="0" step="any" value={form.stock_minimo} onChange={set("stock_minimo")} />
        </Field>
        <Field id="inv-costo" label={`Costo por ${unidadFinal} (S/)`}>
          <input id="inv-costo" type="number" min="0" step="0.01" value={form.costo_unitario} onChange={set("costo_unitario")} />
        </Field>
      </div>

      {/* Presentación de compra (opcional) */}
      <label className="inv-pres-check">
        <input
          type="checkbox"
          checked={usaPres}
          onChange={(e) => setUsaPres(e.target.checked)}
        />
        Se compra por presentación (saco, caja, jaba…)
      </label>
      {usaPres && (
        <div className="entidad-form__fila inv-pres-fila">
          <Field id="inv-pres" label="Presentación" required>
            <input id="inv-pres" value={form.presentacion} onChange={set("presentacion")} placeholder="Ej. saco" />
          </Field>
          <Field
            id="inv-pres-factor"
            label={`1 ${form.presentacion.trim() || "presentación"} = ? ${unidadFinal}`}
            required
            hint="Lo defines tú (varía por producto)."
          >
            <input id="inv-pres-factor" type="number" min="0" step="any" value={form.presentacion_factor} onChange={set("presentacion_factor")} placeholder={`${unidadFinal} por ${form.presentacion.trim() || "presentación"}`} />
          </Field>
        </div>
      )}

      <Field id="inv-prov" label="Proveedor (opcional)">
        <input id="inv-prov" value={form.proveedor} onChange={set("proveedor")} placeholder="Ej. Distribuidora X" />
      </Field>

      {error && <p className="entidad-form__error" role="alert">{error}</p>}
      {esEdicion && (
        <p className="entidad-form__seccion">
          El stock se cambia con movimientos (entrada/salida/ajuste), no aquí.
        </p>
      )}

      <div className="entidad-form__acciones">
        <Button type="button" variant="secondary" onClick={onCancelar}>Cancelar</Button>
        <Button type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : esEdicion ? "Guardar" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
