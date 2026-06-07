import { RouterProvider, useRuta } from "./router/Router";
import { useAuth } from "./auth/AuthContext";
import Login from "./auth/Login";
import AppShell from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import Reservas from "./pages/reservas/Reservas";
import Recepcion from "./pages/recepcion/Recepcion";
import Habitaciones from "./pages/habitaciones/Habitaciones";
import Huespedes from "./pages/huespedes/Huespedes";
import Facturas from "./pages/facturas/Facturas";
import Reportes from "./pages/reportes/Reportes";
import Usuarios from "./pages/usuarios/Usuarios";

/**
 * Vista — decide que pantalla renderizar segun la ruta actual.
 * "usuarios" solo es accesible para admin (defensa tambien en el backend).
 */
function Vista() {
  const { ruta } = useRuta();
  const { esAdmin } = useAuth();

  switch (ruta) {
    case "dashboard":
      return <Dashboard />;
    case "reservas":
      return <Reservas />;
    case "recepcion":
      return <Recepcion />;
    case "habitaciones":
      return <Habitaciones />;
    case "huespedes":
      return <Huespedes />;
    case "facturas":
      return <Facturas />;
    case "reportes":
      return <Reportes />;
    case "usuarios":
      return esAdmin ? <Usuarios /> : <Dashboard />;
    default:
      return <Dashboard />;
  }
}

/**
 * App — raiz: si no hay sesion muestra Login; si la hay, la app completa.
 */
export default function App() {
  const { usuario, cargando } = useAuth();

  // Mientras se valida el token guardado, evitar parpadeo de Login.
  if (cargando) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          color: "var(--text-muted)",
          backgroundColor: "var(--bg-app)",
        }}
      >
        Cargando…
      </div>
    );
  }

  if (!usuario) {
    return <Login />;
  }

  return (
    <RouterProvider>
      <AppShell>
        <Vista />
      </AppShell>
    </RouterProvider>
  );
}
