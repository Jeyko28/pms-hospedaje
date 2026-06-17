import { useMemo, useState } from "react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import StateMessage from "../../components/StateMessage";
import Field from "../../components/Field";
import { abrirFacturaPdf } from "../../utils/pdf";
import "../entidades.css";
import "./Facturas.css";

const formatoMoneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

const formatoFecha = (iso) => {
  if (!iso) return "—";
  // fecha_emision viene como "YYYY-MM-DD HH:MM:SS"; tomamos solo la fecha.
  const soloFecha = String(iso).slice(0, 10);
  const d = new Date(soloFecha + "T00:00:00");
  if (isNaN(d)) return soloFecha;
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// Presentacion del estado de la factura (no solo color: icono + texto).
function estadoFactura(estado, saldo) {
  if (estado === "pagada" || saldo <= 0)
    return { tone: "success", icon: "✓", label: "Pagada" };
  return { tone: "warning", icon: "!", label: "Pendiente" };
}

export default function Facturas() {
  const facturas = useApi(api.facturas);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todas");

  const filtradas = useMemo(() => {
    if (!facturas.data) return [];
    const t = busqueda.trim().toLowerCase();
    return facturas.data.filter((f) => {
      const texto =
        !t ||
        f.huesped.toLowerCase().includes(t) ||
        String(f.habitacion).toLowerCase().includes(t) ||
        String(f.id).includes(t);
      const pagada = f.estado === "pagada" || f.saldo <= 0;
      const estado =
        filtro === "todas" ||
        (filtro === "pagadas" && pagada) ||
        (filtro === "pendientes" && !pagada);
      return texto && estado;
    });
  }, [facturas.data, busqueda, filtro]);

  // Total facturado y total cobrado (resumen rapido del historial).
  const resumen = useMemo(() => {
    if (!facturas.data) return { facturado: 0, cobrado: 0, pendiente: 0 };
    let facturado = 0,
      cobrado = 0;
    for (const f of facturas.data) {
      facturado += f.total || 0;
      cobrado += f.pagado || 0;
    }
    return {
      facturado,
      cobrado,
      pendiente: Math.round((facturado - cobrado) * 100) / 100,
    };
  }, [facturas.data]);

  return (
    <div className="entidad">
      <header className="entidad__head">
        <div>
          <h1>Facturas</h1>
          <p className="entidad__subtitle">
            Historial de facturación de tu hospedaje.
          </p>
        </div>
      </header>

      {/* Resumen rapido */}
      {facturas.data && facturas.data.length > 0 && (
        <div className="facturas__resumen">
          <Card padding="sm" className="facturas__resumen-item">
            <span className="facturas__resumen-label">Total facturado</span>
            <span className="facturas__resumen-valor">
              {formatoMoneda.format(resumen.facturado)}
            </span>
          </Card>
          <Card padding="sm" className="facturas__resumen-item">
            <span className="facturas__resumen-label">Cobrado</span>
            <span className="facturas__resumen-valor facturas__resumen-valor--ok">
              {formatoMoneda.format(resumen.cobrado)}
            </span>
          </Card>
          <Card padding="sm" className="facturas__resumen-item">
            <span className="facturas__resumen-label">Por cobrar</span>
            <span className="facturas__resumen-valor facturas__resumen-valor--warn">
              {formatoMoneda.format(resumen.pendiente)}
            </span>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <Card padding="sm" className="facturas__filtros">
        <div className="facturas__buscar">
          <Field id="buscar" label="Buscar">
            <input
              id="buscar"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Huésped, habitación o n.º de factura…"
            />
          </Field>
        </div>
        <Field id="estado" label="Estado">
          <select
            id="estado"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          >
            <option value="todas">Todas</option>
            <option value="pagadas">Pagadas</option>
            <option value="pendientes">Pendientes</option>
          </select>
        </Field>
      </Card>

      {/* Estados */}
      {facturas.loading && (
        <Card>
          <StateMessage variant="loading" title="Cargando facturas…" />
        </Card>
      )}

      {facturas.error && (
        <Card>
          <StateMessage
            variant="error"
            title="No se pudieron cargar las facturas"
            message={facturas.error}
            action={
              <Button variant="secondary" onClick={facturas.recargar}>
                Reintentar
              </Button>
            }
          />
        </Card>
      )}

      {facturas.data && filtradas.length === 0 && (
        <Card>
          <StateMessage
            variant="empty"
            title={
              facturas.data.length === 0
                ? "Aún no hay facturas"
                : "Sin resultados"
            }
            message={
              facturas.data.length === 0
                ? "Las facturas se generan al hacer un check-in en Recepción."
                : "Prueba con otra búsqueda o cambia el filtro."
            }
          />
        </Card>
      )}

      {/* Lista */}
      {filtradas.length > 0 && (
        <div className="facturas__lista">
          {filtradas.map((f) => {
            const est = estadoFactura(f.estado, f.saldo);
            return (
              <Card key={f.id} padding="sm" className="factura-item">
                <div className="factura-item__main">
                  <div className="factura-item__top">
                    <span className="factura-item__num">Factura #{f.id}</span>
                    <Badge tone={est.tone} icon={est.icon}>
                      {est.label}
                    </Badge>
                  </div>
                  <span className="factura-item__huesped">{f.huesped}</span>
                  <div className="factura-item__meta">
                    <span>Hab. {f.habitacion}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatoFecha(f.fecha_emision)}</span>
                  </div>
                </div>

                <div className="factura-item__lado">
                  <span className="factura-item__total">
                    {formatoMoneda.format(f.total || 0)}
                  </span>
                  {f.saldo > 0 && (
                    <span className="factura-item__saldo">
                      Saldo {formatoMoneda.format(f.saldo)}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="📄"
                    onClick={() => abrirFacturaPdf(f.id)}
                  >
                    PDF
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
