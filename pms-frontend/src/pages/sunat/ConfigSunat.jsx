import { nfMoneda } from "../../utils/moneda";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Field from "../../components/Field";
import StateMessage from "../../components/StateMessage";
import { abrirComprobantePdf } from "../../utils/pdf";
import "./ConfigSunat.css";

const formatoMoneda = nfMoneda({
  style: "currency",
  currency: "PEN",
});

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre",
];
const nombreMes = (mesKey) => {
  const [a, m] = mesKey.split("-");
  return `${MESES[Number(m) - 1] || m} ${a}`;
};

// Presentación del estado real del comprobante (no solo color).
function estadoComprobante(c) {
  if (c.modo !== "produccion") return { tone: "neutral", icon: "•", label: "Demo" };
  if (c.estado === "aceptado") return { tone: "success", icon: "✓", label: "SUNAT" };
  if (c.estado === "rechazado") return { tone: "danger", icon: "✕", label: "Rechazado" };
  if (c.estado === "anulado") return { tone: "neutral", icon: "–", label: "Anulado" };
  return { tone: "warning", icon: "⏳", label: "Pendiente" };
}

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
    if (form.ruc.trim() && !/^\d{11}$/.test(form.ruc.trim())) {
      setError("El RUC debe tener 11 dígitos.");
      return;
    }
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

  // ---------- Emisor colapsable (recuerda su estado) ----------
  const [emisorColapsado, setEmisorColapsado] = useState(() => {
    const v = localStorage.getItem("pms-emisor-colapsado");
    return v === null ? null : v === "1";
  });
  // Semilla: si ya hay RUC configurado, arranca colapsado (no estorba); si está
  // vacío, expandido para guiar a completarlo la primera vez.
  useEffect(() => {
    if (config.data && emisorColapsado === null) {
      setEmisorColapsado(!!config.data.ruc);
    }
  }, [config.data, emisorColapsado]);
  function toggleEmisor() {
    setEmisorColapsado((v) => {
      const nv = !v;
      localStorage.setItem("pms-emisor-colapsado", nv ? "1" : "0");
      return nv;
    });
  }
  const emisorAbierto = emisorColapsado === false || emisorColapsado === null;

  // ---------- Árbol Año → Mes → Comprobantes ----------
  const [colapsados, setColapsados] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("pms-comprobantes-colapsados") || "[]"));
    } catch {
      return new Set();
    }
  });
  function toggleNodo(key) {
    setColapsados((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      localStorage.setItem("pms-comprobantes-colapsados", JSON.stringify([...n]));
      return n;
    });
  }

  const arbol = useMemo(() => {
    const items = comprobantes.data || [];
    const porAnio = new Map();
    for (const c of items) {
      const f = String(c.fecha_emision || "").slice(0, 10);
      const anio = f.slice(0, 4) || "—";
      const mesKey = f.slice(0, 7) || "—";
      if (!porAnio.has(anio)) porAnio.set(anio, { anio, total: 0, count: 0, meses: new Map() });
      const A = porAnio.get(anio);
      A.total += c.total || 0;
      A.count += 1;
      if (!A.meses.has(mesKey)) A.meses.set(mesKey, { mesKey, total: 0, count: 0, items: [] });
      const M = A.meses.get(mesKey);
      M.total += c.total || 0;
      M.count += 1;
      M.items.push(c);
    }
    return [...porAnio.values()]
      .sort((a, b) => b.anio.localeCompare(a.anio))
      .map((A) => ({
        ...A,
        meses: [...A.meses.values()].sort((a, b) => b.mesKey.localeCompare(a.mesKey)),
      }));
  }, [comprobantes.data]);

  // Semilla (una vez): colapsa todo salvo el año y el mes en curso.
  const seedRef = useRef(false);
  useEffect(() => {
    if (seedRef.current || !arbol.length) return;
    if (localStorage.getItem("pms-comprobantes-colapsados") === null) {
      const now = new Date();
      const anioActual = String(now.getFullYear());
      const mesActual = `${anioActual}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const colap = new Set();
      for (const A of arbol) {
        if (A.anio !== anioActual) colap.add(A.anio);
        for (const M of A.meses) if (M.mesKey !== mesActual) colap.add(M.mesKey);
      }
      setColapsados(colap);
      localStorage.setItem("pms-comprobantes-colapsados", JSON.stringify([...colap]));
    }
    seedRef.current = true;
  }, [arbol]);

  function exportarMes(M) {
    const cab = ["Numero", "Tipo", "Cliente", "TipoDoc", "NumDoc", "Fecha", "OpGravada", "IGV", "Total", "Estado", "Modo"];
    const filas = [cab];
    for (const c of M.items) {
      filas.push([
        c.numero, c.tipo, c.cliente_nombre, c.cliente_tipo_doc, c.cliente_num_doc,
        c.fecha_emision, c.op_gravada, c.igv, c.total, c.estado, c.modo,
      ]);
    }
    const csv = filas
      .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comprobantes-${M.mesKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="sunat">
      {/* Aviso del modo actual */}
      <div className="sunat__aviso">
        <strong>Modo demo (sandbox).</strong> Las boletas que emitas son de{" "}
        <strong>prueba</strong>, sin valor tributario. Cuando tengas tu RUC y un
        proveedor autorizado, conectamos el envío real a SUNAT y empiezan a tener validez.
      </div>

      {/* ---------- Datos del emisor (colapsable) ---------- */}
      <Card padding="none" className="sunat__emisor-card">
        <button
          type="button"
          className="sunat__emisor-header"
          aria-expanded={emisorAbierto}
          onClick={toggleEmisor}
        >
          <ChevronRight
            size={18}
            className={`sunat__chevron ${emisorAbierto ? "is-open" : ""}`}
            aria-hidden="true"
          />
          <span className="sunat__emisor-titulo">Datos del emisor</span>
          {!emisorAbierto && config.data && (
            <span className="sunat__emisor-resumen">
              RUC {config.data.ruc || "—"} · Serie {config.data.serie_boleta || "B001"} ·{" "}
              {config.data.activo ? "Activo" : "Inactivo"}
            </span>
          )}
        </button>

        <div className={`sunat__emisor-wrap ${emisorAbierto ? "" : "is-collapsed"}`}>
          <div className="sunat__emisor-inner">
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

                <Field id="direccion" label="Domicilio fiscal (opcional)">
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
                    Activar la emisión de comprobantes
                    <span className="sunat__check-hint"> (necesita RUC y razón social)</span>
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
          </div>
        </div>
      </Card>

      {/* ---------- Comprobantes emitidos (árbol Año → Mes) ---------- */}
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

        {arbol.map((A) => {
          const anioColapsado = colapsados.has(A.anio);
          return (
            <div key={A.anio} className="sunat__anio">
              <button
                type="button"
                className="sunat__anio-header"
                aria-expanded={!anioColapsado}
                onClick={() => toggleNodo(A.anio)}
              >
                <ChevronRight
                  size={18}
                  className={`sunat__chevron ${anioColapsado ? "" : "is-open"}`}
                  aria-hidden="true"
                />
                <span className="sunat__anio-titulo">{A.anio}</span>
                <span className="sunat__nodo-meta">
                  {A.count} comprobante{A.count !== 1 ? "s" : ""} · {formatoMoneda.format(A.total)}
                </span>
              </button>

              <div className={`sunat__anio-wrap ${anioColapsado ? "is-collapsed" : ""}`}>
                <div className="sunat__anio-items">
                  {A.meses.map((M) => {
                    const mesColapsado = colapsados.has(M.mesKey);
                    return (
                      <div key={M.mesKey} className="sunat__mes">
                        <div className="sunat__mes-barra">
                          <button
                            type="button"
                            className="sunat__mes-header"
                            aria-expanded={!mesColapsado}
                            onClick={() => toggleNodo(M.mesKey)}
                          >
                            <ChevronRight
                              size={16}
                              className={`sunat__chevron ${mesColapsado ? "" : "is-open"}`}
                              aria-hidden="true"
                            />
                            <span className="sunat__mes-titulo">{nombreMes(M.mesKey)}</span>
                            <span className="sunat__nodo-meta">
                              {M.count} · {formatoMoneda.format(M.total)}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="sunat__export"
                            onClick={() => exportarMes(M)}
                            title={`Exportar ${nombreMes(M.mesKey)} a CSV`}
                          >
                            Exportar CSV
                          </button>
                        </div>

                        <div className={`sunat__mes-wrap ${mesColapsado ? "is-collapsed" : ""}`}>
                          <div className="sunat__mes-items">
                            {/* Render diferido: solo se montan los ítems del mes abierto. */}
                            {!mesColapsado &&
                              M.items.map((c) => {
                                const est = estadoComprobante(c);
                                return (
                                  <Card key={c.id} padding="sm" className="comprobante-item">
                                    <div className="comprobante-item__main">
                                      <div className="comprobante-item__top">
                                        <span className="comprobante-item__num">{c.numero}</span>
                                        <Badge tone={est.tone} icon={est.icon}>{est.label}</Badge>
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
                                );
                              })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
