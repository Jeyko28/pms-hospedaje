import "./Badge.css";

/**
 * Badge — etiqueta de estado.
 *
 * Regla de accesibilidad (WCAG 1.4.1 "Uso del color"): el estado NUNCA se
 * comunica solo con color. Cada badge muestra SIEMPRE un icono + un texto,
 * de modo que una persona con daltonismo o en escala de grises lo entiende.
 *
 * Props:
 *   tone:  "success" | "warning" | "danger" | "info" | "neutral"
 *   icon:  caracter/emoji corto que refuerza el significado
 *   children: el texto del estado
 */
export default function Badge({ tone = "neutral", icon = null, children }) {
  return (
    <span className={`badge badge--${tone}`}>
      {icon && (
        <span className="badge__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="badge__label">{children}</span>
    </span>
  );
}
