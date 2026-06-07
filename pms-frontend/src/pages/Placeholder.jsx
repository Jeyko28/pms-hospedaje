import Card from "../components/Card";
import StateMessage from "../components/StateMessage";

/**
 * Placeholder — pantalla temporal para secciones aun no construidas.
 * Comunica claramente que la seccion existe pero esta en camino
 * (heuristica: visibilidad del estado del sistema), en vez de un 404 confuso.
 */
export default function Placeholder({ titulo }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <h1>{titulo}</h1>
      <Card>
        <StateMessage
          variant="empty"
          title="Seccion en construccion"
          message="Esta pantalla se conectara en la siguiente fase. La logica ya existe en el backend."
        />
      </Card>
    </div>
  );
}
