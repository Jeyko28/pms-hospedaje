import { useState } from "react";
import { Hotel } from "lucide-react";
import { useAuth } from "./AuthContext";
import { useTheme } from "../hooks/useTheme";
import Field from "../components/Field";
import Button from "../components/Button";
import "./Login.css";

/**
 * Login — pantalla de acceso. Centrada, sobria, con la marca arriba.
 * Muestra errores claros y deshabilita el boton mientras valida
 * (heuristica: prevencion de errores + visibilidad del estado).
 */
export default function Login() {
  const { login } = useAuth();
  const { theme } = useTheme(); // asegura que el tema se aplique tambien aqui

  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [entrando, setEntrando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError(null);
    if (!usuario.trim() || !password) {
      setError("Escribe tu usuario y contraseña.");
      return;
    }
    setEntrando(true);
    try {
      await login(usuario.trim(), password);
      // Al tener exito, AuthProvider actualiza el usuario y App muestra la app.
    } catch (err) {
      setError(err.message);
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="login" data-theme-aware={theme}>
      <form className="login__card" onSubmit={enviar} noValidate>
        <div className="login__brand">
          <span className="login__brand-mark" aria-hidden="true">
            <Hotel size={32} strokeWidth={2} />
          </span>
          <h1 className="login__title">PMS Hospedaje</h1>
          <p className="login__subtitle">Inicia sesión para continuar</p>
        </div>

        <Field id="usuario" label="Usuario" required>
          <input
            id="usuario"
            type="text"
            autoComplete="username"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoFocus
          />
        </Field>

        <Field id="password" label="Contraseña" required>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && (
          <p className="login__error" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" disabled={entrando} className="login__submit">
          {entrando ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </div>
  );
}
