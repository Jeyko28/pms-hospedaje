import { useState } from "react";
import Field from "../../components/Field";
import Button from "../../components/Button";
import { api } from "../../api/client";

const CATEGORIAS = ["Cocina", "Minimarket", "Limpieza", "Operación"];
const UNIDADES = ["unidad", "kg", "g", "litro", "ml", "paquete", "caja", "botella", "docena"];

/**
 * ItemInventarioForm — alta/edición de un producto de inventario. El STOCK solo
 * se define al crear; luego se cambia con movimientos (trazabilidad).
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
  });
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const set = (c) => (e) => setForm((f) => ({ ...f, [c]: e.target.value }));

  async function enviar(ev) {
    ev.preventDefault();
    setError(null);
    if (!form.nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setGuardando(true);
    try {
      const datos = {
        nombre: form.nombre.trim(),
        categoria: form.categoria,
        unidad: form.unidad.trim() || "unidad",
        stock: Number(form.stock) || 0,
        stock_minimo: Number(form.stock_minimo) || 0,
        costo_unitario: Number(form.costo_unitario) || 0,
        proveedor: form.proveedor.trim(),
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

  return (
    <form className="entidad-form" onSubmit={enviar} noValidate>
      <Field id="inv-nombre" label="Producto" required>
        <input id="inv-nombre" value={form.nombre} onChange={set("nombre")} placeholder="Ej. Coca-Cola 500ml" autoFocus />
      </Field>
      <div className="entidad-form__fila">
        <Field id="inv-cat" label="Categoría">
          <select id="inv-cat" value={form.categoria} onChange={set("categoria")}>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field id="inv-unidad" label="Unidad">
          <input id="inv-unidad" list="inv-unidades" value={form.unidad} onChange={set("unidad")} />
          <datalist id="inv-unidades">
            {UNIDADES.map((u) => <option key={u} value={u} />)}
          </datalist>
        </Field>
      </div>
      <div className="entidad-form__fila">
        {!esEdicion && (
          <Field id="inv-stock" label="Stock inicial">
            <input id="inv-stock" type="number" min="0" step="any" value={form.stock} onChange={set("stock")} />
          </Field>
        )}
        <Field id="inv-min" label="Stock mínimo (alerta)">
          <input id="inv-min" type="number" min="0" step="any" value={form.stock_minimo} onChange={set("stock_minimo")} />
        </Field>
        <Field id="inv-costo" label="Costo unitario (S/)">
          <input id="inv-costo" type="number" min="0" step="0.01" value={form.costo_unitario} onChange={set("costo_unitario")} />
        </Field>
      </div>
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
