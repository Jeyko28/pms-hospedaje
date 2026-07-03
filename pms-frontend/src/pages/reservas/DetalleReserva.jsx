import { useMemo } from "react";
import Modal from "../../components/Modal";
import Badge from "../../components/Badge";
import StateMessage from "../../components/StateMessage";
import { useApi } from "../../hooks/useApi";
import { api } from "../../api/client";
import { ESTADO_RESERVA, presentar } from "../../config/estados";
import "./DetalleReserva.css";

const formatoMoneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

const formatoFecha = (iso) => {
  if (!iso) return "—";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatoFechaHora = (iso) => {
  if (!iso) return "—";
  const str = String(iso);
  const d = new Date(str.includes("T") ? str : str + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const METODO_PAGO = {
  efectivo: { label: "Efectivo", icon: "💵" },
  tarjeta: { label: "Tarjeta", icon: "💳" },
  transferencia: { label: "Transferencia", icon: "🏦" },
  yape: { label: "Yape", icon: "📱" },
  plin: { label: "Plin", icon: "📱" },
};

function nochesEntre(entrada, salida) {
  if (!entrada || !salida) return 0;
  const a = new Date(entrada + "T00:00:00");
  const b = new Date(salida + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

export default function DetalleReserva({ reservaId, onClose }) {
  // Solo pedir el detalle cuando hay una reserva seleccionada (evita una
  // petición inútil a /api/reservas/null/detalle -> 422 con el modal cerrado).
  const { data, loading, error } = useApi(
    () => (reservaId ? api.reservaDetalle(reservaId) : Promise.resolve(null)),
    [reservaId]
  );

  const totalConsumos = useMemo(() => {
    if (!data?.consumos) return 0;
    return data.consumos.reduce((s, c) => s + (c.total || 0), 0);
  }, [data?.consumos]);

  const totalGeneral = useMemo(() => {
    if (!data) return 0;
    const hospedaje = data.factura?.total || data.reserva?.total || 0;
    const descuento = data.factura?.descuento || 0;
    return hospedaje + totalConsumos - descuento;
  }, [data, totalConsumos]);

  const pagado = useMemo(() => {
    if (!data?.factura?.pagos) return 0;
    return data.factura.pagos.reduce((s, p) => s + (p.monto || 0), 0);
  }, [data?.factura?.pagos]);

  const saldo = Math.max(0, totalGeneral - pagado);
  const est = data ? presentar(ESTADO_RESERVA, data.reserva?.estado) : null;

  return (
    <Modal
      open={!!reservaId}
      title={`Reserva #${reservaId}`}
      onClose={onClose}
    >
      {loading && (
        <StateMessage variant="loading" title="Cargando detalle…" />
      )}

      {error && (
        <StateMessage variant="error" title="Error al cargar" message={error} />
      )}

      {data && (
        <div className="dr">
          {/* ── Header: nombre + estado ── */}
          <div className="dr__header">
            <div className="dr__header-info">
              <h3 className="dr__guest-name">{data.huesped?.nombre || "—"}</h3>
              {est && (
                <Badge tone={est.tone} icon={est.icon}>{est.label}</Badge>
              )}
            </div>
            {data.huesped?.telefono && (
              <span className="dr__phone">{data.huesped.telefono}</span>
            )}
          </div>

          {/* ── Dos columnas: info clave ── */}
          <div className="dr__two-col">
            {/* Columna izquierda: Habitación */}
            <div className="dr__col">
              <span className="dr__col-label">Habitación</span>
              <span className="dr__col-value">
                {data.habitacion?.numero || "—"}
                <span className="dr__col-sub">{data.habitacion?.tipo}</span>
              </span>
              <span className="dr__col-price">
                {formatoMoneda.format(data.habitacion?.precio_base || 0)} / noche
              </span>
            </div>

            {/* Columna derecha: Estadía */}
            <div className="dr__col">
              <span className="dr__col-label">Estadía</span>
              <span className="dr__col-value">
                {formatoFecha(data.reserva?.fecha_entrada)} →{" "}
                {formatoFecha(data.reserva?.fecha_salida)}
              </span>
              <span className="dr__col-sub">
                {nochesEntre(data.reserva?.fecha_entrada, data.reserva?.fecha_salida)} noche{nochesEntre(data.reserva?.fecha_entrada, data.reserva?.fecha_salida) !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* ── Detalles de check-in / check-out ── */}
          {data.estancia && (
            <div className="dr__timeline">
              <div className="dr__tl-item">
                <span className="dr__tl-dot dr__tl-dot--in" />
                <div className="dr__tl-content">
                  <span className="dr__tl-label">Check-in</span>
                  <span className="dr__tl-value">{formatoFechaHora(data.estancia.fecha_checkin)}</span>
                  {data.estancia.usuario_checkin_nombre && (
                    <span className="dr__tl-sub">por {data.estancia.usuario_checkin_nombre}</span>
                  )}
                </div>
              </div>
              <div className="dr__tl-item">
                <span className={`dr__tl-dot ${data.estancia.fecha_checkout_real ? "dr__tl-dot--out" : ""}`} />
                <div className="dr__tl-content">
                  <span className="dr__tl-label">Check-out</span>
                  <span className="dr__tl-value">
                    {data.estancia.fecha_checkout_real
                      ? formatoFechaHora(data.estancia.fecha_checkout_real)
                      : "Pendiente"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Info extra (documento, email, origen) ── */}
          <div className="dr__meta-row">
            {data.huesped?.documento && (
              <span className="dr__meta-chip">
                {data.huesped.tipo_documento || "DNI"}: {data.huesped.documento}
              </span>
            )}
            {data.huesped?.email && (
              <span className="dr__meta-chip">✉ {data.huesped.email}</span>
            )}
            <span className="dr__meta-chip">
              {data.reserva?.origen === "publico" ? "🌐 Link público" : "✏ Manual"}
            </span>
          </div>

          {/* ── Consumos ── */}
          {data.consumos && data.consumos.length > 0 && (
            <>
              <div className="dr__divider" />
              <div className="dr__section">
                <h4 className="dr__section-title">Consumos</h4>
                <table className="dr__table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Descripción</th>
                      <th className="dr__num">Cant.</th>
                      <th className="dr__num">P.Unit.</th>
                      <th className="dr__num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.consumos.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <span className={`dr__tag dr__tag--${c.tipo}`}>
                            {c.tipo === "servicio" ? "Servicio" : "Pedido"}
                          </span>
                        </td>
                        <td>
                          {c.descripcion}
                          {c.notas && <span className="dr__muted"> · {c.notas}</span>}
                        </td>
                        <td className="dr__num">{c.cantidad}</td>
                        <td className="dr__num">{formatoMoneda.format(c.precio_unitario)}</td>
                        <td className="dr__num dr__bold">{formatoMoneda.format(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Pagos ── */}
          {data.factura && data.factura.pagos && data.factura.pagos.length > 0 && (
            <>
              <div className="dr__divider" />
              <div className="dr__section">
                <h4 className="dr__section-title">Pagos realizados</h4>
                <div className="dr__payments">
                  {data.factura.pagos.map((p) => (
                    <div key={p.id} className="dr__payment">
                      <span className="dr__payment-icon">
                        {METODO_PAGO[p.metodo]?.icon || "💰"}
                      </span>
                      <div className="dr__payment-info">
                        <span className="dr__payment-method">
                          {METODO_PAGO[p.metodo]?.label || p.metodo}
                        </span>
                        <span className="dr__payment-date">{formatoFechaHora(p.fecha)}</span>
                      </div>
                      <span className="dr__payment-amount">
                        {formatoMoneda.format(p.monto)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Resumen financiero ── */}
          <div className="dr__divider" />
          <div className="dr__summary">
            <div className="dr__summary-row">
              <span>Hospedaje ({nochesEntre(data.reserva?.fecha_entrada, data.reserva?.fecha_salida)} noches)</span>
              <span>{formatoMoneda.format(data.factura?.total || data.reserva?.total || 0)}</span>
            </div>
            {totalConsumos > 0 && (
              <div className="dr__summary-row">
                <span>Consumos</span>
                <span>{formatoMoneda.format(totalConsumos)}</span>
              </div>
            )}
            {(data.factura?.descuento || 0) > 0 && (
              <div className="dr__summary-row dr__summary-row--green">
                <span>Descuento ({data.factura.descuento_motivo})</span>
                <span>−{formatoMoneda.format(data.factura.descuento)}</span>
              </div>
            )}
            <div className="dr__summary-row dr__summary-row--total">
              <span>Total</span>
              <span>{formatoMoneda.format(totalGeneral)}</span>
            </div>
            <div className="dr__summary-row">
              <span>Pagado</span>
              <span>{formatoMoneda.format(pagado)}</span>
            </div>
            <div className={`dr__summary-row dr__summary-row--balance ${saldo > 0 ? "dr__summary-row--pending" : "dr__summary-row--paid"}`}>
              <span>Saldo</span>
              <span>{formatoMoneda.format(saldo)}</span>
            </div>
          </div>

          {/* ── Notas ── */}
          {data.reserva?.notas && (
            <>
              <div className="dr__divider" />
              <div className="dr__notes">
                <span className="dr__notes-label">Notas</span>
                <p className="dr__notes-text">{data.reserva.notas}</p>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
