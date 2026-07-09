import { useEffect, useState } from "react";
import { Hotel, Moon, Sun, Menu, X, MessageCircle, Sparkles } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import { waLink } from "./datos";
import { unlockFounder } from "./founder";
import Inicio from "./Inicio";
import Funciones from "./Funciones";
import Precios from "./Precios";
import Contacto from "./Contacto";
import Legal from "./Legal";
import "./sitio.css";

// Rutas legales (páginas propias, enlazadas desde el footer).
const LEGALES = [
  { id: "terminos", hash: "#/terminos", label: "Términos y Condiciones" },
  { id: "privacidad", hash: "#/privacidad", label: "Política de Privacidad" },
  { id: "cookies", hash: "#/cookies", label: "Política de Cookies" },
];

/**
 * SitioWeb — cascarón del sitio de marketing PÚBLICO de Vantry (sin login).
 * "Front door": el visitante sin sesión que llega a la raíz ve esta web.
 * Aporta nav + footer compartidos y enruta secciones por hash.
 */
const SECCIONES = [
  { id: "inicio", hash: "#/inicio", label: "Inicio" },
  { id: "funciones", hash: "#/funciones", label: "Funciones" },
  { id: "precios", hash: "#/precios", label: "Precios" },
  { id: "faq", hash: "#/faq", label: "FAQ" },
  { id: "contacto", hash: "#/contacto", label: "Contacto" },
];

function leerSeccion() {
  const h = window.location.hash;
  if (/^#\/funciones\b/.test(h)) return "funciones";
  if (/^#\/precios\b/.test(h)) return "precios";
  if (/^#\/contacto\b/.test(h)) return "contacto";
  if (/^#\/terminos\b/.test(h)) return "terminos";
  if (/^#\/privacidad\b/.test(h)) return "privacidad";
  if (/^#\/cookies\b/.test(h)) return "cookies";
  // FAQ es una sección DENTRO de Inicio: se renderiza Inicio y se hace scroll
  // a #faq (ver el efecto que observa `seccion`). Se distingue como "faq" para
  // el estado activo del nav.
  if (/^#\/faq\b/.test(h)) return "faq";
  return "inicio";
}

// (El desplazamiento a #faq se hace en un efecto del componente que observa
// `seccion`, para correr DESPUÉS de que Inicio se monte en el DOM.)

export default function SitioWeb() {
  const { theme, toggle } = useTheme();
  const [seccion, setSeccion] = useState(leerSeccion());
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onHash = () => {
      const s = leerSeccion();
      setSeccion(s);
      setMenuAbierto(false);
      // Para "faq" no subimos al tope: el efecto de abajo desplaza a la sección.
      if (s !== "faq") window.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Cuando la sección activa es FAQ (por nav o carga directa), desplazar a #faq.
  // En un efecto para correr tras el commit de Inicio; espera con rAF a que el
  // ancla exista en el DOM.
  useEffect(() => {
    if (seccion !== "faq") return;
    const t0 = Date.now();
    let alineadoDesde = null;
    // Re-alinea #faq al tope hasta que quede ESTABLE (~400 ms alineado). setInterval
    // (no rAF) porque en carga fría el hilo se bloquea y rAF puede no reprogramarse;
    // el intervalo sigue encolado. Tope de seguridad de 4 s.
    const id = setInterval(() => {
      const el = document.getElementById("faq");
      if (el) {
        const top = el.getBoundingClientRect().top;
        if (top < -4 || top > 4) {
          el.scrollIntoView({ block: "start" });
          alineadoDesde = null;
        } else if (alineadoDesde == null) {
          alineadoDesde = Date.now();
        }
      }
      const estable = alineadoDesde != null && Date.now() - alineadoDesde >= 400;
      if (estable || Date.now() - t0 >= 4000) clearInterval(id);
    }, 80);
    return () => clearInterval(id);
  }, [seccion]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Disparador accesible del easter egg: revela el fundador y va a Precios.
  function descubrirFundador() {
    unlockFounder();
    window.location.hash = "#/precios";
  }

  return (
    <div className="sitio">
      {/* ---------------- Nav ---------------- */}
      <header className={`sitio__nav ${scrolled ? "sitio__nav--scrolled" : ""}`}>
        <a className="sitio__brand" href="#/inicio" aria-label="Vantry — inicio">
          <span className="sitio__brand-mark" aria-hidden="true">
            <Hotel size={20} strokeWidth={2.2} />
          </span>
          <span className="sitio__brand-name">Vantry</span>
        </a>

        <nav className="sitio__links" aria-label="Secciones">
          {SECCIONES.map((s) => (
            <a
              key={s.id}
              href={s.hash}
              className={`sitio__link ${seccion === s.id ? "is-active" : ""}`}
              aria-current={seccion === s.id ? "page" : undefined}
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="sitio__nav-acciones">
          <button
            type="button"
            className="sitio__icon-btn"
            onClick={toggle}
            aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <a className="s-btn s-btn--ghost sitio__solo-desktop" href="#/login">
            Iniciar sesión
          </a>
          <a className="s-btn s-btn--primary sitio__solo-desktop" href="#/registro">
            Empieza gratis
          </a>
          <button
            type="button"
            className="sitio__icon-btn sitio__solo-movil"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuAbierto}
          >
            {menuAbierto ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      {menuAbierto && (
        <nav className="sitio__menu-movil" aria-label="Menú">
          {SECCIONES.map((s) => (
            <a key={s.id} href={s.hash} className="sitio__menu-item">
              {s.label}
            </a>
          ))}
          <a href="#/login" className="s-btn s-btn--ghost">
            Iniciar sesión
          </a>
          <a href="#/registro" className="s-btn s-btn--primary">
            Empieza gratis
          </a>
        </nav>
      )}

      {/* ---------------- Sección activa ---------------- */}
      <main className="sitio__main">
        {(seccion === "inicio" || seccion === "faq") && <Inicio />}
        {seccion === "funciones" && <Funciones />}
        {seccion === "precios" && <Precios />}
        {seccion === "contacto" && <Contacto />}
        {(seccion === "terminos" || seccion === "privacidad" || seccion === "cookies") && (
          <Legal doc={seccion} />
        )}
      </main>

      {/* ---------------- Footer ---------------- */}
      <footer className="sitio__footer">
        <div className="sitio__footer-top">
          <div className="sitio__footer-marca">
            <a className="sitio__brand" href="#/inicio">
              <span className="sitio__brand-mark" aria-hidden="true">
                <Hotel size={18} strokeWidth={2.2} />
              </span>
              <span className="sitio__brand-name">Vantry</span>
            </a>
            <p className="sitio__footer-tag">
              El PMS profesional, en soles, para el hospedaje peruano. Reservas directas
              sin comisión.
            </p>
          </div>
          <nav className="sitio__footer-links" aria-label="Enlaces del pie">
            {SECCIONES.map((s) => (
              <a key={s.id} href={s.hash}>
                {s.label}
              </a>
            ))}
            <a href="#/login">Iniciar sesión</a>
            <a
              href={waLink("Hola, quiero más información sobre Vantry para mi hospedaje.")}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={14} aria-hidden="true" /> WhatsApp
            </a>
          </nav>
        </div>
        <nav className="sitio__footer-legal" aria-label="Legal">
          {LEGALES.map((l) => (
            <a key={l.id} href={l.hash}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="sitio__footer-copy">
          <span>© {new Date().getFullYear()} Vantry · Hecho en Perú para hospedajes del Perú</span>
          {/* Disparador discreto y accesible del easter egg del fundador */}
          <button
            type="button"
            className="founder__trigger"
            onClick={descubrirFundador}
            aria-label="Descubrir un beneficio reservado"
            title="✦"
          >
            <Sparkles size={13} aria-hidden="true" /> ✦
          </button>
        </div>
      </footer>
    </div>
  );
}
