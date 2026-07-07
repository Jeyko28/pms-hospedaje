import { nfMoneda } from "../../utils/moneda";
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

const formatoMoneda = nfMoneda({
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
 * CajaDia — caja de recepción por TURNO. Por defecto muestra el turno ABIERTO:
 * todo lo cobrado desde el último cierre hasta ahora, SIN reiniciarse por día
 * calendario (solo "Cerrar turno" corta el periodo). Incluye una consulta
 * histórica por día (solo lectura), el detalle con auditoría, el CIERRE DE TURNO
 * (arqueo firmado) y la impresión del arqueo.
 */
export default function CajaDia({ refreshKey = 0 }) {
  // fecha vacía = turno abierto; con fecha = consulta histórica de ese día.
  const [fecha, setFecha] = useState("");
  const [verDia, setVerDia] = useState(false);
  const caja = useApi(() => api.cajaDia(fecha), [fecha, refreshKey]);
  const cierres = useApi(() => api.cierresTurno(), [refreshKey]);
  const toast = useToast();
  const d = caja.data;
  const esTurno = !fecha; // modo turno abierto vs. día histórico

  const [cerrando, setCerrando] = useState(false);
  const [form, setForm] = useState({ efectivo_contado: "", notas: "" });
  const [guardando, setGuardando] = useState(false);

  function abrirCierre() {
    setForm({ efectivo_contado: "", notas: "" });
    setCerrando(true);
  }

  function verHistorico(v) {
    setVerDia(v);
    setFecha(v ? ymdLocal() : "");
  }

  function imprimirArqueo() {
    document.body.setAttribute("data-print", "arqueo");
    const limpiar = () => {
      document.body.removeAttribute("data-print");
      window.removeEventListener("afterprint", limpiar);
    };
    window.addEventListener("afterprint", limpiar);
    window.print();
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
        efectivo_contado: contado,
        notas: form.notas.trim(),
      });
      setCerrando(false);
      caja.recargar();
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
        <div>
          <h2 className="caja__titulo">
            {esTurno ? "Caja · turno abierto" : `Arqueo del ${fecha}`}
          </h2>
          {esTurno && (
            <p className="caja__sub">
              {d?.abierta_desde
                ? `Abierta desde el último cierre · ${fechaHora(d.abierta_desde)}`
                : "Acumula todo lo cobrado hasta que cierres el turno."}
            </p>
          )}
        </div>
        <div className="caja__head-acciones">
          <Button size="sm" variant="ghost" onClick={imprimirArqueo}>
            🖨 Imprimir
          </Button>
        </div>
      </div>

      {caja.loading && !d && <p className="caja__vacio">Cargando…</p>}

      {d && (
        <>
          <div className="caja__metodos">
            {d.por_metodo.length === 0 ? (
              <p className="caja__vacio">
                {esTurno ? "Sin cobros en el turno actual." : "Sin cobros registrados este día."}
              </p>
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
            <span>{esTurno ? "Total del turno" : "Total del día"}</span>
            <strong>{formatoMoneda.format(d.total)}</strong>
          </div>

          {d.por_moneda?.length > 0 && (
            <div className="caja__monedas">
              {d.por_moneda.map((m) => (
                <div key={m.moneda} className="caja__moneda">
                  <span>
                    Recibido en {m.moneda === "USD" ? "dólares" : m.moneda}
                  </span>
                  <span>
                    US$ {Number(m.recibido).toFixed(2)}{" "}
                    <span className="caja__moneda-base">(= {formatoMoneda.format(m.en_base)})</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="caja__acciones">
            {esTurno ? (
              <Button size="sm" variant="secondary" onClick={abrirCierre}>
                Cerrar turno
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => verHistorico(false)}>
                ← Volver al turno actual
              </Button>
            )}
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
                      {fechaHora(p.fecha)}
                      {p.usuario_nombre ? ` · por ${p.usuario_nombre}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {/* Consulta histórica por día (solo lectura) */}
      {esTurno && (
        <div className="caja__historico no-print">
          {!verDia ? (
            <button type="button" className="caja__link" onClick={() => verHistorico(true)}>
              Ver arqueo de un día pasado
            </button>
          ) : (
            <Field id="caja-fecha" label="Ver un día">
              <input
                id="caja-fecha"
                type="date"
                value={fecha}
                max={ymdLocal()}
                onChange={(e) => setFecha(e.target.value)}
              />
            </Field>
          )}
        </div>
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
                  {c.periodo_desde ? `${fechaHora(c.periodo_desde)} → ` : ""}
                  {c.periodo_hasta ? fechaHora(c.periodo_hasta) : fechaHora(c.creado_en)}
                  {c.usuario_nombre ? ` · ${c.usuario_nombre}` : ""}
                  {c.notas ? ` · ${c.notas}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Modal de cierre de turno */}
      <Modal open={cerrando} title="Cerrar turno" onClose={() => setCerrando(false)}>
        <form className="caja__cierre-form" onSubmit={confirmarCierre}>
          <div className="caja__cierre-resumen">
            <div className="caja__cierre-fila">
              <span>Total cobrado en el turno</span>
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
            Cierra el turno abierto (desde el último cierre hasta ahora). Queda registrado
            quién y cuándo, con el desglose por método. No bloquea cobros posteriores; el
            siguiente turno arranca desde este cierre.
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
