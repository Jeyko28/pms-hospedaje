import { useEffect, useState } from "react";

/**
 * Estado del "easter egg" del Precio Fundador. Se mantiene desacoplado (módulo
 * + evento) para que el disparador del footer y la mecánica de engagement en
 * Precios puedan revelarlo sin acoplar componentes.
 *
 * Persistimos en sessionStorage: una vez descubierto en la sesión, sigue
 * visible (no se vuelve a "esconder" al navegar), pero no queda para siempre.
 */
const CLAVE = "stanza-founder-unlocked";
const EVENTO = "stanza-founder-unlock";

export function isFounderUnlocked() {
  try {
    return sessionStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

export function unlockFounder() {
  try {
    sessionStorage.setItem(CLAVE, "1");
  } catch {
    /* sessionStorage no disponible: seguimos con el evento */
  }
  window.dispatchEvent(new Event(EVENTO));
}

/** Hook que devuelve si el precio fundador ya fue descubierto (reactivo). */
export function useFounderUnlocked() {
  const [unlocked, setUnlocked] = useState(isFounderUnlocked);
  useEffect(() => {
    const on = () => setUnlocked(true);
    window.addEventListener(EVENTO, on);
    return () => window.removeEventListener(EVENTO, on);
  }, []);
  return unlocked;
}
