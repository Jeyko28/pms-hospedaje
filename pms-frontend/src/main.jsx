import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import ReservaPublica from "./publico/ReservaPublica";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles/global.css";

/**
 * Decide qué montar según la URL:
 *  - #/reservar/<slug>  -> pagina PUBLICA de reservas (sin login, sin AuthProvider).
 *  - cualquier otra      -> la app normal (con autenticacion).
 */
function leerSlugPublico() {
  const m = window.location.hash.match(/^#\/reservar\/([^/?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function Raiz() {
  const [slug, setSlug] = React.useState(leerSlugPublico());

  React.useEffect(() => {
    const onHash = () => setSlug(leerSlugPublico());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (slug) {
    // Pagina publica: no requiere sesion.
    return <ReservaPublica slug={slug} />;
  }
  return (
    <AuthProvider>
      <App />
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
