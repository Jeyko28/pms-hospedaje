import { useState } from "react";
import { Link2, Copy, Check, ExternalLink, Pencil, X, AlertTriangle } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api/client";
import Card from "./Card";
import "./LinkReservas.css";

/**
 * LinkReservas — tarjeta del Dashboard que muestra al dueño su LINK PÚBLICO
 * de reservas (para compartir en redes/WhatsApp) con un botón de copiar.
 *
 * El admin puede PERSONALIZAR el slug del link, pero con un cupo limitado
 * (el link se comparte; cambiarlo invalida los enlaces ya difundidos).
 *
 * El slug del hospedaje viene del usuario logueado (auth.publico). Si por
 * algún motivo no hay slug, la tarjeta no se muestra.
 */
export default function LinkReservas() {
  const { usuario, esAdmin, refrescarUsuario } = useAuth();
  const [copiado, setCopiado] = useState(false);
  const [editando, setEditando] = useState(false);

  const slug = usuario?.hospedaje_slug;
  if (!slug) return null;

  const cambiosMax = usuario?.slug_cambios_max ?? 3;
  const cambiosUsados = usuario?.slug_cambios ?? 0;
  const restantes = Math.max(0, cambiosMax - cambiosUsados);

  // El link usa el dominio actual + la ruta pública (#/reservar/<slug>).
  const url = `${window.location.origin}/#/reservar/${slug}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Fallback si el navegador bloquea el portapapeles: seleccionar el texto.
      window.prompt("Copia tu link de reservas:", url);
    }
  }

  return (
    <Card padding="md" className="linkres">
      <div className="linkres__cab">
        <span className="linkres__icono" aria-hidden="true">
          <Link2 size={20} />
        </span>
        <div className="linkres__cab-txt">
          <h2 className="linkres__titulo">Tu link de reservas</h2>
          <p className="linkres__sub">
            Compártelo en WhatsApp, Instagram o Google para recibir reservas directas.
          </p>
        </div>
        {esAdmin && !editando && restantes > 0 && (
          <button
            type="button"
            className="linkres__editar"
            onClick={() => setEditando(true)}
          >
            <Pencil size={15} />
            Personalizar
          </button>
        )}
      </div>

      {editando ? (
        <EditorSlug
          base={`${window.location.origin}/#/reservar/`}
          slugActual={slug}
          restantes={restantes}
          cambiosMax={cambiosMax}
          onCancelar={() => setEditando(false)}
          onGuardado={async () => {
            await refrescarUsuario();
            setEditando(false);
          }}
          cambiarSlug={api.cambiarSlug}
        />
      ) : (
        <>
          <div className="linkres__barra">
            <span className="linkres__url" title={url}>
              {url}
            </span>
            <button
              type="button"
              className="linkres__btn"
              onClick={copiar}
              aria-label="Copiar link"
            >
              {copiado ? <Check size={16} /> : <Copy size={16} />}
              {copiado ? "¡Copiado!" : "Copiar"}
            </button>
            <a
              className="linkres__btn linkres__btn--ghost"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={16} />
              Ver
            </a>
          </div>
          {esAdmin && (
            <p className="linkres__cupo">
              {restantes > 0
                ? `Puedes personalizar este link · te ${restantes === 1 ? "queda" : "quedan"} ${restantes} ${restantes === 1 ? "cambio" : "cambios"}.`
                : "Ya usaste todos tus cambios de link."}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * EditorSlug — formulario en línea para cambiar el slug. Valida en cliente,
 * muestra una vista previa de la URL final y avisa que consume un cambio.
 */
function EditorSlug({ base, slugActual, restantes, cambiosMax, onCancelar, onGuardado, cambiarSlug }) {
  const [valor, setValor] = useState(slugActual);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Misma normalización suave que el backend, en vivo: minúsculas, sin acentos,
  // espacios/símbolos -> guion. Así el usuario ve exactamente lo que quedará.
  function normalizar(t) {
    return t
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  const limpio = normalizar(valor);
  const sinCambio = limpio === slugActual;
  const demasiadoCorto = limpio.length < 3;

  async function guardar(e) {
    e.preventDefault();
    setError("");
    if (demasiadoCorto) {
      setError("Usa al menos 3 caracteres (letras, números o guiones).");
      return;
    }
    if (sinCambio) {
      onCancelar();
      return;
    }
    setGuardando(true);
    try {
      await cambiarSlug(limpio);
      await onGuardado();
    } catch (err) {
      setError(err?.message || "No se pudo cambiar el link. Inténtalo de nuevo.");
      setGuardando(false);
    }
  }

  return (
    <form className="linkres__editor" onSubmit={guardar}>
      <label className="linkres__campo-label" htmlFor="slug-input">
        Personaliza la parte final de tu link
      </label>
      <div className="linkres__campo">
        <span className="linkres__campo-base">{base}</span>
        <input
          id="slug-input"
          className="linkres__campo-input"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="hostal-el-sol"
          autoFocus
          spellCheck={false}
          autoCapitalize="none"
        />
      </div>

      {/* Vista previa de lo que realmente quedará guardado. */}
      <p className="linkres__preview">
        Quedará así: <strong>{base}{limpio || "…"}</strong>
      </p>

      <div className="linkres__aviso">
        <AlertTriangle size={15} />
        <span>
          Cambiar el link <strong>rompe los enlaces que ya compartiste</strong>. Te
          {restantes === 1 ? " queda" : " quedan"} <strong>{restantes}</strong> de {cambiosMax} cambios.
        </span>
      </div>

      {error && <p className="linkres__error">{error}</p>}

      <div className="linkres__acciones">
        <button
          type="submit"
          className="linkres__btn"
          disabled={guardando || demasiadoCorto || sinCambio}
        >
          {guardando ? "Guardando…" : "Guardar nuevo link"}
        </button>
        <button
          type="button"
          className="linkres__btn linkres__btn--ghost"
          onClick={onCancelar}
          disabled={guardando}
        >
          <X size={16} />
          Cancelar
        </button>
      </div>
    </form>
  );
}
