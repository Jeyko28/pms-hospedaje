"""
correo.py — envío de correos, modular y sin romper si no está configurado.

Proveedor por configuración (variables de entorno):
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_TLS (1/0)
  SMTP_FROM_NAME  (nombre visible del remitente; por defecto "Vantry PMS")
  APP_URL  (base para los enlaces, p. ej. https://vantry-pms.vercel.app)

Si NO hay SMTP configurado, cae a un proveedor de DESARROLLO que solo registra
el correo por consola (para probar el flujo sin servidor de correo). `enviar`
nunca lanza: un fallo de correo jamás debe romper el registro/recuperación.

Añadir otro proveedor (SendGrid, SES…) = otra rama en `enviar`, sin tocar el resto.
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr


def app_url() -> str:
    return (os.environ.get("APP_URL") or "http://localhost:5174").rstrip("/")


def _smtp_config():
    host = os.environ.get("SMTP_HOST")
    if not host:
        return None
    return {
        "host": host,
        "port": int(os.environ.get("SMTP_PORT") or 587),
        "user": os.environ.get("SMTP_USER") or "",
        "password": os.environ.get("SMTP_PASS") or "",
        "from": os.environ.get("SMTP_FROM") or os.environ.get("SMTP_USER") or "no-reply@vantry.pe",
        "from_name": os.environ.get("SMTP_FROM_NAME") or "Vantry PMS",
        "tls": (os.environ.get("SMTP_TLS", "1") not in ("0", "false", "False")),
    }


def enviar(destinatario: str, asunto: str, html: str, texto: str = "") -> bool:
    """Envía un correo. Devuelve True si se envió (o se registró en dev). Nunca lanza."""
    cfg = _smtp_config()
    if not cfg:
        # Modo desarrollo: no hay SMTP → registrar por consola.
        print(f"[correo:dev] Para: {destinatario} | Asunto: {asunto}\n{texto or html}\n")
        return True
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = asunto
        # Cabecera con nombre visible ("Vantry PMS <correo>"); el sobre (sendmail)
        # usa el correo pelado, que es el remitente verificado en Brevo.
        msg["From"] = formataddr((cfg["from_name"], cfg["from"]))
        msg["To"] = destinatario
        if texto:
            msg.attach(MIMEText(texto, "plain", "utf-8"))
        msg.attach(MIMEText(html, "html", "utf-8"))
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=10) as s:
            if cfg["tls"]:
                s.starttls()
            if cfg["user"]:
                s.login(cfg["user"], cfg["password"])
            s.sendmail(cfg["from"], [destinatario], msg.as_string())
        return True
    except Exception as e:
        print(f"[correo] fallo al enviar a {destinatario}: {e}")
        return False


# --------------------------------------------------------------------------- #
#  Plantillas
# --------------------------------------------------------------------------- #
def _envolver(titulo: str, cuerpo_html: str) -> str:
    return f"""\
<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1f2430">
  <h2 style="color:#4F46E5">Vantry</h2>
  <h3>{titulo}</h3>
  {cuerpo_html}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="font-size:12px;color:#888">Vantry · PMS para hospedajes del Perú</p>
</div>"""


def bienvenida(email: str, nombre: str, hospedaje: str) -> bool:
    asunto = "¡Bienvenido a Vantry!"
    html = _envolver(
        f"Hola, {nombre}",
        f"<p>Tu hospedaje <strong>{hospedaje}</strong> ya está creado con "
        f"<strong>14 días de prueba gratis</strong>.</p>"
        f'<p><a href="{app_url()}" style="background:#4F46E5;color:#fff;padding:10px 18px;'
        f'border-radius:8px;text-decoration:none">Entrar a Vantry</a></p>'
        f"<p>Cualquier duda, escríbenos por WhatsApp. ¡A dejar el Excel!</p>",
    )
    texto = (f"Hola {nombre}. Tu hospedaje {hospedaje} ya está creado con 14 días de prueba. "
             f"Entra en {app_url()}")
    return enviar(email, asunto, html, texto)


def recuperar_password(email: str, nombre: str, enlace: str) -> bool:
    asunto = "Restablece tu contraseña de Vantry"
    html = _envolver(
        f"Hola, {nombre}",
        f"<p>Recibimos una solicitud para restablecer tu contraseña.</p>"
        f'<p><a href="{enlace}" style="background:#4F46E5;color:#fff;padding:10px 18px;'
        f'border-radius:8px;text-decoration:none">Crear nueva contraseña</a></p>'
        f"<p>Si no fuiste tú, ignora este correo. El enlace vence en 1 hora.</p>",
    )
    texto = f"Restablece tu contraseña en: {enlace} (vence en 1 hora). Si no fuiste tú, ignóralo."
    return enviar(email, asunto, html, texto)


def verificar_email(email: str, nombre: str, enlace: str) -> bool:
    asunto = "Confirma tu correo en Vantry"
    html = _envolver(
        f"Hola, {nombre}",
        f"<p>Confirma tu correo para asegurar tu cuenta.</p>"
        f'<p><a href="{enlace}" style="background:#4F46E5;color:#fff;padding:10px 18px;'
        f'border-radius:8px;text-decoration:none">Confirmar mi correo</a></p>',
    )
    texto = f"Confirma tu correo en: {enlace}"
    return enviar(email, asunto, html, texto)
