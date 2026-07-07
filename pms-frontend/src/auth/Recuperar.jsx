import { useState } from "react";
import { Hotel } from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import Field from "../components/Field";
import Button from "../components/Button";
import { api } from "../api/client";
import "./Login.css";

/**
 * Recuperar — recuperación de contraseña. Dos modos según la URL:
 *  - #/recuperar         → pide el correo y envía el enlace de reseteo.
 *  - #/reset?token=XXX    → pide la nueva contraseña usando el token del correo.
 *
 * Props: onIrALogin — vuelve al inicio de sesión.
 */
function tokenDeHash() {
  return new URLSearchParams(window.location.hash.split("?")[1] || "").get("token") || "";
}

export default function Recuperar({ onIrALogin }) {
  useTheme();
  const token = tokenDeHash();
  const modoReset = /^#\/reset\b/.test(window.location.hash);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);

  async function solicitar(e) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Escribe un correo válido.");
      return;
    }
    setCargando(true);
    try {
      const r = await api.recuperarPassword(email.trim());
      setOk(r.mensaje || "Si el correo existe, te enviamos un enlace.");
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function resetear(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setCargando(true);
    try {
      await api.resetPassword(token, password);
      setOk("Contraseña actualizada. Ya puedes iniciar sesión.");
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={modoReset ? resetear : solicitar} noValidate>
        <div className="login__brand">
          <span className="login__brand-mark" aria-hidden="true">
            <Hotel size={32} strokeWidth={2} />
          </span>
          <h1 className="login__title">
            {modoReset ? "Nueva contraseña" : "Recupera tu contraseña"}
          </h1>
          <p className="login__subtitle">
            {modoReset
              ? "Elige una contraseña nueva para tu cuenta."
              : "Te enviaremos un enlace a tu correo."}
          </p>
        </div>

        {ok ? (
          <>
            <p className="login__ok" role="status">{ok}</p>
            <Button type="button" className="login__submit" onClick={onIrALogin}>
              Ir a iniciar sesión
            </Button>
          </>
        ) : modoReset ? (
          <>
            <Field id="reset-pass" label="Nueva contraseña" required hint="Mínimo 6 caracteres.">
              <input
                id="reset-pass"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </Field>
            {error && <p className="login__error" role="alert">{error}</p>}
            <Button type="submit" disabled={cargando} className="login__submit">
              {cargando ? "Guardando…" : "Guardar contraseña"}
            </Button>
          </>
        ) : (
          <>
            <Field id="rec-email" label="Correo" required>
              <input
                id="rec-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tucorreo@ejemplo.com"
                autoFocus
              />
            </Field>
            {error && <p className="login__error" role="alert">{error}</p>}
            <Button type="submit" disabled={cargando} className="login__submit">
              {cargando ? "Enviando…" : "Enviar enlace"}
            </Button>
          </>
        )}

        <p className="login__alt">
          <button type="button" className="login__link" onClick={onIrALogin}>
            Volver a iniciar sesión
          </button>
        </p>
      </form>
    </div>
  );
}
