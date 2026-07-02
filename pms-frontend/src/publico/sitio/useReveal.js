import { createElement, useEffect, useRef, useState } from "react";

/**
 * useReveal — revela un elemento cuando entra en el viewport (aparición al
 * scroll). Devuelve { ref, visible } para aplicar una clase de entrada.
 *
 * Diseñado para el sistema de motion del sitio: úsalo con las clases
 * `.reveal` (estado inicial) + `.reveal-in` (estado visible) de sitio.css.
 * Respeta prefers-reduced-motion: si el usuario lo prefiere, marca visible de
 * inmediato (sin animación) para no ocultar contenido.
 *
 * Opciones: { threshold=0.15, rootMargin="0px 0px -10% 0px", once=true }
 */
export function useReveal(opciones = {}) {
  const { threshold = 0.15, rootMargin = "0px 0px -10% 0px", once = true } =
    opciones;
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Accesibilidad / entornos sin IO: mostrar sin animar.
    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) io.unobserve(entry.target);
          } else if (!once) {
            setVisible(false);
          }
        });
      },
      { threshold, rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, rootMargin, once]);

  return { ref, visible };
}

/**
 * Reveal — envoltura declarativa. Aplica `.reveal` y, al entrar, `.reveal-in`.
 * `delay` (ms) permite escalonar (stagger) elementos hermanos.
 *
 * Uso: <Reveal as="section" delay={80} className="bloque">…</Reveal>
 */
export function revealProps(visible, delay = 0) {
  return {
    className: `reveal${visible ? " reveal-in" : ""}`,
    style: delay ? { transitionDelay: `${delay}ms` } : undefined,
  };
}

/**
 * Reveal — envoltura declarativa. Aplica la animación de entrada al scroll.
 * Props: as (tag, default "div"), delay (ms), className (extra), ...rest.
 */
export function Reveal({ as = "div", delay = 0, className = "", children, ...rest }) {
  const { ref, visible } = useReveal();
  const cls = `reveal${visible ? " reveal-in" : ""}${className ? " " + className : ""}`;
  return createElement(
    as,
    { ref, className: cls, style: delay ? { transitionDelay: `${delay}ms` } : undefined, ...rest },
    children
  );
}
