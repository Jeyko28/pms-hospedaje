import { createContext, useContext, useEffect, useState } from "react";
import { api, tokenStore, registrarManejadorSesion } from "../api/client";

/**
 * AuthContext — estado global de sesion.
 *
 * Guarda el usuario logueado y expone login/logout. Al arrancar, si hay un
 * token guardado, pregunta a la API quien es (GET /api/auth/yo) para
 * restaurar la sesion tras recargar la pagina.
 *
 * Tambien registra un manejador para que, si cualquier peticion recibe 401
 * (token expirado), se cierre la sesion automaticamente.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true); // mientras valida el token inicial

  // Restaurar sesion al cargar la app.
  useEffect(() => {
    // Si un 401 ocurre en cualquier llamada, limpiar el usuario.
    registrarManejadorSesion(() => setUsuario(null));

    const token = tokenStore.get();
    if (!token) {
      setCargando(false);
      return;
    }
    api
      .yo()
      .then((u) => setUsuario(u))
      .catch(() => {
        tokenStore.clear();
        setUsuario(null);
      })
      .finally(() => setCargando(false));
  }, []);

  async function login(nombreUsuario, password) {
    const resp = await api.login(nombreUsuario, password);
    tokenStore.set(resp.token);
    setUsuario(resp.usuario);
    return resp.usuario;
  }

  // Registro self-service: crea cuenta nueva y entra directo.
  async function registro(datos) {
    const resp = await api.registro(datos);
    tokenStore.set(resp.token);
    setUsuario(resp.usuario);
    return resp;
  }

  // El botón de Google ya guardó el token; aquí solo fijamos el usuario.
  function setUsuarioDesdeGoogle(u) {
    setUsuario(u);
  }

  // Vuelve a pedir los datos del usuario (p. ej. tras cambiar el slug del link).
  async function refrescarUsuario() {
    const u = await api.yo();
    setUsuario(u);
    return u;
  }

  function logout() {
    tokenStore.clear();
    setUsuario(null);
  }

  const esSuperadmin = usuario?.rol === "superadmin";
  // Un superadmin también tiene capacidades de admin en la UI.
  const esAdmin = usuario?.rol === "admin" || esSuperadmin;

  return (
    <AuthContext.Provider
      value={{ usuario, esAdmin, esSuperadmin, cargando, login, registro, setUsuarioDesdeGoogle, refrescarUsuario, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
