import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import "./Toast.css";

// Puente para emitir toasts desde código que NO es componente (utils como
// pdf.js). Los componentes deben preferir el hook useToast().
let emisorGlobal = null;
export const toast = {
  success: (m, o) => emisorGlobal?.success(m, o),
  error: (m, o) => emisorGlobal?.error(m, o),
  info: (m, o) => emisorGlobal?.info(m, o),
};

/**
 * Toast — sistema de avisos no intrusivos (esquina inferior derecha).
 *
 * Por qué existe: heurística de Nielsen #1 (visibilidad del estado del
 * sistema). Hoy muchas acciones (check-in, pago, copiar link, errores) no
 * daban confirmación visual o usaban window.alert (bloqueante y feo). Un toast
 * confirma de forma breve y se va solo, sin interrumpir el flujo.
 *
 * Uso:
 *   const toast = useToast();
 *   toast.success("Check-in registrado");
 *   toast.error("No se pudo guardar");
 */
const ToastContext = createContext(null);

let idSeq = 0;

const ICONOS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    // Marca el toast como saliente para animar su salida y lo quita después.
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
    );
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, []);

  const show = useCallback(
    (mensaje, { type = "info", duration } = {}) => {
      const id = ++idSeq;
      const dur = duration ?? (type === "error" ? 5000 : 3500);
      setToasts((prev) => [...prev, { id, mensaje, type }]);
      timers.current[id] = setTimeout(() => dismiss(id), dur);
      return id;
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      show,
      dismiss,
      success: (m, o) => show(m, { ...o, type: "success" }),
      error: (m, o) => show(m, { ...o, type: "error" }),
      info: (m, o) => show(m, { ...o, type: "info" }),
    }),
    [show, dismiss]
  );

  // Expone el emisor al puente global para utilidades no-componente.
  useEffect(() => {
    emisorGlobal = api;
    return () => {
      if (emisorGlobal === api) emisorGlobal = null;
    };
  }, [api]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="toasts"
        role="region"
        aria-label="Notificaciones"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const Icono = ICONOS[t.type] || Info;
          return (
            <div
              key={t.id}
              className={`toast toast--${t.type}${t.leaving ? " toast--leaving" : ""}`}
              role={t.type === "error" ? "alert" : "status"}
            >
              <span className="toast__icon" aria-hidden="true">
                <Icono size={18} />
              </span>
              <span className="toast__msg">{t.mensaje}</span>
              <button
                type="button"
                className="toast__close"
                onClick={() => dismiss(t.id)}
                aria-label="Cerrar aviso"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}
