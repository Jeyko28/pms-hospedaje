import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  ConciergeBell,
  BedDouble,
  Users,
  Receipt,
  BarChart3,
  ShieldCheck,
  Menu,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  Hotel,
  LogOut,
} from "lucide-react";
import { useRuta } from "../router/Router";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../auth/AuthContext";
import "./AppShell.css";

/**
 * AppShell — esqueleto de la aplicacion: barra lateral de navegacion + area
 * de contenido. Marco consistente que envuelve todas las pantallas.
 *
 * Comportamiento de la barra lateral:
 *  - Escritorio: se puede COLAPSAR a un "rail" de solo iconos (mas espacio
 *    para el contenido) y volver a expandir. La preferencia se recuerda.
 *  - Movil: la barra se oculta y se abre como cajon (drawer) con el boton
 *    hamburguesa; se cierra al elegir una opcion o tocar el fondo.
 *
 * Incluye un boton para alternar modo claro/oscuro.
 */

// Cada item usa un icono real de lucide-react (componente), legible incluso
// en tamano pequeno (modo rail). Antes eran caracteres Unicode genericos.
// soloAdmin: el item solo se muestra a usuarios con rol admin.
const NAV = [
  { id: "dashboard", icon: LayoutDashboard, label: "Panel" },
  { id: "reservas", icon: CalendarDays, label: "Reservas" },
  { id: "recepcion", icon: ConciergeBell, label: "Recepción" },
  { id: "habitaciones", icon: BedDouble, label: "Habitaciones" },
  { id: "huespedes", icon: Users, label: "Huéspedes" },
  { id: "facturas", icon: Receipt, label: "Facturas" },
  { id: "reportes", icon: BarChart3, label: "Reportes" },
  { id: "usuarios", icon: ShieldCheck, label: "Usuarios", soloAdmin: true },
];

// Tamano e impreso consistente para todos los iconos de la barra.
const ICON_PROPS = { size: 20, strokeWidth: 2, "aria-hidden": true };

const CLAVE_COLAPSO = "pms-sidebar-collapsed";

export default function AppShell({ children }) {
  const { ruta, navegar } = useRuta();
  const { theme, toggle: toggleTema } = useTheme();
  const { usuario, esAdmin, logout } = useAuth();

  // Filtra los items que el usuario puede ver segun su rol.
  const navVisible = NAV.filter((item) => !item.soloAdmin || esAdmin);

  // Colapso en escritorio (persistido).
  const [colapsado, setColapsado] = useState(
    () => localStorage.getItem(CLAVE_COLAPSO) === "1"
  );
  // Drawer abierto en movil (no se persiste; siempre arranca cerrado).
  const [drawerAbierto, setDrawerAbierto] = useState(false);

  useEffect(() => {
    localStorage.setItem(CLAVE_COLAPSO, colapsado ? "1" : "0");
  }, [colapsado]);

  // Cerrar el drawer con Escape (control y libertad del usuario).
  useEffect(() => {
    if (!drawerAbierto) return;
    const onKey = (e) => e.key === "Escape" && setDrawerAbierto(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerAbierto]);

  function irA(id) {
    navegar(id);
    setDrawerAbierto(false); // en movil, cerrar tras elegir
  }

  const clasesShell = [
    "shell",
    colapsado ? "shell--colapsado" : "",
    drawerAbierto ? "shell--drawer-abierto" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={clasesShell}>
      {/* Barra superior solo visible en movil: hamburguesa + marca + tema. */}
      <header className="shell__topbar">
        <button
          type="button"
          className="shell__icon-btn"
          aria-label="Abrir menú"
          aria-expanded={drawerAbierto}
          onClick={() => setDrawerAbierto(true)}
        >
          <Menu {...ICON_PROPS} />
        </button>
        <span className="shell__topbar-title">PMS Hospedaje</span>
        <button
          type="button"
          className="shell__icon-btn"
          aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
          onClick={toggleTema}
        >
          {theme === "dark" ? <Sun {...ICON_PROPS} /> : <Moon {...ICON_PROPS} />}
        </button>
      </header>

      {/* Fondo oscuro del drawer (solo movil). */}
      <div
        className="shell__backdrop"
        onClick={() => setDrawerAbierto(false)}
        aria-hidden="true"
      />

      <aside className="shell__sidebar">
        <div className="shell__brand">
          <span className="shell__brand-mark" aria-hidden="true">
            <Hotel size={26} strokeWidth={2} />
          </span>
          <span className="shell__brand-name">PMS Hospedaje</span>
          {/* Boton colapsar/expandir (escritorio). */}
          <button
            type="button"
            className="shell__collapse-btn"
            aria-label={colapsado ? "Expandir menú" : "Colapsar menú"}
            title={colapsado ? "Expandir menú" : "Colapsar menú"}
            onClick={() => setColapsado((c) => !c)}
          >
            {colapsado ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="shell__nav" aria-label="Navegación principal">
          <ul>
            {navVisible.map((item) => {
              const activo = ruta === item.id;
              const Icono = item.icon;
              return (
                <li key={item.id}>
                  <a
                    href={`#/${item.id}`}
                    className={
                      "shell__nav-link" +
                      (activo ? " shell__nav-link--active" : "")
                    }
                    aria-current={activo ? "page" : undefined}
                    // En modo rail, el texto se oculta visualmente; el title
                    // da el nombre al pasar el cursor.
                    title={item.label}
                    onClick={(e) => {
                      e.preventDefault();
                      irA(item.id);
                    }}
                  >
                    <span className="shell__nav-icon">
                      <Icono {...ICON_PROPS} />
                    </span>
                    <span className="shell__nav-label">{item.label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Pie de la barra: usuario + tema + cerrar sesion. */}
        <div className="shell__footer">
          {/* Tarjeta del usuario logueado. */}
          <div className="shell__user" title={`${usuario?.nombre} (${usuario?.rol})`}>
            <span className="shell__user-avatar" aria-hidden="true">
              {(usuario?.nombre || "?")
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0].toUpperCase())
                .join("")}
            </span>
            <span className="shell__user-info shell__nav-label">
              <span className="shell__user-name">{usuario?.nombre}</span>
              <span className="shell__user-rol">
                {usuario?.rol === "admin" ? "Administrador" : "Recepción"}
              </span>
            </span>
          </div>

          <button
            type="button"
            className="shell__theme-btn"
            onClick={toggleTema}
            title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
          >
            <span className="shell__nav-icon">
              {theme === "dark" ? <Sun {...ICON_PROPS} /> : <Moon {...ICON_PROPS} />}
            </span>
            <span className="shell__nav-label">
              {theme === "dark" ? "Modo claro" : "Modo oscuro"}
            </span>
          </button>

          <button
            type="button"
            className="shell__theme-btn"
            onClick={logout}
            title="Cerrar sesión"
          >
            <span className="shell__nav-icon">
              <LogOut {...ICON_PROPS} />
            </span>
            <span className="shell__nav-label">Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <main className="shell__main">
        <div className="shell__content">{children}</div>
      </main>
    </div>
  );
}
