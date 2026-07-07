import { nfMoneda } from "../../utils/moneda";
import { useState } from "react";
import Field from "../../components/Field";
import Button from "../../components/Button";
import StateMessage from "../../components/StateMessage";
import { useApi } from "../../hooks/useApi";
import { api } from "../../api/client";
import "./ConsumosForm.css";

const formatoMoneda = nfMoneda({
  style: "currency",
  currency: "PEN",
});

const VACIO = {
  tipo: "pedido", // 'pedido' | 'servicio'
  catalogo: "", // id del servicio del catálogo, o "" = libre
  descripcion: "",
  precio_unitario: "",
  cantidad: "1",
};

/**
 * ConsumosForm — registra productos/servicios que pide un huésped alojado y los
 * suma a su cuenta. Reutiliza el catálogo de Servicios (relleno rápido) o permite
 * un consumo libre. Cada consumo entra al saldo de la estancia automáticamente.
 *
 * Props:
 *   estancia: fila de estancia activa (necesita reserva_id, huesped, habitacion)
 *   onCambio: callback tras agregar/eliminar (para refrescar el saldo en Recepción)
 */
export default function ConsumosForm({ estancia, onCambio }) {
  const reservaId = estancia.reserva_id;
  const consumos = useApi(() => api.consumosPorReserva(reservaId), [reservaId]);
  const catalogo = useApi(api.serviciosHabitacion);

  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [borrandoId, setBorrandoId] = useState(null);
  const [error, setError] = useState(null);

  const servicios = (catalogo.data || []).filter((s) => s.activo);

  function elegirCatalogo(e) {
    const id = e.target.value;
    if (!id) {
      setForm((f) => ({ ...f, catalogo: "" }));
      return;
    }
    const s = servicios.find((x) => String(x.id) === String(id));
    setForm((f) => ({
      ...f,
      catalogo: id,
      // El tipo del consumo sigue al tipo del ítem del catálogo.
      tipo: s ? (s.tipo === "servicio" ? "servicio" : "pedido") : f.tipo,
      descripcion: s ? s.nombre : f.descripcion,
      precio_unitario: s ? String(s.precio) : f.precio_unitario,
    }));
  }

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const cant = Math.max(1, parseInt(form.cantidad, 10) || 1);
  const precio = Number(form.precio_unitario) || 0;
  const subtotal = cant * precio;

  const totalConsumos = (consumos.data || []).reduce((s, c) => s + (c.total || 0), 0);

  async function agregar(ev) {
    ev.preventDefault();
    setError(null);
    if (!form.descripcion.trim()) {
      setError("Indica qué consumió el huésped.");
      return;
    }
    if (precio < 0) {
      setError("El precio no puede ser negativo.");
      return;
    }
    setGuardando(true);
    try {
      await api.crearConsumo({
        reserva_id: reservaId,
        tipo: form.tipo,
        descripcion: form.descripcion.trim(),
        cantidad: cant,
        precio_unitario: precio,
        notas: "",
        // Si viene del catálogo, el backend descuenta el stock del item enlazado.
        servicio_id: form.catalogo ? Number(form.catalogo) : 0,
      });
      setForm(VACIO);
      consumos.recargar();
      onCambio?.();
    } catch (e) {
      setError(e.message || "No se pudo agregar el consumo.");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(c) {
    setBorrandoId(c.id);
    try {
      await api.eliminarConsumo(c.id);
      consumos.recargar();
      onCambio?.();
    } catch (e) {
      setError(e.message || "No se pudo eliminar.");
    } finally {
      setBorrandoId(null);
    }
  }

  return (
    <div className="consform">
      {/* Columna izquierda: productos/consumos ya cargados + total */}
      <div className="consform__col consform__col--lista">
      <div className="consform__lista">
        {consumos.loading && !consumos.data && (
          <StateMessage variant="loading" title="Cargando…" />
        )}
        {consumos.data && consumos.data.length === 0 && (
          <p className="consform__vacio">Aún no hay consumos cargados.</p>
        )}
        {consumos.data &&
          consumos.data.map((c) => (
            <div key={c.id} className="consform__item">
              <div className="consform__item-info">
                <span className="consform__item-desc">
                  {c.cantidad}× {c.descripcion}
                </span>
                <span className="consform__item-sub">
                  {formatoMoneda.format(c.precio_unitario)} c/u ·{" "}
                  {c.tipo === "servicio" ? "Servicio" : "Pedido"}
                </span>
              </div>
              <span className="consform__item-total">{formatoMoneda.format(c.total)}</span>
              <button
                type="button"
                className="consform__del"
                aria-label="Eliminar consumo"
                onClick={() => eliminar(c)}
                disabled={borrandoId === c.id}
              >
                ✕
              </button>
            </div>
          ))}
      </div>

      {(consumos.data || []).length > 0 && (
        <div className="consform__total">
          <span>Total consumos</span>
          <strong>{formatoMoneda.format(totalConsumos)}</strong>
        </div>
      )}
      </div>

      {/* Columna derecha: alta de consumo (catálogo, tipo, precio, cantidad) */}
      <form className="consform__col consform__col--form consform__form" onSubmit={agregar}>
        <Field id="cons-catalogo" label="Del catálogo (opcional)">
          <select id="cons-catalogo" value={form.catalogo} onChange={elegirCatalogo}>
            <option value="">— Elegir un producto/servicio —</option>
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre} — {formatoMoneda.format(s.precio)}
              </option>
            ))}
          </select>
        </Field>

        <Field id="cons-desc" label="Descripción" required>
          <input
            id="cons-desc"
            type="text"
            value={form.descripcion}
            onChange={set("descripcion")}
            placeholder="Ej. Agua mineral, Lavandería…"
          />
        </Field>

        <div className="consform__fila">
          <Field id="cons-tipo" label="Tipo">
            <select id="cons-tipo" value={form.tipo} onChange={set("tipo")}>
              <option value="pedido">Pedido / producto</option>
              <option value="servicio">Servicio</option>
            </select>
          </Field>
          <Field id="cons-precio" label="Precio unitario (S/)">
            <input
              id="cons-precio"
              type="number"
              min="0"
              step="0.01"
              value={form.precio_unitario}
              onChange={set("precio_unitario")}
              placeholder="0.00"
            />
          </Field>
          <Field id="cons-cant" label="Cantidad">
            <input
              id="cons-cant"
              type="number"
              min="1"
              step="1"
              value={form.cantidad}
              onChange={set("cantidad")}
            />
          </Field>
        </div>

        {subtotal > 0 && (
          <p className="consform__preview">
            Se agregará: <strong>{formatoMoneda.format(subtotal)}</strong> ({cant} ×{" "}
            {formatoMoneda.format(precio)})
          </p>
        )}

        {error && <p className="consform__error" role="alert">{error}</p>}

        <div className="consform__acciones">
          <Button type="submit" disabled={guardando}>
            {guardando ? "Agregando…" : "Agregar consumo"}
          </Button>
        </div>
      </form>
    </div>
  );
}
