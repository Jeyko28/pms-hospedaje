/**
 * tokens.js
 * Espejo en JavaScript de los design tokens definidos en tokens.css.
 *
 * Sirve cuando necesitas un valor del sistema dentro de logica JS
 * (por ejemplo elegir un color de grafico). La fuente de verdad para
 * los estilos sigue siendo tokens.css; esto solo lo refleja.
 */

export const color = {
  brand: { 50: "#eff6ff", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8" },
  success: { 50: "#f0fdf4", 600: "#16a34a", 700: "#15803d" },
  warning: { 50: "#fffbeb", 600: "#d97706", 700: "#b45309" },
  danger: { 50: "#fef2f2", 600: "#dc2626", 700: "#b91c1c" },
  neutral: {
    0: "#ffffff",
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    900: "#0f172a",
  },
};

export const space = (n) => `${n * 0.25}rem`; // space(4) -> 1rem (16px)
