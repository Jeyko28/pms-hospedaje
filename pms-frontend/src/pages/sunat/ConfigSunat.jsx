import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Field from "../../components/Field";
import StateMessage from "../../components/StateMessage";
import { abrirComprobantePdf } from "../../utils/pdf";
import "./ConfigSunat.css";

const formatoMoneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

const VACIO = {
  ruc: "",
  razon_social: "",
  direccion: "",
  serie_boleta: "B001",
  modo: "sandbox",
  activo: false,
};

export default function ConfigSunat() {
  const config = useApi(api.sunatConfig);
  const comprobantes = useApi(api.comprobantes);

  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);

  // Cargar la config existente en el formulario.
  useEffect(() => {
    if (config.data) {
      setForm({
        ruc: config.data.ruc || "",
        razon_social: config.data.razon_social || "",
        direccion: config.data.direccion || "",
        serie_boleta: config.data.serie_boleta || "B001",
        modo: config.data.modo || "sandbox",
        activo: !!config.data.activo,
      });
    }
  }, [config.data]);

  const set = (campo) => (e) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function guardar(ev) {
    ev.preventDefault();
    setError(null);
    setOk(false);
    setGuardando(true);
    try {
      await api.guardarSunatConfig(form);
      setOk(true);
      config.recargar();
      setTimeout(() => setOk(false), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="sunat">
      <header className="sunat__head" />

      {/* Aviso del modo actual */}
      <div className="sunat__aviso">
        <strong>Modo demo (sandbox).</strong> Las boletas que emitas son de{" "}
        <strong>prueba</strong>, sin valor tributario. Cuando tengas tu RUC y un
        proveedor autorizado, conectamos el envío real a SUNAT y empiezan a tener validez.
      </div>

      {/* ---------- Configuración del emisor ---------- */}
      <Card>
        <h2 className="sunat__card-title">Datos del emisor</h2>
        {config.loading && !config.data ? (
          <StateMessage variant="loading" title="Cargando configuración…" />
        ) : (
          <form className="sunat__form" onSubmit={guardar} noValidate>
            <div className="sunat__form-fila">
              <Field id="ruc" label="RUC">
                <input
                  id="ruc"
                  type="text"
                  inputMode="numeric"
                  maxLength={11}
                  value={form.ruc}
                  onChange={set("ruc")}
                  placeholder="11 dígitos"
                />
              </Field>
              <Field id="serie" label="Serie de boleta">
                <input
                  id="serie"
                  type="text"
                  value={form.serie_boleta}
                  onChange={set("serie_boleta")}
                  placeholder="B001"
                />
              </Field>
            </div>

            <Field id="razon" label="Razón social">
              <input
                id="razon"
                type="text"
                value={form.razon_social}
                onChange={set("razon_social")}
                placeholder="Nombre legal del hospedaje"
              />
            </Field>

            <Field id="direccion" label="Dirección (opcional)">
              <input
                id="direccion"
                type="text"
                value={form.direccion}
                onChange={set("direccion")}
                placeholder="Dirección fiscal"
              />
            </Field>

            <label className="sunat__check">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
              />
              <span>
                Activar la emisión de boletas
                <span className="sunat__check-hint">
                  {" "}
                  (necesita RUC y razón social)
                </span>
              </span>
            </label>

            {error && <p className="sunat__error" role="alert">{error}</p>}
            {ok && <p className="sunat__ok">Configuración guardada.</p>}

            <div className="sunat__acciones">
              <Button type="submit" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* ---------- Comprobantes emitidos ---------- */}
      <section className="sunat__section">
        <h2 className="sunat__card-title">Comprobantes emitidos</h2>

        {comprobantes.loading && (
          <Card><StateMessage variant="loading" title="Cargando…" /></Card>
        )}

        {comprobantes.data && comprobantes.data.length === 0 && (
          <Card>
            <StateMessage
              variant="empty"
              title="Aún no hay comprobantes"
              message="Emite un comprobante desde una cuenta pagada (sección Cuentas)."
            />
          </Card>
        )}

        {comprobantes.data && comprobantes.data.length > 0 && (
          <div className="sunat__lista">
            {comprobantes.data.map((c) => (
              <Card key={c.id} padding="sm" className="comprobante-item">
                <div className="comprobante-item__main">
                  <div className="comprobante-item__top">
                    <span className="comprobante-item__num">{c.numero}</span>
                    <Badge tone={c.estado === "aceptado" ? "success" : "warning"} icon="✓">
                      {c.modo === "produccion" ? "SUNAT" : "Demo"}
                    </Badge>
                  </div>
                  <span className="comprobante-item__cliente">{c.cliente_nombre}</span>
                  <span className="comprobante-item__meta">
                    {c.cliente_tipo_doc !== "SIN" ? `${c.cliente_tipo_doc} ${c.cliente_num_doc} · ` : ""}
                    {c.fecha_emision}
                  </span>
                </div>
                <div className="comprobante-item__lado">
                  <span className="comprobante-item__total">
                    {formatoMoneda.format(c.total || 0)}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="📄"
                    onClick={() => abrirComprobantePdf(c.id)}
                  >
                    Ver
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
