import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../auth/AuthContext";
import { useRuta } from "../router/Router";
import "./NotificationCenter.css";

/**
 * NotificationCenter — campana + panel de notificaciones. Las notificaciones se
 * CALCULAN del estado actual (endpoint /api/notificaciones), no se guardan en un
 * buzón. El estado "leída" se guarda en el cliente (localStorage) por usuario,
 * usando el id estable de cada notificación. Contador = no leídas.
 */
function etiquetaFecha(fecha) {
  if (!fecha) return "";
  const hoy = new Date();
  const hoyStr = hoy.toISOString().slice(0, 10);
  if (fecha === hoyStr) return "Hoy";
  const d = new Date(fecha + "T00:00:00");
  if (isNaN(d)) return "";
  const difDias = Math.round((d - new Date(hoyStr + "T00:00:00")) / 86400000);
  if (difDias === -1) return "Ayer";
  if (difDias < 0) return `Hace ${Math.abs(difDias)} días`;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

export default function NotificationCenter() {
  const { usuario } = useAuth();
  const { navegar } = useRuta();
  const noti = useApi(api.notificaciones);
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("todas"); // 'todas' | 'noleidas'
  const ref = useRef(null);

  const KEY = `pms-notif-leidas-${usuario?.id || "x"}`;
  const [leidas, setLeidas] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
    } catch {
      return new Set();
    }
  });

  // Refresco periódico (cada 60s) para que el contador se mantenga al día.
  useEffect(() => {
    const t = setInterval(() => noti.recargar(), 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cerrar el panel al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    };
    const onKey = (e) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [abierto]);

  const lista = noti.data?.notificaciones || [];
  const noLeidas = lista.filter((n) => !leidas.has(n.id));
  const visibles = filtro === "noleidas" ? noLeidas : lista;

  function persist(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify([...s]));
    } catch {
      /* almacenamiento no disponible */
    }
  }
  function marcarLeida(id) {
    setLeidas((prev) => {
      const n = new Set(prev);
      n.add(id);
      persist(n);
      return n;
    });
  }
  function marcarTodas() {
    setLeidas((prev) => {
      const n = new Set(prev);
      lista.forEach((x) => n.add(x.id));
      persist(n);
      return n;
    });
  }
  function abrir(n) {
    marcarLeida(n.id);
    setAbierto(false);
    if (n.ruta) navegar(n.ruta);
  }

  return (
    <div className="notif" ref={ref}>
      <button
        type="button"
        className="shell__header-icon-btn notif__btn"
        aria-label={`Notificaciones${noLeidas.length ? ` (${noLeidas.length} sin leer)` : ""}`}
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        <Bell size={18} />
        {noLeidas.length > 0 && (
          <span className="notif__badge">{noLeidas.length > 9 ? "9+" : noLeidas.length}</span>
        )}
      </button>

      {abierto && (
        <div className="notif__panel" role="dialog" aria-label="Notificaciones">
          <div className="notif__head">
            <strong>Notificaciones</strong>
            {noLeidas.length > 0 && (
              <button type="button" className="notif__accion" onClick={marcarTodas}>
                Marcar todas leídas
              </button>
            )}
          </div>

          <div className="notif__filtros" role="tablist">
            <button
              type="button"
              className={filtro === "todas" ? "is-active" : ""}
              onClick={() => setFiltro("todas")}
            >
              Todas ({lista.length})
            </button>
            <button
              type="button"
              className={filtro === "noleidas" ? "is-active" : ""}
              onClick={() => setFiltro("noleidas")}
            >
              No leídas ({noLeidas.length})
            </button>
          </div>

          <div className="notif__lista">
            {noti.loading && !noti.data ? (
              <p className="notif__vacio">Cargando…</p>
            ) : visibles.length === 0 ? (
              <p className="notif__vacio">
                {filtro === "noleidas"
                  ? "Sin notificaciones nuevas."
                  : "Sin novedades. Todo en orden ✨"}
              </p>
            ) : (
              visibles.map((n) => {
                const leida = leidas.has(n.id);
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`notif__item ${leida ? "is-leida" : ""}`}
                    onClick={() => abrir(n)}
                  >
                    <span className={`notif__dot notif__dot--${n.prioridad}`} aria-hidden="true" />
                    <span className="notif__cuerpo">
                      <span className="notif__titulo">{n.titulo}</span>
                      <span className="notif__texto">{n.texto}</span>
                      <span className="notif__fecha">{etiquetaFecha(n.fecha)}</span>
                    </span>
                    {!leida && <span className="notif__pip" aria-hidden="true" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
