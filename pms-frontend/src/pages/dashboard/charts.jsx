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

/* ---------------- Mini-gráficos para las KPI cards ---------------- */

export function SparkBars({ data }) {
  return (
    <ResponsiveContainer width="100%" height={52}>
      <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <Bar dataKey="n" fill={C.brand} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MiniLine({ data }) {
  return (
    <ResponsiveContainer width="100%" height={52}>
      <LineChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
        <Line type="monotone" dataKey="total" stroke={C.success} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
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
