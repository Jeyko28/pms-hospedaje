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
 * Props: open (bool), title (string), onClose (fn), children, footer
 */
export default function Modal({ open, title, onClose, children, footer }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const alPresionar = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", alPresionar);
    // Llevar el foco al dialogo al abrir.
    dialogRef.current?.focus();
    // Evitar scroll del fondo mientras el modal esta abierto.
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
        className="modal"
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
