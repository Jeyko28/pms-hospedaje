import { useState } from "react";
import { MessageCircle, Clock, Send, CheckCircle2 } from "lucide-react";
import { waLink } from "./datos";
import { api } from "../../api/client";
import { Reveal } from "./useReveal";

/**
 * Contacto — canales privados. NO se muestra el número ni el correo: WhatsApp es
 * un deep link (abre el chat sin revelar el número) y el correo se reemplaza por
 * un formulario que guarda el mensaje (POST /api/contacto) para que el dueño lo
 * revise en su panel. Así no se expone información personal.
 */
export default function Contacto() {
  const [form, setForm] = useState({ nombre: "", contacto: "", mensaje: "" });
  const [estado, setEstado] = useState(null); // null | 'ok' | {error}
  const [enviando, setEnviando] = useState(false);

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function enviar(e) {
    e.preventDefault();
    setEstado(null);
    if (!form.mensaje.trim()) {
      setEstado({ error: "Escribe tu mensaje." });
      return;
    }
    setEnviando(true);
    try {
      await api.enviarContacto({
        nombre: form.nombre.trim(),
        contacto: form.contacto.trim(),
        mensaje: form.mensaje.trim(),
      });
      setEstado("ok");
      setForm({ nombre: "", contacto: "", mensaje: "" });
    } catch (err) {
      setEstado({ error: err.message || "No se pudo enviar. Intenta por WhatsApp." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="sitio-contacto">
      <div className="pagina-head">
        <h1>Hablemos</h1>
        <p>
          ¿Dudas, una demo o quieres empezar? Escríbenos por WhatsApp o déjanos un mensaje.
          Somos personas reales, en Perú.
        </p>
      </div>

      <Reveal className="contacto-grid">
        {/* WhatsApp: deep link, sin mostrar el número */}
        <a
          className="contacto-card contacto-card--wa"
          href={waLink("Hola, quiero información sobre Vantry para mi hospedaje.")}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="s-ico s-ico--success" aria-hidden="true">
            <MessageCircle size={22} />
          </span>
          <h2>WhatsApp</h2>
          <p>La vía más rápida. Toca para abrir el chat con nosotros directamente.</p>
          <p style={{ marginTop: "0.75rem", display: "inline-flex", alignItems: "center", gap: ".4rem", color: "var(--s-success)", fontWeight: 600 }}>
            Abrir chat <MessageCircle size={16} aria-hidden="true" />
          </p>
          <p style={{ marginTop: "1.25rem", display: "inline-flex", alignItems: "center", gap: ".4rem", color: "var(--s-text-muted)", fontSize: ".8125rem" }}>
            <Clock size={14} aria-hidden="true" /> Lun a Sáb · 9:00–19:00 (Perú)
          </p>
        </a>

        {/* Formulario: reemplaza el correo, no expone nada */}
        <div className="contacto-card">
          <h2>Envíanos un mensaje</h2>
          <p style={{ marginBottom: "1.25rem" }}>Te respondemos por el medio que nos dejes.</p>

          {estado === "ok" ? (
            <div className="contacto-form__estado contacto-form__estado--ok" role="status">
              <CheckCircle2 size={16} aria-hidden="true" style={{ verticalAlign: "-3px", marginRight: 6 }} />
              ¡Gracias! Recibimos tu mensaje y te contactaremos pronto.
            </div>
          ) : (
            <form onSubmit={enviar} noValidate>
              {estado?.error && (
                <div className="contacto-form__estado contacto-form__estado--err" role="alert">
                  {estado.error}
                </div>
              )}
              <div className="s-field">
                <label htmlFor="c-nombre">Tu nombre</label>
                <input id="c-nombre" type="text" value={form.nombre} onChange={set("nombre")} placeholder="Ej. Ana Torres" />
              </div>
              <div className="s-field">
                <label htmlFor="c-contacto">Cómo contactarte (WhatsApp o correo)</label>
                <input id="c-contacto" type="text" value={form.contacto} onChange={set("contacto")} placeholder="Ej. 999 888 777 o tucorreo@ejemplo.com" />
              </div>
              <div className="s-field">
                <label htmlFor="c-mensaje">Mensaje</label>
                <textarea id="c-mensaje" value={form.mensaje} onChange={set("mensaje")} placeholder="Cuéntanos sobre tu hospedaje o qué necesitas…" required />
              </div>
              <button type="submit" className="s-btn s-btn--primary" disabled={enviando} style={{ width: "100%" }}>
                {enviando ? "Enviando…" : (<>Enviar mensaje <Send size={16} aria-hidden="true" /></>)}
              </button>
            </form>
          )}
        </div>
      </Reveal>

      <section className="cta-final__wrap">
        <Reveal className="cta-final">
          <h2>¿Prefieres probarlo tú mismo?</h2>
          <p>Crea tu cuenta y explora Vantry 14 días gratis, sin tarjeta.</p>
          <div className="cta-final__acciones">
            <a className="s-btn s-btn--primary s-btn--lg" href="#/registro">Empieza gratis</a>
            <a className="s-btn s-btn--ghost s-btn--lg" href="#/precios">Ver precios</a>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
