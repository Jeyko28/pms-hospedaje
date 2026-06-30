import { useState } from "react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import Field from "../../components/Field";
import Button from "../../components/Button";
import Modal from "../../components/Modal";
import Badge from "../../components/Badge";
import { useToast } from "../../components/Toast";
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

const fechaHora = (iso) => {
  const d = new Date((iso || "").replace(" ", "T"));
  return isNaN(d)
    ? ""
    : d.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

/**
 * CajaDia — arqueo del día: lo cobrado hoy por método + total, para que
 * recepción cuadre el efectivo del cajón. Incluye el detalle de cada pago con
 * quién lo registró (auditoría) y el CIERRE DE TURNO (arqueo firmado: efectivo
 * contado vs. esperado, con quién y cuándo; no bloquea pagos posteriores).
 */
export default function CajaDia({ refreshKey = 0 }) {
  const [fecha, setFecha] = useState(ymdLocal());
  // deps = [fecha, refreshKey]: recarga al cambiar la fecha y cuando Recepción
  // sube refreshKey tras un cobro (así la caja del día se actualiza al instante).
  const caja = useApi(() => api.cajaDia(fecha), [fecha, refreshKey]);
  const cierres = useApi(() => api.cierresTurno(), [refreshKey]);
  const toast = useToast();
  const d = caja.data;

  const [cerrando, setCerrando] = useState(false); // modal abierto
  const [form, setForm] = useState({ efectivo_contado: "", notas: "" });
  const [guardando, setGuardando] = useState(false);

  function abrirCierre() {
    setForm({ efectivo_contado: "", notas: "" });
    setCerrando(true);
  }

  async function confirmarCierre(ev) {
    ev.preventDefault();
    const contadoTxt = form.efectivo_contado.trim();
    const contado = contadoTxt === "" ? null : Number(contadoTxt);
    if (contado !== null && (Number.isNaN(contado) || contado < 0)) {
      toast.error("El efectivo contado debe ser un número válido (o déjalo vacío).");
      return;
    }
    setGuardando(true);
    try {
      const c = await api.crearCierreTurno({
        fecha,
        efectivo_contado: contado,
        notas: form.notas.trim(),
      });
      setCerrando(false);
      cierres.recargar();
      if (c.diferencia === null || c.diferencia === undefined) {
        toast.success("Turno cerrado (sin conteo de efectivo).");
      } else if (Math.abs(c.diferencia) < 0.01) {
        toast.success("Turno cerrado: caja cuadrada ✓");
      } else {
        const signo = c.diferencia > 0 ? "sobrante" : "faltante";
        toast.info(`Turno cerrado: ${signo} de ${formatoMoneda.format(Math.abs(c.diferencia))}.`);
      }
    } catch (e) {
      toast.error(e.message || "No se pudo cerrar el turno.");
    } finally {
      setGuardando(false);
    }
  }

  const esperadoEfectivo = d?.efectivo ?? 0;

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

          <div className="caja__acciones">
            <Button size="sm" variant="secondary" onClick={abrirCierre}>
              Cerrar turno
            </Button>
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

      {/* Historial de cierres */}
      {cierres.data && cierres.data.length > 0 && (
        <details className="caja__detalle caja__cierres">
          <summary>Cierres recientes ({cierres.data.length})</summary>
          <ul className="caja__lista">
            {cierres.data.map((c) => (
              <li key={c.id} className="caja__item">
                <span className="caja__item-info">
                  <strong>{formatoMoneda.format(c.total_sistema)}</strong>
                  {c.diferencia === null || c.diferencia === undefined ? (
                    <Badge tone="neutral" icon="•">sin conteo</Badge>
                  ) : Math.abs(c.diferencia) < 0.01 ? (
                    <Badge tone="success" icon="✓">cuadró</Badge>
                  ) : (
                    <Badge tone={c.diferencia > 0 ? "info" : "danger"} icon={c.diferencia > 0 ? "▲" : "▼"}>
                      {c.diferencia > 0 ? "sobrante " : "faltante "}
                      {formatoMoneda.format(Math.abs(c.diferencia))}
                    </Badge>
                  )}
                </span>
                <span className="caja__item-meta">
                  {c.fecha} · {fechaHora(c.creado_en)}
                  {c.usuario_nombre ? ` · ${c.usuario_nombre}` : ""}
                  {c.notas ? ` · ${c.notas}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Modal de cierre de turno */}
      <Modal open={cerrando} title={`Cerrar turno · ${fecha}`} onClose={() => setCerrando(false)}>
        <form className="caja__cierre-form" onSubmit={confirmarCierre}>
          <div className="caja__cierre-resumen">
            <div className="caja__cierre-fila">
              <span>Total cobrado</span>
              <strong>{formatoMoneda.format(d?.total ?? 0)}</strong>
            </div>
            <div className="caja__cierre-fila">
              <span>Efectivo esperado en caja</span>
              <strong>{formatoMoneda.format(esperadoEfectivo)}</strong>
            </div>
          </div>

          <Field id="cierre-contado" label="Efectivo contado (opcional)">
            <input
              id="cierre-contado"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={form.efectivo_contado}
              onChange={(e) => setForm((f) => ({ ...f, efectivo_contado: e.target.value }))}
              placeholder={`Esperado: ${esperadoEfectivo.toFixed(2)}`}
            />
          </Field>

          <Field id="cierre-notas" label="Notas (opcional)">
            <input
              id="cierre-notas"
              type="text"
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              placeholder="Ej. turno tarde, incidencia con un pago…"
            />
          </Field>

          <p className="caja__cierre-hint">
            Queda registrado quién y cuándo cierra, con el desglose por método. No
            bloquea cobros posteriores; es un arqueo de control.
          </p>

          <div className="caja__cierre-acciones">
            <Button type="button" variant="secondary" onClick={() => setCerrando(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Cerrando…" : "Cerrar turno"}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
