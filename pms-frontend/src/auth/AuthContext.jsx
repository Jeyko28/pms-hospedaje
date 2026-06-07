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

  function logout() {
    tokenStore.clear();
    setUsuario(null);
  }

  const esAdmin = usuario?.rol === "admin";

  return (
    <AuthContext.Provider
      value={{ usuario, esAdmin, cargando, login, logout }}
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
