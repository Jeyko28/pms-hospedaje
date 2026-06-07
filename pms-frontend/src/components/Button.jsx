import "./Button.css";

/**
 * Button — boton del sistema.
 *
 * Props:
 *   variant: "primary" | "secondary" | "ghost" | "danger"  (default "primary")
 *   size:    "md" | "sm"                                    (default "md")
 *   icon:    nodo opcional (emoji o svg) que se muestra antes del texto
 *   ...rest: cualquier prop nativa de <button> (onClick, type, disabled, aria-*)
 *
 * Accesibilidad: altura minima de 44px (target tactil), foco visible heredado
 * de global.css. Si el boton es solo icono, pasa aria-label.
 */
export default function Button({
  variant = "primary",
  size = "md",
  icon = null,
  children,
  className = "",
  ...rest
}) {
  const classes = ["btn", `btn--${variant}`, `btn--${size}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} {...rest}>
      {icon && (
        <span className="btn__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}
