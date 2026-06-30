import { useEffect, useRef } from "react";
import "./Modal.css";

/**
 * Modal — dialogo accesible para formularios (ej. nueva reserva).
 *
 * Accesibilidad aplicada:
 *  - role="dialog" + aria-modal + aria-labelledby (titulo).
 *  - Cierra con la tecla Escape (control y libertad del usuario).
 *  - Al abrir, mueve el foco al dialogo; al cerrar no atrapa al usuario.
 *  - Click en el fondo oscuro cierra (salida facil).
 *
 * Props: open (bool), title (string), onClose (fn), children, footer,
 *        size ("md" | "wide") — "wide" para formularios con layout en 2 columnas.
 */
export default function Modal({ open, title, onClose, children, footer, size = "md" }) {
  const dialogRef = useRef(null);

  // Llevar el foco al dialogo SOLO al abrir. Va en su propio efecto con deps
  // [open] para que NO se re-ejecute en cada render: si dependiera de onClose
  // (que suele ser una arrow inline), cada tecla de un formulario inline robaría
  // el foco al diálogo y solo se podría escribir una letra.
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  // Escape para cerrar + bloqueo del scroll del fondo mientras está abierto.
  useEffect(() => {
    if (!open) return;
    const alPresionar = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", alPresionar);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alPresionar);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const tituloId = "modal-title";

  return (
    <div className="modal__overlay" onMouseDown={onClose}>
      <div
        className={"modal" + (size === "wide" ? " modal--wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        ref={dialogRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <h2 id={tituloId} className="modal__title">
            {title}
          </h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        <div className="modal__body">{children}</div>

        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>
  );
}
