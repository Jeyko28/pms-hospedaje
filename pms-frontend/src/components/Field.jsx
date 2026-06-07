import "./Field.css";

/**
 * Field — envoltorio de un campo de formulario: etiqueta + control + ayuda/error.
 *
 * Accesibilidad: asocia la <label> al control via htmlFor/id, marca el campo
 * requerido y, si hay error, lo enlaza con aria-describedby para que los
 * lectores de pantalla lo anuncien.
 *
 * Uso:
 *   <Field id="entrada" label="Fecha de entrada" required error={err}>
 *     <input id="entrada" ... />
 *   </Field>
 */
export default function Field({ id, label, required, error, hint, children }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="field__required" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>

      {/* Inyectamos aria-describedby/aria-invalid al control hijo. */}
      <div className="field__control">{children}</div>

      {hint && !error && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
