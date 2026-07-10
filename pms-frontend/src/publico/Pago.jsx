import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, CreditCard } from "lucide-react";
import Button from "../components/Button";
import { api } from "../api/client";
import { useTheme } from "../hooks/useTheme";
import { formatoMoneda } from "../utils/moneda";
import "./ReservaPublica.css";

/**
 * Pago — página PÚBLICA de pago del adelanto (motor de reservas).
 * En SANDBOX no hay pasarela real: esta pantalla ES el "checkout" simulado —
 * consulta el estado del pago y permite simular aprobado/rechazado (que dispara
 * el webhook y, si aprueba, auto-confirma el adelanto de la reserva).
 * En producción (Fase 2) se reemplaza por el checkout real de Mercado Pago.
 */
function leerParams() {
  const h = window.location.hash; // #/pago?ext=...&ref=...
  const q = h.includes("?") ? h.slice(h.indexOf("?") + 1) : "";
  const p = new URLSearchParams(q);
  return { ext: p.get("ext") || "" };
}

export default function Pago() {
  useTheme();
  const [{ ext }] = useState(leerParams);
  const [estado, setEstado] = useState(null);
  const [monto, setMonto] = useState(null);
  const [moneda, setMoneda] = useState("PEN");
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState(null);

  const fmt = (x) => (x != null ? formatoMoneda(x, moneda) : "");

  async function refrescar() {
    try {
      const r = await api.publicoEstadoPago(ext);
      setEstado(r.estado);
      setMonto(r.monto);
      setMoneda(r.moneda || "PEN");
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (!ext) {
      setError("Falta el identificador del pago.");
      setCargando(false);
      return;
    }
    refrescar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ext]);

  async function simular(nuevo) {
    setProcesando(true);
    setError(null);
    try {
      await api.publicoWebhookSandbox(ext, nuevo);
      await refrescar();
    } catch (e) {
      setError(e.message);
    } finally {
      setProcesando(false);
    }
  }

  const volver = () => {
    window.location.hash = "/";
  };

  if (cargando) return <div className="pub__centro">Cargando…</div>;

  return (
    <div className="pub">
      <div className="pub__card">
        {!ext || (error && estado == null) ? (
          <div className="pub__exito">
            <XCircle size={48} className="pago__icono-error" />
            <h1>No pudimos cargar el pago</h1>
            <p className="pub__nota">{error || "Enlace de pago inválido."}</p>
          </div>
        ) : estado === "aprobado" ? (
          <div className="pub__exito">
            <CheckCircle2 size={56} className="pub__exito-icono" />
            <h1>¡Pago aprobado!</h1>
            <p className="pub__exito-detalle">{fmt(monto)}</p>
            <p className="pub__nota">
              Tu adelanto quedó registrado y la reserva <strong>confirmada</strong>.
            </p>
          </div>
        ) : estado === "rechazado" ? (
          <div className="pub__exito">
            <XCircle size={56} className="pago__icono-error" />
            <h1>Pago rechazado</h1>
            <p className="pub__nota">No se pudo procesar. Puedes intentarlo de nuevo.</p>
            {error && <p className="pub__error" role="alert">{error}</p>}
            <div className="pub__acciones">
              <Button type="button" onClick={() => simular("aprobado")} disabled={procesando}>
                {procesando ? "Procesando…" : "Reintentar"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="pago__checkout">
            <span className="pago__badge">Modo prueba · sandbox</span>
            <h1 className="pago__titulo">
              <CreditCard size={22} aria-hidden="true" /> Pago del adelanto
            </h1>
            <p className="pago__monto">{fmt(monto)}</p>
            <p className="pub__nota">
              Este es un checkout de <strong>prueba</strong> (aún sin pasarela real).
              Simula el resultado para ver el flujo completo:
            </p>
            {error && <p className="pub__error" role="alert">{error}</p>}
            <div className="pub__acciones pago__acciones">
              <Button
                type="button"
                variant="secondary"
                onClick={() => simular("rechazado")}
                disabled={procesando}
              >
                Simular rechazo
              </Button>
              <Button type="button" onClick={() => simular("aprobado")} disabled={procesando}>
                {procesando ? "Procesando…" : "Simular pago aprobado"}
              </Button>
            </div>
          </div>
        )}
        <button type="button" className="pago__volver" onClick={volver}>
          Volver al inicio
        </button>
        <footer className="pub__footer">Pagos con Vantry</footer>
      </div>
    </div>
  );
}
