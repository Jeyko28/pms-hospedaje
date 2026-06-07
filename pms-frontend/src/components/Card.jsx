import "./Card.css";

/**
 * Card — contenedor de superficie con aire interior.
 * Es la unidad base de composicion: agrupa contenido relacionado
 * dándole un fondo, borde sutil y espaciado generoso (anti horror vacui).
 *
 * Props:
 *   as:      etiqueta a renderizar (default "div"; usa "section"/"article" segun semantica)
 *   padding: "md" (default) | "sm" | "none"
 */
export default function Card({
  as: Tag = "div",
  padding = "md",
  className = "",
  children,
  ...rest
}) {
  const classes = ["card", `card--pad-${padding}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
