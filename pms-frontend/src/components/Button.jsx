import "./Button.css";

/**
 * Button — boton del sistema.
 *
 * Props:
 *   variant: "primary" | "secondary" | "ghost" | "danger"  (default "primary")
 *   size:    "md" | "sm"                                    (default "md")
 *   icon:    nodo opcional (emoji o svg) que se muestra antes del texto
 *   loading: si es true muestra un spinner, deshabilita el boton y marca
 *            aria-busy (evita doble envío y comunica que algo está en curso)
 *   ...rest: cualquier prop nativa de <button> (onClick, type, disabled, aria-*)
 *
 * Accesibilidad: altura minima de 44px (target tactil), foco visible heredado
 * de global.css. Si el boton es solo icono, pasa aria-label.
 */
export default function Button({
  variant = "primary",
  size = "md",
  icon = null,
  loading = false,
  disabled = false,
  children,
  className = "",
  ...rest
}) {
  const classes = [
    "btn",
    `btn--${variant}`,
    `btn--${size}`,
    loading && "btn--loading",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="btn__spinner" aria-hidden="true" />
      ) : (
        icon && (
          <span className="btn__icon" aria-hidden="true">
            {icon}
          </span>
        )
      )}
      {children}
    </button>
  );
}
