import { useCallback, useState } from "react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import Field from "../../components/Field";
import { ymdLocal } from "../../utils/fechas";
import "./CajaDia.css";

const formatoMoneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

const METODO_LABEL = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otro: "Otro",
};

const hora = (iso) => {
  const d = new Date((iso || "").replace(" ", "T"));
  return isNaN(d) ? "" : d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
};

/**
 * CajaDia — arqueo del día: lo cobrado hoy por método + total, para que
 * recepción cuadre el efectivo del cajón. Incluye el detalle de cada pago con
 * quién lo registró (auditoría).
 */
export default function CajaDia() {
  const [fecha, setFecha] = useState(ymdLocal());
  const fetcher = useCallback(() => api.cajaDia(fecha), [fecha]);
  const caja = useApi(fetcher);
  const d = caja.data;

  return (
    <Card padding="md" className="caja">
      <div className="caja__head">
        <h2 className="caja__titulo">Caja del día</h2>
        <Field id="caja-fecha" label="">
          <input
            id="caja-fecha"
            type="date"
            value={fecha}
            max={ymdLocal()}
            onChange={(e) => setFecha(e.target.value)}
          />
        </Field>
      </div>

      {caja.loading && !d && <p className="caja__vacio">Cargando…</p>}

      {d && (
        <>
          <div className="caja__metodos">
            {d.por_metodo.length === 0 ? (
              <p className="caja__vacio">Sin cobros registrados este día.</p>
            ) : (
              d.por_metodo.map((m) => (
                <div key={m.metodo} className="caja__metodo">
                  <span className="caja__metodo-label">{METODO_LABEL[m.metodo] || m.metodo}</span>
                  <span className="caja__metodo-monto">{formatoMoneda.format(m.total)}</span>
                  <span className="caja__metodo-n">{m.n} pago(s)</span>
                </div>
              ))
            )}
          </div>

          <div className="caja__total">
            <span>Total del día</span>
            <strong>{formatoMoneda.format(d.total)}</strong>
          </div>

          {d.detalle && d.detalle.length > 0 && (
            <details className="caja__detalle">
              <summary>Ver detalle ({d.num_pagos} pago(s))</summary>
              <ul className="caja__lista">
                {d.detalle.map((p, i) => (
                  <li key={i} className="caja__item">
                    <span className="caja__item-info">
                      <strong>{formatoMoneda.format(p.monto)}</strong> ·{" "}
                      {METODO_LABEL[p.metodo] || p.metodo}
                      {p.huesped ? ` · ${p.huesped}` : ""}
                    </span>
                    <span className="caja__item-meta">
                      {hora(p.fecha)}
                      {p.usuario_nombre ? ` · por ${p.usuario_nombre}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Card>
  );
}
