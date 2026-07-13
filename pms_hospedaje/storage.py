"""
storage.py — subida de imágenes a Supabase Storage, con fallback.

Si NO está configurado (faltan SUPABASE_URL / SUPABASE_SERVICE_KEY), las funciones
devuelven None y el llamador guarda la imagen en la BD como base64 (comportamiento
anterior). Así el entorno local (sin Supabase) sigue funcionando igual.

Config (variables de entorno, en Render):
  SUPABASE_URL          p.ej. https://jzilqifubbsducnbrlrx.supabase.co
  SUPABASE_SERVICE_KEY  la "service_role" key (secreta; solo backend)
  SUPABASE_BUCKET       nombre del bucket público (por defecto "fotos")
"""
import base64
import os
import re
import urllib.request
import urllib.error
import uuid

_EXT = {"image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp"}


def _config():
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        return None
    return {"url": url, "key": key, "bucket": os.environ.get("SUPABASE_BUCKET", "fotos").strip() or "fotos"}


def disponible() -> bool:
    """True si Storage está configurado (si no, se usa base64 en la BD)."""
    return _config() is not None


def _parse_data_url(data_url: str):
    m = re.match(r"data:(image/[\w.+-]+);base64,(.*)$", data_url or "", re.DOTALL)
    if not m:
        return None, None
    try:
        return m.group(1).lower(), base64.b64decode(m.group(2))
    except Exception:
        return None, None


def subir_imagen(data_url: str, prefijo: str):
    """Sube la imagen (data URL base64) a Supabase Storage.
    Devuelve {'url': <url pública>, 'path': <ruta en el bucket>} o None si no se
    pudo (sin config o error) → el llamador cae a base64."""
    cfg = _config()
    if not cfg:
        return None
    mime, raw = _parse_data_url(data_url)
    if raw is None:
        return None
    ext = _EXT.get(mime, "jpg")
    path = f"{prefijo}/{uuid.uuid4().hex}.{ext}"
    endpoint = f"{cfg['url']}/storage/v1/object/{cfg['bucket']}/{path}"
    req = urllib.request.Request(endpoint, data=raw, method="POST")
    req.add_header("Authorization", f"Bearer {cfg['key']}")
    req.add_header("apikey", cfg["key"])
    req.add_header("Content-Type", mime)
    req.add_header("x-upsert", "true")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            resp.read()
    except Exception as e:
        print(f"[storage] fallo al subir: {e}")
        return None
    return {"url": f"{cfg['url']}/storage/v1/object/public/{cfg['bucket']}/{path}", "path": path}


def borrar_objeto(path: str):
    """Elimina un objeto del bucket (best-effort; nunca lanza)."""
    cfg = _config()
    if not cfg or not path:
        return
    endpoint = f"{cfg['url']}/storage/v1/object/{cfg['bucket']}/{path}"
    req = urllib.request.Request(endpoint, method="DELETE")
    req.add_header("Authorization", f"Bearer {cfg['key']}")
    req.add_header("apikey", cfg["key"])
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read()
    except Exception as e:
        print(f"[storage] fallo al borrar {path}: {e}")
