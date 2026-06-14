import { useState } from "react";
import { RouterProvider, useRuta } from "./router/Router";
import { useAuth } from "./auth/AuthContext";
import Login from "./auth/Login";
import Registro from "./auth/Registro";
import AppShell from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import Reservas from "./pages/reservas/Reservas";
import Calendario from "./pages/calendario/Calendario";
import Recepcion from "./pages/recepcion/Recepcion";
import Habitaciones from "./pages/habitaciones/Habitaciones";
import Huespedes from "./pages/huespedes/Huespedes";
import Facturas from "./pages/facturas/Facturas";
import Reportes from "./pages/reportes/Reportes";
import Usuarios from "./pages/usuarios/Usuarios";
import Hospedajes from "./pages/hospedajes/Hospedajes";
import AsistenteBienvenida from "./components/AsistenteBienvenida";

/**
 * Vista — decide que pantalla renderizar segun la ruta actual.
 * "usuarios" requiere admin; "hospedajes" requiere superadmin
 * (defensa tambien en el backend).
 */
function Vista() {
  const { ruta } = useRuta();
  const { esAdmin, esSuperadmin } = useAuth();

  // El superadmin (dueño del SaaS) solo opera el panel Hospedajes; no tiene
  // hospedaje propio, así que cualquier ruta operativa lo lleva a Hospedajes.
  if (esSuperadmin) {
    return <Hospedajes />;
  }

  switch (ruta) {
    case "dashboard":
      return <Dashboard />;
    case "reservas":
      return <Reservas />;
    case "calendario":
      return <Calendario />;
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
    case "hospedajes":
      return esSuperadmin ? <Hospedajes /> : <Dashboard />;
    default:
      return <Dashboard />;
  }
}

/**
 * Acceso — alterna entre iniciar sesión y registro (onboarding self-service).
 */
function Acceso() {
  const [vista, setVista] = useState("login"); // 'login' | 'registro'
  if (vista === "registro") {
    return <Registro onIrALogin={() => setVista("login")} />;
  }
  return <Login onIrARegistro={() => setVista("registro")} />;
}

/**
 * App — raiz: si no hay sesion muestra Login/Registro; si la hay, la app.
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
    return <Acceso />;
  }

  return (
    <RouterProvider>
      <AppShell>
        <Vista />
      </AppShell>
      <BienvenidaGate />
    </RouterProvider>
  );
}

/**
 * BienvenidaGate — muestra el asistente de bienvenida la PRIMERA vez que un
 * admin (no superadmin) entra. Se recuerda por usuario en localStorage para
 * no volver a mostrarlo. Va dentro de RouterProvider porque el asistente
 * navega entre secciones.
 */
function BienvenidaGate() {
  const { usuario, esSuperadmin } = useAuth();
  const clave = usuario ? `pms-bienvenida-${usuario.id}` : null;
  const [mostrar, setMostrar] = useState(
    () => !!clave && !esSuperadmin && localStorage.getItem(clave) !== "1"
  );

  if (!mostrar || esSuperadmin) return null;

  function cerrar() {
    if (clave) localStorage.setItem(clave, "1");
    setMostrar(false);
  }

  return <AsistenteBienvenida onCerrar={cerrar} />;
}
