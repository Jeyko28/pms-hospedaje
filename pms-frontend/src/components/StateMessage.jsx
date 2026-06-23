import "./StateMessage.css";

/**
 * StateMessage — mensaje para los estados de carga, vacio y error.
 *
 * Por que existe: la heuristica de Nielsen "visibilidad del estado del
 * sistema" exige que el usuario siempre sepa que esta pasando. En vez de
 * dejar la pantalla en blanco, mostramos un mensaje claro y, si aplica,
 * una accion para recuperarse (ej. "Reintentar").
 *
 * Props:
 *   variant: "loading" | "empty" | "error"
 *   title:   titulo corto
 *   message: descripcion
 *   action:  nodo opcional (ej. un <Button>) para reintentar
 */
export default function StateMessage({ variant = "loading", title, message, action }) {
  const iconos = {
    loading: "⏳",
    empty: "📭",
    error: "⚠️",
  };

  return (
    <div
      className="state"
      role={variant === "error" ? "alert" : "status"}
      aria-busy={variant === "loading" || undefined}
    >
      {variant === "loading" ? (
        <span className="state__spinner" aria-hidden="true" />
      ) : (
        <div className="state__icon" aria-hidden="true">
          {iconos[variant]}
        </div>
      )}
      {title && <p className="state__title">{title}</p>}
      {message && <p className="state__message">{message}</p>}
      {action && <div className="state__action">{action}</div>}
    </div>
  );
}
