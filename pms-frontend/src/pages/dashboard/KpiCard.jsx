import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import Card from "../../components/Card";
import "./widgets.css";

/**
 * KpiCard — tarjeta de indicador con valor, tendencia (vs mes anterior) y un
 * mini-gráfico a la derecha. Es el patrón superior del dashboard.
 *
 * Props: title, value, trendPct (opcional), hint (opcional), chart (nodo).
 */
export default function KpiCard({ title, value, trendPct, hint, chart }) {
  const hasTrend = trendPct !== undefined && trendPct !== null;
  const up = (trendPct || 0) >= 0;

  return (
    <Card padding="md" className="kpi">
      <div className="kpi__main">
        <p className="kpi__title">{title}</p>
        <p className="kpi__value">{value}</p>
        <div className="kpi__sub">
          {hasTrend && (
            <span className={`kpi__trend kpi__trend--${up ? "up" : "down"}`}>
              {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(trendPct)}%
            </span>
          )}
          {hint && <span className="kpi__hint">{hint}</span>}
        </div>
      </div>
      {chart && <div className="kpi__chart">{chart}</div>}
    </Card>
  );
}
