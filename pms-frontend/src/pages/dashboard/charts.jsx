import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

/**
 * Gráficos del dashboard (Recharts). Los colores se pasan como CSS variables
 * para que adapten automáticamente al modo claro/oscuro.
 */
export const C = {
  brand: "var(--color-brand-600)",
  success: "var(--color-success-600)",
  warning: "var(--color-warning-600)",
  danger: "var(--color-danger-600)",
  neutral: "var(--color-neutral-400)",
  grid: "var(--border-default)",
  axis: "var(--text-muted)",
};

const ejeProps = {
  tick: { fill: "var(--text-muted)", fontSize: 11 },
  axisLine: { stroke: "var(--border-default)" },
  tickLine: false,
};

// Tooltip con superficie del sistema (se ve bien en claro y oscuro).
const tooltipProps = {
  contentStyle: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: 10,
    fontSize: 12,
    color: "var(--text-primary)",
    boxShadow: "var(--shadow-md)",
  },
  labelStyle: { color: "var(--text-secondary)" },
  cursor: { fill: "var(--bg-subtle)", opacity: 0.5 },
};

/* ---------------- Mini-gráficos para las KPI cards ----------------
 * Sparklines en SVG INLINE (no Recharts): deterministas, nunca se desbordan
 * sobre el número (el dato es el protagonista), livianos y degradan bien con
 * pocos o cero puntos. El color se pasa vía la propiedad CSS `color` + los
 * elementos usan `currentColor`, así se adaptan solos al modo claro/oscuro.
 */
const TONO = {
  brand: "var(--color-brand-600)",
  success: "var(--color-success-600)",
  danger: "var(--color-danger-600)",
  neutral: "var(--color-neutral-400)",
};

// Extrae valores numéricos de datos [{campo}] o [numeros].
function _valores(data, campos) {
  return (data || []).map((d) => {
    if (typeof d === "number") return d;
    for (const c of campos) if (d && d[c] != null) return Number(d[c]) || 0;
    return 0;
  });
}

// Sparkline de área (línea + relleno suave). Reemplaza a MiniLine.
export function MiniLine({ data, tone = "success", width = 96, height = 40 }) {
  const vals = _valores(data, ["total", "value", "n"]);
  if (vals.length === 0) return <div style={{ height }} aria-hidden="true" />;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = max - min || 1;
  const pad = 3;
  const h = height - pad * 2;
  const n = vals.length;
  const xAt = (i) => (n > 1 ? (i * width) / (n - 1) : width / 2);
  const yAt = (v) => pad + h - ((v - min) / range) * h;
  const pts = vals.map((v, i) => [xAt(i), yAt(v)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = n > 1 ? `${line} L ${width} ${height} L 0 ${height} Z` : "";
  const gid = `spark-${tone}`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ display: "block", color: TONO[tone] || TONO.success, overflow: "hidden" }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#${gid})`} />}
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// Alias semántico por si se quiere usar el nombre "Sparkline".
export const Sparkline = MiniLine;

// Mini barras en SVG inline (última barra resaltada). Reemplaza a SparkBars.
export function SparkBars({ data, tone = "brand", width = 96, height = 40 }) {
  const vals = _valores(data, ["n", "value", "total"]);
  if (vals.length === 0) return <div style={{ height }} aria-hidden="true" />;
  const max = Math.max(...vals, 1);
  const n = vals.length;
  const gap = n > 24 ? 1 : 2;
  const bw = Math.max(1, (width - gap * (n - 1)) / n);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ display: "block", color: TONO[tone] || TONO.brand, overflow: "hidden" }}
    >
      {vals.map((v, i) => {
        const bh = Math.max(2, (v / max) * (height - 2));
        const x = i * (bw + gap);
        return (
          <rect
            key={i}
            x={x.toFixed(1)}
            y={(height - bh).toFixed(1)}
            width={bw.toFixed(1)}
            height={bh.toFixed(1)}
            rx="1.5"
            fill="currentColor"
            opacity={i === n - 1 ? 1 : 0.45}
          />
        );
      })}
    </svg>
  );
}

// Pie/donut pequeño. segments = [{ name, value, color }]; inner>0 => donut.
export function MiniPie({ segments, inner = 0 }) {
  const datos = (segments || []).filter((s) => s.value > 0);
  const vacio = datos.length === 0;
  const finales = vacio ? [{ name: "—", value: 1, color: "var(--border-default)" }] : datos;
  return (
    <ResponsiveContainer width="100%" height={60}>
      <PieChart>
        <Pie
          data={finales}
          dataKey="value"
          innerRadius={inner}
          outerRadius={28}
          paddingAngle={vacio ? 0 : 2}
          stroke="none"
          isAnimationActive={false}
        >
          {finales.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Pie>
        {!vacio && <Tooltip {...tooltipProps} />}
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ---------------- Gráficos grandes ---------------- */

// Reservas por día del mes: Booked (apilado) vs Cancelled.
export function ReservationChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
        <XAxis dataKey="dia" {...ejeProps} />
        <YAxis allowDecimals={false} {...ejeProps} />
        <Tooltip {...tooltipProps} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="booked" name="Reservadas" stackId="a" fill={C.brand} radius={[0, 0, 0, 0]} />
        <Bar dataKey="cancelled" name="Canceladas" stackId="a" fill={C.warning} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Origen de reservas por mes: Online (link público) vs Offline (recepción).
export function BookingSourceChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
        <XAxis dataKey="label" {...ejeProps} />
        <YAxis allowDecimals={false} {...ejeProps} />
        <Tooltip {...tooltipProps} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="online" name="Online (link)" stroke={C.brand} strokeWidth={2.5} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="offline" name="Recepción" stroke={C.neutral} strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Ingresos cobrados por día del mes (línea).
export function IngresosChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
        <XAxis dataKey="dia" {...ejeProps} />
        <YAxis width={56} tickFormatter={(v) => `S/${v}`} {...ejeProps} />
        <Tooltip {...tooltipProps} formatter={(v) => [`S/ ${v}`, "Cobrado"]} labelFormatter={(d) => `Día ${d}`} />
        <Line type="monotone" dataKey="total" name="Cobrado" stroke={C.success} strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Visitas al link público por día de la semana.
export function VisitorsChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
        <XAxis dataKey="label" {...ejeProps} />
        <YAxis allowDecimals={false} {...ejeProps} />
        <Tooltip {...tooltipProps} />
        <Bar dataKey="n" name="Visitas" fill={C.brand} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
