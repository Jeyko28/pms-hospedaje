import { useCallback, useEffect, useState } from "react";

/**
 * useTheme — gestiona el tema claro/oscuro de la app.
 *
 *  - Recuerda la eleccion del usuario en localStorage (persistencia).
 *  - Si nunca eligio, respeta la preferencia del sistema operativo
 *    (prefers-color-scheme), heuristica "respetar el contexto del usuario".
 *  - Aplica el tema escribiendo data-theme="dark" en <html>, que activa el
 *    bloque de tokens oscuros en tokens.css.
 *
 * Devuelve: { theme, toggle, setTheme }
 */
const CLAVE = "pms-theme";

function temaInicial() {
  const guardado = localStorage.getItem(CLAVE);
  if (guardado === "light" || guardado === "dark") return guardado;
  // Sin preferencia guardada: seguir al sistema.
  const prefiereOscuro =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefiereOscuro ? "dark" : "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState(temaInicial);

  // Aplicar el tema al documento cada vez que cambie.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }
    localStorage.setItem(CLAVE, theme);
  }, [theme]);

  const setTheme = useCallback((t) => setThemeState(t), []);
  const toggle = useCallback(
    () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
    []
  );

  return { theme, toggle, setTheme };
}
