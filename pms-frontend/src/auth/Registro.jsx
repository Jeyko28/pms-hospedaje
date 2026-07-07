import { useState } from "react";
import { Hotel } from "lucide-react";
import { useAuth } from "./AuthContext";
import { useTheme } from "../hooks/useTheme";
import Field from "../components/Field";
import Button from "../components/Button";
import BotonGoogle from "./BotonGoogle";
import "./Login.css";

/**
 * Registro — onboarding self-service. Un cliente nuevo crea su hospedaje +
 * su cuenta admin y obtiene 14 días de prueba gratis. Al registrarse, entra
 * directo (AuthProvider guarda el token y muestra la app).
 *
 * Props: onIrALogin — vuelve a la pantalla de inicio de sesión.
 */
export default function Registro({ onIrALogin }) {
  const { registro } = useAuth();
  useTheme(); // asegura tema aplicado

  const [form, setForm] = useState({
    hospedaje_nombre: "",
    nombre: "",
    email: "",
    usuario: "",
    password: "",
  });
  const [acepta, setAcepta] = useState(false);
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [creando, setCreando] = useState(false);

  // Plan elegido en Precios (llega como #/registro?plan=crece). Informativo.
  const planDeseado =
    new URLSearchParams(window.location.hash.split("?")[1] || "").get("plan") || "";

  const set = (campo) => (e) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  function validar() {
    const e = {};
    if (!form.hospedaje_nombre.trim()) e.hospedaje_nombre = "Indica el nombre de tu hospedaje.";
    if (!form.nombre.trim()) e.nombre = "Indica tu nombre.";
    if (!form.email.trim()) e.email = "Indica tu correo.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      e.email = "Escribe un correo válido.";
    if (!form.usuario.trim()) e.usuario = "Elige un usuario para entrar.";
    if (form.password.length < 6) e.password = "Mínimo 6 caracteres.";
    if (!acepta) e.acepta = "Debes aceptar los Términos y la Política de Privacidad.";
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  async function enviar(e) {
    e.preventDefault();
    setErrorGeneral(null);
    if (!validar()) return;
    setCreando(true);
    try {
      await registro({
        hospedaje_nombre: form.hospedaje_nombre.trim(),
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        usuario: form.usuario.trim(),
        password: form.password,
        acepta_terminos: acepta,
        plan_deseado: planDeseado,
      });
      // Al tener éxito, AuthProvider entra directo a la app.
    } catch (err) {
      setErrorGeneral(err.message);
    } finally {
      setCreando(false);
    }
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={enviar} noValidate>
        <div className="login__brand">
          <span className="login__brand-mark" aria-hidden="true">
            <Hotel size={32} strokeWidth={2} />
          </span>
          <h1 className="login__title">Crea tu hospedaje</h1>
          <p className="login__subtitle">14 días de prueba gratis. Sin tarjeta.</p>
        </div>

        <Field id="hospedaje" label="Nombre del hospedaje" required error={errores.hospedaje_nombre}>
          <input
            id="hospedaje"
            type="text"
            value={form.hospedaje_nombre}
            onChange={set("hospedaje_nombre")}
            placeholder="Ej. Hostal El Sol"
            autoFocus
            aria-invalid={!!errores.hospedaje_nombre}
          />
        </Field>

        <Field id="nombre" label="Tu nombre" required error={errores.nombre}>
          <input
            id="nombre"
            type="text"
            value={form.nombre}
            onChange={set("nombre")}
            placeholder="Ej. Ana Torres"
            aria-invalid={!!errores.nombre}
          />
        </Field>

        <Field id="email" label="Correo" required error={errores.email}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={set("email")}
            placeholder="tucorreo@ejemplo.com"
            aria-invalid={!!errores.email}
          />
        </Field>

        <Field id="usuario" label="Usuario" required error={errores.usuario} hint="Con esto iniciarás sesión.">
          <input
            id="usuario"
            type="text"
            autoComplete="username"
            value={form.usuario}
            onChange={set("usuario")}
            aria-invalid={!!errores.usuario}
          />
        </Field>

        <Field id="password" label="Contraseña" required error={errores.password} hint="Mínimo 6 caracteres.">
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set("password")}
            aria-invalid={!!errores.password}
          />
        </Field>

        {planDeseado && (
          <p className="login__plan-nota">
            Plan elegido: <strong>{planDeseado[0].toUpperCase() + planDeseado.slice(1)}</strong> ·
            empiezas con 14 días de prueba.
          </p>
        )}

        <label className="login__terminos">
          <input
            type="checkbox"
            checked={acepta}
            onChange={(e) => setAcepta(e.target.checked)}
            aria-invalid={!!errores.acepta}
          />
          <span>
            Acepto los{" "}
            <a href="#/terminos" target="_blank" rel="noopener noreferrer">Términos y Condiciones</a>{" "}
            y la{" "}
            <a href="#/privacidad" target="_blank" rel="noopener noreferrer">Política de Privacidad</a>.
          </span>
        </label>
        {errores.acepta && <p className="login__error" role="alert">{errores.acepta}</p>}

        {errorGeneral && (
          <p className="login__error" role="alert">
            {errorGeneral}
          </p>
        )}

        <Button type="submit" disabled={creando} className="login__submit">
          {creando ? "Creando tu cuenta…" : "Crear cuenta gratis"}
        </Button>

        <BotonGoogle onError={setErrorGeneral} />

        <p className="login__alt">
          ¿Ya tienes cuenta?{" "}
          <button type="button" className="login__link" onClick={onIrALogin}>
            Inicia sesión
          </button>
        </p>
      </form>
    </div>
  );
}
