import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  CalendarRange,
  ConciergeBell,
  BedDouble,
  Users,
  Receipt,
  FileText,
  BarChart3,
  ShieldCheck,
  Building2,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
  Hotel,
  LogOut,
  Settings,
  Sparkles,
  Coffee,
  Tag,
  Boxes,
} from "lucide-react";
import { useRuta } from "../router/Router";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../auth/AuthContext";
import NotificationCenter from "./NotificationCenter";
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
// Banderas de visibilidad por rol:
//  - operativa: secciones del día a día de UN hospedaje. El SUPERADMIN (dueño
//    del SaaS) NO las ve: él gestiona cuentas, no opera hoteles ajenos.
//  - soloAdmin: solo admin (de hospedaje). soloSuperadmin: solo el dueño del SaaS.
const NAV = [
  { id: "dashboard", icon: LayoutDashboard, label: "Panel", title: "Panel de control", subtitle: "Resumen de tu hospedaje en tiempo real.", operativa: true },
  { id: "reservas", icon: CalendarDays, label: "Reservas", title: "Reservas", subtitle: "Gestiona las reservas de tu hospedaje.", operativa: true },
  { id: "calendario", icon: CalendarRange, label: "Calendario", title: "Calendario", subtitle: "Vista de ocupación por habitación.", operativa: true },
  { id: "recepcion", icon: ConciergeBell, label: "Recepción", title: "Recepción", subtitle: "Gestiona las entradas y salidas de huéspedes.", operativa: true },
  { id: "habitaciones", icon: BedDouble, label: "Habitaciones", title: "Habitaciones", subtitle: "Administra las habitaciones de tu hospedaje.", operativa: true },
  { id: "tarifas", icon: Tag, label: "Tarifas", title: "Tarifas", subtitle: "Precios por temporada y fin de semana.", soloAdmin: true, operativa: true },
  { id: "housekeeping", icon: Sparkles, label: "Limpieza", title: "Limpieza", subtitle: "Estado de limpieza de las habitaciones.", operativa: true },
  { id: "servicios", icon: Coffee, label: "Servicios", title: "Catálogo de servicios", subtitle: "Productos y servicios disponibles para huéspedes.", soloAdmin: true, operativa: true },
  { id: "inventario", icon: Boxes, label: "Inventario", title: "Inventario", subtitle: "Existencias, stock mínimo y movimientos.", soloAdmin: true, operativa: true },
  { id: "huespedes", icon: Users, label: "Huéspedes", title: "Huéspedes", subtitle: "Tu directorio de huéspedes registrados.", operativa: true },
  { id: "facturas", icon: Receipt, label: "Cuentas", title: "Cuentas", subtitle: "Cuentas de tus huéspedes y emisión de comprobantes.", operativa: true },
  { id: "sunat", icon: FileText, label: "Comprobantes", title: "Comprobantes", subtitle: "Boletas y facturas electrónicas emitidas (SUNAT).", soloAdmin: true, operativa: true },
  { id: "reportes", icon: BarChart3, label: "Reportes", title: "Reportes", subtitle: "Finanzas y ocupación de tu hospedaje.", soloAdmin: true, operativa: true },
  { id: "usuarios", icon: ShieldCheck, label: "Usuarios", title: "Usuarios", subtitle: "Gestiona quién puede acceder al sistema.", soloAdmin: true, operativa: true },
  { id: "configuracion", icon: Settings, label: "Configuración", title: "Configuración del negocio", subtitle: "Datos comerciales y de facturación electrónica de tu hospedaje.", soloAdmin: true, operativa: true },
  { id: "hospedajes", icon: Building2, label: "Hospedajes", title: "Hospedajes", subtitle: "Panel de administración del servicio.", soloSuperadmin: true },
];

// Tamano e impreso consistente para todos los iconos de la barra.
const ICON_PROPS = { size: 20, strokeWidth: 2, "aria-hidden": true };

const CLAVE_COLAPSO = "pms-sidebar-collapsed";

export default function AppShell({ children }) {
  const { ruta, navegar } = useRuta();
  const { theme, toggle: toggleTema } = useTheme();
  const { usuario, esAdmin, esSuperadmin, logout } = useAuth();

  // Filtra los items que el usuario puede ver segun su rol.
  const navVisible = NAV.filter((item) => {
    // El superadmin solo gestiona el SaaS: oculta las secciones operativas.
    if (esSuperadmin) return !item.operativa;
    if (item.soloSuperadmin) return esSuperadmin;
    if (item.soloAdmin) return esAdmin;
    return true;
  });

  // Guard de ruta: cuando hay sesión, la `ruta` debe ser una sección VÁLIDA para
  // el rol. Si no lo es (p. ej. el hash quedó en `login` tras iniciar sesión, o
  // recepción llegó a una ruta soloAdmin), se redirige a la sección por defecto
  // del rol (navVisible[0]: dashboard para admin/recepción, hospedajes para
  // superadmin), reemplazando el historial. Esto restablece el invariante y
  // evita el header vacío en su origen.
  useEffect(() => {
    if (navVisible.length && !navVisible.some((n) => n.id === ruta)) {
      navegar(navVisible[0].id, { reemplazar: true });
    }
  }, [ruta, navVisible, navegar]);

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
        <span className="shell__topbar-title">Stanza</span>
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
        {/* Cabecera: logo + nombre, y un botón pequeño y discreto para
            colapsar/expandir (icono integrado, sin recuadro grande). */}
        <div className="shell__brand">
          <span className="shell__brand-mark" aria-hidden="true">
            <Hotel size={26} strokeWidth={2} />
          </span>
          <span className="shell__brand-name">Stanza</span>
          <button
            type="button"
            className="shell__collapse-btn"
            aria-label={colapsado ? "Expandir menú" : "Colapsar menú"}
            aria-expanded={!colapsado}
            title={colapsado ? "Expandir menú" : "Colapsar menú"}
            onClick={() => setColapsado((c) => !c)}
          >
            {colapsado ? (
              <PanelLeftOpen size={20} />
            ) : (
              <PanelLeftClose size={20} />
            )}
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
                    title={item.label}
                    data-tooltip={item.label}
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
      </aside>

      {/* Header de escritorio: titulo/subtitulo de la seccion + acciones. */}
      <header className="shell__header">
        <div className="shell__header-left">
          {(() => {
            const navItem = navVisible.find((n) => n.id === ruta);
            return navItem ? (
              <>
                <h1 className="shell__header-title">{navItem.title}</h1>
                <p className="shell__header-subtitle">{navItem.subtitle}</p>
              </>
            ) : null;
          })()}
        </div>
        <div className="shell__header-right">
          <div className="shell__header-user" title={`${usuario?.nombre} (${usuario?.rol})`}>
            <span className="shell__header-avatar" aria-hidden="true">
              {(usuario?.nombre || "?")
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0].toUpperCase())
                .join("")}
            </span>
            <span className="shell__header-user-info">
              <span className="shell__header-user-name">{usuario?.nombre}</span>
              <span className="shell__header-user-rol">
                {usuario?.rol === "admin" ? "Administrador" : "Recepción"}
              </span>
            </span>
          </div>
          <NotificationCenter />
          <button
            type="button"
            className="shell__header-icon-btn shell__header-logout"
            onClick={logout}
            title="Cerrar sesión"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="shell__main">
        <div className="shell__content">{children}</div>
      </main>
    </div>
  );
}
