import "./Skeleton.css";

/**
 * Skeleton — bloque de carga con shimmer. Reserva el espacio del contenido
 * mientras llega, en vez de dejar la pantalla en blanco o saltar el layout
 * (mejor percepción de velocidad y estabilidad visual).
 *
 * Props: width, height, radius (cualquier valor CSS), className.
 */
export default function Skeleton({ width = "100%", height = 16, radius, className = "" }) {
  const style = {
    width,
    height: typeof height === "number" ? `${height}px` : height,
  };
  if (radius !== undefined) style.borderRadius = radius;
  return <span className={`skeleton ${className}`.trim()} style={style} aria-hidden="true" />;
}
