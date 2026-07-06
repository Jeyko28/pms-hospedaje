import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./auth/AuthContext";
import { tokenStore } from "./api/client";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles/global.css";

// Code-splitting: cada vista grande se carga bajo demanda. Así un huésped que
// abre el link público (#/reservar/...) NO descarga toda la app de administración,
// y la app interna no carga el sitio público de marketing.
const App = lazy(() => import("./App"));
const ReservaPublica = lazy(() => import("./publico/ReservaPublica"));
const SitioWeb = lazy(() => import("./publico/sitio/SitioWeb"));

// Fallback mínimo mientras se descarga el chunk de la vista.
function Cargando() {
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

/**
 * Decide qué montar según la URL (todas PÚBLICAS, sin login ni AuthProvider):
 *  - #/reservar/<slug>  -> pagina publica de reservas del hospedaje (siempre).
 *  - rutas de marketing (raíz, #/inicio, #/funciones, #/precios, #/faq, #/contacto):
 *      -> sitio web SOLO si NO hay sesión; con token, cae a la app (dashboard).
 *  - #/login, #/registro y cualquier otra -> la app normal (con autenticacion).
 *
 * Efecto "front door": el visitante anónimo ve la web; el cliente logueado
 * entra directo al PMS.
 */
function leerRutaPublica() {
  const hash = window.location.hash;
  const m = hash.match(/^#\/reservar\/([^/?]+)/);
  if (m) return { tipo: "reservar", slug: decodeURIComponent(m[1]) };
  const esMarketing =
    hash === "" ||
    hash === "#" ||
    hash === "#/" ||
    /^#\/(inicio|funciones|precios|faq|contacto)\b/.test(hash);
  if (esMarketing && !tokenStore.get()) return { tipo: "sitio" };
  return null;
}

function Raiz() {
  const [publica, setPublica] = React.useState(leerRutaPublica());

  React.useEffect(() => {
    const onHash = () => setPublica(leerRutaPublica());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (publica?.tipo === "reservar") {
    return (
      <Suspense fallback={<Cargando />}>
        <ReservaPublica slug={publica.slug} />
      </Suspense>
    );
  }
  if (publica?.tipo === "sitio") {
    return (
      <Suspense fallback={<Cargando />}>
        <SitioWeb />
      </Suspense>
    );
  }
  return (
    <AuthProvider>
      <Suspense fallback={<Cargando />}>
        <App />
      </Suspense>
    </AuthProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Raiz />
    </ErrorBoundary>
  </React.StrictMode>
);
