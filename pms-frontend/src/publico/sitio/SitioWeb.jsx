import { useEffect, useState } from "react";
import { Hotel, Moon, Sun, Menu, X, MessageCircle } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import { waLink } from "./datos";
import Inicio from "./Inicio";
import Funciones from "./Funciones";
import Precios from "./Precios";
import Contacto from "./Contacto";
import "./sitio.css";

/**
 * SitioWeb — cascarón del sitio de marketing PÚBLICO (sin login). Es la
 * "puerta de entrada": un visitante sin sesión que llega a la raíz ve esta web
 * (ver main.jsx). Aporta la nav superior y el footer compartidos, y enruta las
 * secciones por hash:
 *   #/  o #/inicio -> Inicio · #/funciones · #/precios · #/contacto
 */
const SECCIONES = [
  { id: "inicio", hash: "#/inicio", label: "Inicio" },
  { id: "funciones", hash: "#/funciones", label: "Funciones" },
  { id: "precios", hash: "#/precios", label: "Precios" },
  { id: "contacto", hash: "#/contacto", label: "Contacto" },
];

function leerSeccion() {
  const h = window.location.hash;
  if (/^#\/funciones\b/.test(h)) return "funciones";
  if (/^#\/precios\b/.test(h)) return "precios";
  if (/^#\/contacto\b/.test(h)) return "contacto";
  return "inicio";
}

export default function SitioWeb() {
  const { theme, toggle } = useTheme();
  const [seccion, setSeccion] = useState(leerSeccion());
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    const onHash = () => {
      setSeccion(leerSeccion());
      setMenuAbierto(false);
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="sitio">
      {/* ---------------- Nav superior ---------------- */}
      <header className="sitio__nav">
        <a className="sitio__brand" href="#/inicio" aria-label="Stanza — inicio">
          <span className="sitio__brand-mark" aria-hidden="true">
            <Hotel size={22} strokeWidth={2} />
          </span>
          <span className="sitio__brand-name">Stanza</span>
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
          <a className="sitio__btn-ghost" href="#/login">
            Iniciar sesión
          </a>
          <a className="sitio__btn-primary sitio__solo-desktop" href="#/registro">
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

      {/* Menú desplegable móvil */}
      {menuAbierto && (
        <nav className="sitio__menu-movil" aria-label="Menú">
          {SECCIONES.map((s) => (
            <a key={s.id} href={s.hash} className="sitio__menu-item">
              {s.label}
            </a>
          ))}
          <a href="#/registro" className="sitio__btn-primary">
            Empieza gratis
          </a>
        </nav>
      )}

      {/* ---------------- Sección activa ---------------- */}
      <main className="sitio__main">
        {seccion === "inicio" && <Inicio />}
        {seccion === "funciones" && <Funciones />}
        {seccion === "precios" && <Precios />}
        {seccion === "contacto" && <Contacto />}
      </main>

      {/* ---------------- Footer ---------------- */}
      <footer className="sitio__footer">
        <div className="sitio__footer-top">
          <div className="sitio__footer-marca">
            <span className="sitio__brand-mark" aria-hidden="true">
              <Hotel size={20} strokeWidth={2} />
            </span>
            <span className="sitio__brand-name">Stanza</span>
            <p className="sitio__footer-tag">
              El PMS simple, en soles, para el hospedaje peruano.
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
              href={waLink("Hola, quiero más información sobre Stanza para mi hospedaje.")}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={14} aria-hidden="true" /> WhatsApp
            </a>
          </nav>
        </div>
        <p className="sitio__footer-copy">
          © {new Date().getFullYear()} Stanza · Hecho en Perú para hospedajes del Perú
        </p>
      </footer>
    </div>
  );
}
