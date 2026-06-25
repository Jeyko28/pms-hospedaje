import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import ReservaPublica from "./publico/ReservaPublica";
import Precios from "./publico/Precios";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles/global.css";

/**
 * Decide qué montar según la URL (todas PÚBLICAS, sin login ni AuthProvider):
 *  - #/reservar/<slug>  -> pagina publica de reservas del hospedaje.
 *  - #/precios          -> pagina publica de precios (marketing).
 *  - cualquier otra      -> la app normal (con autenticacion).
 */
function leerRutaPublica() {
  const hash = window.location.hash;
  const m = hash.match(/^#\/reservar\/([^/?]+)/);
  if (m) return { tipo: "reservar", slug: decodeURIComponent(m[1]) };
  if (/^#\/precios\b/.test(hash)) return { tipo: "precios" };
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
    return <ReservaPublica slug={publica.slug} />;
  }
  if (publica?.tipo === "precios") {
    return <Precios />;
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
