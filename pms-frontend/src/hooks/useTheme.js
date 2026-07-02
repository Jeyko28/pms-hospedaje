import { useCallback, useEffect, useState } from "react";

/**
 * useTheme — gestiona la apariencia (claro/oscuro/sistema).
 *
 *  - `modo`: preferencia elegida por el usuario: 'light' | 'dark' | 'system'.
 *  - `theme`: el tema REALMENTE aplicado ('light' | 'dark'); si el modo es
 *    'system', se resuelve según prefers-color-scheme y se actualiza en vivo.
 *  - Persiste el modo en localStorage (sobrevive recargas).
 *  - Aplica el tema escribiendo data-theme="dark" en <html> (activa los tokens
 *    oscuros de tokens.css).
 *
 * Compatibilidad: `theme` y `toggle` siguen existiendo para los componentes que
 * ya los usaban (topbar, sitio). `setTheme('light'|'dark')` sigue funcionando.
 *
 * Devuelve: { theme, modo, toggle, setModo, setTheme }
 */
const CLAVE = "pms-theme"; // 'light' | 'dark' | 'system'

function sistemaOscuro() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function leerModo() {
  const g = localStorage.getItem(CLAVE);
  return g === "light" || g === "dark" ? g : "system";
}

function resolver(modo) {
  if (modo === "light" || modo === "dark") return modo;
  return sistemaOscuro() ? "dark" : "light";
}

export function useTheme() {
  const [modo, setModoState] = useState(leerModo);
  const [theme, setThemeReal] = useState(() => resolver(leerModo()));

  // Aplicar el tema resuelto al documento.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
  }, [theme]);

  // Persistir el modo y, si es 'system', seguir el SO en vivo.
  useEffect(() => {
    localStorage.setItem(CLAVE, modo);
    setThemeReal(resolver(modo));
    if (modo === "system" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const alCambiar = () => setThemeReal(mq.matches ? "dark" : "light");
      mq.addEventListener?.("change", alCambiar);
      return () => mq.removeEventListener?.("change", alCambiar);
    }
  }, [modo]);

  const setModo = useCallback((m) => setModoState(m), []);
  const setTheme = useCallback((t) => setModoState(t), []); // 'light' | 'dark'
  const toggle = useCallback(
    () => setModoState((m) => (resolver(m) === "dark" ? "light" : "dark")),
    []
  );

  return { theme, modo, toggle, setModo, setTheme };
}
