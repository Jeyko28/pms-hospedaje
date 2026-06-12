import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { tokenStore } from "../api/client";
import { useAuth } from "./AuthContext";

/**
 * BotonGoogle — botón oficial "Iniciar sesión con Google".
 *
 * Cómo funciona:
 *  1. Pregunta al backend si Google está configurado (/api/config).
 *  2. Si lo está, carga el script de Google Identity Services y renderiza
 *     su botón oficial con el client_id.
 *  3. Cuando el usuario elige su cuenta, Google nos da un "credential" (JWT)
 *     que enviamos al backend (/api/auth/google) para entrar o crear cuenta.
 *
 * Si Google no está configurado (sin client_id), no muestra nada.
 */
const GIS_SRC = "https://accounts.google.com/gsi/client";

function cargarScriptGoogle() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existente = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existente) {
      existente.addEventListener("load", () => resolve());
      existente.addEventListener("error", reject);
      return;
    }
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function BotonGoogle({ onError }) {
  const { setUsuarioDesdeGoogle } = useAuth();
  const contenedorRef = useRef(null);
  const [disponible, setDisponible] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function init() {
      try {
        const cfg = await api.config();
        if (cancelado || !cfg.google_login || !cfg.google_client_id) return;
        await cargarScriptGoogle();
        if (cancelado) return;

        window.google.accounts.id.initialize({
          client_id: cfg.google_client_id,
          callback: async (resp) => {
            try {
              const r = await api.loginGoogle(resp.credential);
              tokenStore.set(r.token);
              setUsuarioDesdeGoogle(r.usuario);
            } catch (e) {
              onError?.(e.message);
            }
          },
        });
        setDisponible(true);
        // El contenedor debe existir en el DOM antes de pintar el botón.
        // Se hace tras setDisponible para que el div ya esté montado.
        setTimeout(() => {
          try {
            if (contenedorRef.current) {
              window.google.accounts.id.renderButton(contenedorRef.current, {
                theme: "outline",
                size: "large",
                width: 320,
                text: "continue_with",
                locale: "es",
              });
            }
          } catch (e) {
            console.error("[Google] renderButton falló:", e);
          }
        }, 0);
      } catch (e) {
        // Google no disponible: se registra para diagnóstico y no se muestra.
        console.error("[Google] no se pudo iniciar el login con Google:", e);
      }
    }
    init();
    return () => {
      cancelado = true;
    };
  }, [onError, setUsuarioDesdeGoogle]);

  if (!disponible) return null;

  return (
    <div className="login__google">
      <div className="login__divisor"><span>o</span></div>
      <div ref={contenedorRef} className="login__google-btn" />
    </div>
  );
}
