import { useState, lazy, Suspense } from "react";
import { RouterProvider, useRuta } from "./router/Router";
import { useAuth } from "./auth/AuthContext";
import Login from "./auth/Login";
import Registro from "./auth/Registro";
import AppShell from "./components/AppShell";
import AsistenteBienvenida from "./components/AsistenteBienvenida";
import { ToastProvider } from "./components/Toast";
import ErrorBoundary from "./components/ErrorBoundary";

// Code-splitting por ruta: cada página se descarga al navegar a ella, no en la
// carga inicial. Reduce el bundle inicial (sobre todo Recharts en Dashboard/
// Reportes), clave en móvil/conexiones lentas.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Reservas = lazy(() => import("./pages/reservas/Reservas"));
const Calendario = lazy(() => import("./pages/calendario/Calendario"));
const Recepcion = lazy(() => import("./pages/recepcion/Recepcion"));
const Habitaciones = lazy(() => import("./pages/habitaciones/Habitaciones"));
const Housekeeping = lazy(() => import("./pages/housekeeping/Housekeeping"));
const Huespedes = lazy(() => import("./pages/huespedes/Huespedes"));
const Facturas = lazy(() => import("./pages/facturas/Facturas"));
const ConfigSunat = lazy(() => import("./pages/sunat/ConfigSunat"));
const Configuracion = lazy(() => import("./pages/configuracion/Configuracion"));
const Reportes = lazy(() => import("./pages/reportes/Reportes"));
const Usuarios = lazy(() => import("./pages/usuarios/Usuarios"));
const Hospedajes = lazy(() => import("./pages/hospedajes/Hospedajes"));
const Servicios = lazy(() => import("./pages/servicios/Servicios"));

/**
 * Vista — decide que pantalla renderizar segun la ruta actual.
 * "usuarios" requiere admin; "hospedajes" requiere superadmin
 * (defensa tambien en el backend).
 *
 * El contenido se envuelve en un div con key=ruta para que cada cambio de
 * sección entre con una transición sutil (fade + leve subida).
 */
function Vista() {
  const { ruta } = useRuta();
  const { esAdmin, esSuperadmin } = useAuth();

  // El superadmin (dueño del SaaS) solo opera el panel Hospedajes; no tiene
  // hospedaje propio, así que cualquier ruta operativa lo lleva a Hospedajes.
  let contenido;
  if (esSuperadmin) {
    contenido = <Hospedajes />;
  } else {
    switch (ruta) {
      case "dashboard":
        contenido = <Dashboard />;
        break;
      case "reservas":
        contenido = <Reservas />;
        break;
      case "calendario":
        contenido = <Calendario />;
        break;
      case "recepcion":
        contenido = <Recepcion />;
        break;
      case "habitaciones":
        contenido = <Habitaciones />;
        break;
      case "housekeeping":
        contenido = <Housekeeping />;
        break;
      case "huespedes":
        contenido = <Huespedes />;
        break;
      case "facturas":
        contenido = <Facturas />;
        break;
      case "sunat":
        contenido = esAdmin ? <ConfigSunat /> : <Dashboard />;
        break;
      case "configuracion":
        contenido = esAdmin ? <Configuracion /> : <Dashboard />;
        break;
      case "reportes":
        contenido = esAdmin ? <Reportes /> : <Dashboard />;
        break;
      case "usuarios":
        contenido = esAdmin ? <Usuarios /> : <Dashboard />;
        break;
      case "servicios":
        contenido = esAdmin ? <Servicios /> : <Dashboard />;
        break;
      case "hospedajes":
        contenido = esSuperadmin ? <Hospedajes /> : <Dashboard />;
        break;
      default:
        contenido = <Dashboard />;
    }
  }

  // ErrorBoundary keyada por ruta: si una sección falla, el menú sigue vivo y
  // al navegar a otra (cambia la key) la boundary se remonta y limpia el error.
  return (
    <ErrorBoundary key={esSuperadmin ? "hospedajes" : ruta}>
      <Suspense
        fallback={
          <div className="vista-fade" style={{ padding: "2rem", color: "var(--text-muted)" }}>
            Cargando…
          </div>
        }
      >
        <div className="vista-fade">{contenido}</div>
      </Suspense>
    </ErrorBoundary>
  );
}

/**
 * Acceso — alterna entre iniciar sesión y registro (onboarding self-service).
 * Si se llega con el hash #/registro (p. ej. desde la página de precios) abre
 * directo el registro; #/login (o cualquier otro) muestra el inicio de sesión.
 */
function Acceso() {
  const [vista, setVista] = useState(() =>
    /^#\/registro\b/.test(window.location.hash) ? "registro" : "login"
  );
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

  return (
    <ToastProvider>
      {!usuario ? (
        <Acceso />
      ) : (
        <RouterProvider>
          <AppShell>
            <Vista />
          </AppShell>
          <BienvenidaGate />
        </RouterProvider>
      )}
    </ToastProvider>
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
