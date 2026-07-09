"""
tipo_cambio.py — tipo de cambio AUTOMÁTICO con caché y respaldo.

`tasa(base, moneda)` = cuántas unidades de la moneda BASE equivale 1 unidad de la
moneda extranjera (p. ej. para (PEN, USD) ≈ 3.75 = soles por 1 dólar; el "tipo de
cambio" tal como se expresa en Perú).

Estrategia (robusta, sin romper si no hay internet):
  1. Se cachea en la tabla `tipos_cambio` (global; PEN↔USD es igual para todos).
  2. Al pedir la tasa: si el caché es reciente (< TTL) se devuelve; si no, se intenta
     refrescar desde una API pública; si la API falla, se devuelve el ÚLTIMO valor
     cacheado (aunque esté algo viejo) y, si no hay ninguno, un DEFAULT seguro.
  3. El proveedor es intercambiable (hoy `open.er-api.com`; mañana SUNAT/SBS) sin
     tocar el resto del sistema.
"""
import json
import urllib.request
from datetime import datetime, timedelta

from database import get_connection

# Respaldo final si no hay caché y la API no responde (para no bloquear el flujo).
_DEFAULTS = {("PEN", "USD"): 3.75}
_TTL_HORAS = 8
_TIMEOUT = 6  # segundos para la llamada externa


def _fetch_api(base: str, moneda: str) -> float:
    """Trae la tasa (unidades de `base` por 1 de `moneda`) de una API pública.
    open.er-api.com/v6/latest/<moneda> devuelve rates[<base>] = base por 1 moneda."""
    url = f"https://open.er-api.com/v6/latest/{moneda}"
    req = urllib.request.Request(url, headers={"User-Agent": "Vantry-PMS"})
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        data = json.loads(resp.read().decode())
    tasa = (data.get("rates") or {}).get(base)
    if not tasa or float(tasa) <= 0:
        raise ValueError("respuesta sin tasa válida")
    return float(tasa)


def _leer_cache(cursor, base, moneda):
    cursor.execute(
        "SELECT tasa, actualizado_en FROM tipos_cambio WHERE moneda_base = ? AND moneda = ?",
        (base, moneda),
    )
    return cursor.fetchone()


def _guardar_cache(cursor, base, moneda, tasa, fuente):
    ahora = datetime.now().isoformat(timespec="seconds")
    cursor.execute(
        "SELECT 1 FROM tipos_cambio WHERE moneda_base = ? AND moneda = ?",
        (base, moneda),
    )
    if cursor.fetchone():
        cursor.execute(
            "UPDATE tipos_cambio SET tasa=?, fuente=?, actualizado_en=? WHERE moneda_base=? AND moneda=?",
            (tasa, fuente, ahora, base, moneda),
        )
    else:
        cursor.execute(
            "INSERT INTO tipos_cambio (moneda_base, moneda, tasa, fuente, actualizado_en) VALUES (?, ?, ?, ?, ?)",
            (base, moneda, tasa, fuente, ahora),
        )


def _es_reciente(actualizado_en) -> bool:
    try:
        t = datetime.fromisoformat(str(actualizado_en))
    except (ValueError, TypeError):
        return False
    return datetime.now() - t < timedelta(hours=_TTL_HORAS)


def _respaldo(base: str, moneda: str) -> dict:
    """Valor de último recurso: el DEFAULT si existe, o 0 (sin datos)."""
    d = _DEFAULTS.get((base, moneda))
    if d:
        return {"tasa": float(d), "fuente": "default", "actualizado_en": None}
    return {"tasa": 0.0, "fuente": "sin_datos", "actualizado_en": None}


def tasa(base: str, moneda: str) -> dict:
    """Devuelve {'tasa', 'fuente', 'actualizado_en'} para (base, moneda).
    Nunca lanza: ante CUALQUIER fallo (sin tabla, sin BD, sin internet) cae a
    caché o al DEFAULT. Un problema de tipo de cambio jamás debe dar 500."""
    base = (base or "PEN").upper()
    moneda = (moneda or "USD").upper()
    if base == moneda:
        return {"tasa": 1.0, "fuente": "identidad", "actualizado_en": None}

    try:
        conn = get_connection()
    except Exception:
        return _respaldo(base, moneda)

    try:
        cursor = conn.cursor()
        # La lectura del caché puede fallar si la tabla aún no existe → tratar
        # como "sin caché" y seguir (no romper).
        try:
            cache = _leer_cache(cursor, base, moneda)
        except Exception:
            cache = None
        if cache and _es_reciente(cache["actualizado_en"]):
            return {"tasa": float(cache["tasa"]), "fuente": "cache", "actualizado_en": cache["actualizado_en"]}
        # Refrescar desde la API; si falla, respaldo.
        try:
            nueva = _fetch_api(base, moneda)
        except Exception:
            if cache:
                return {"tasa": float(cache["tasa"]), "fuente": "cache_viejo", "actualizado_en": cache["actualizado_en"]}
            return _respaldo(base, moneda)
        # Tenemos tasa nueva; intentar cachearla (si falla, igual la devolvemos).
        try:
            _guardar_cache(cursor, base, moneda, nueva, "open.er-api.com")
            conn.commit()
        except Exception:
            pass
        return {"tasa": nueva, "fuente": "api", "actualizado_en": datetime.now().isoformat(timespec="seconds")}
    except Exception:
        return _respaldo(base, moneda)
    finally:
        try:
            conn.close()
        except Exception:
            pass


def tasa_efectiva(base: str, moneda: str, margen_pct: float = 0) -> dict:
    """Como `tasa`, pero aplica el margen % del hospedaje sobre el tipo oficial."""
    r = tasa(base, moneda)
    t = r["tasa"] * (1 + (float(margen_pct or 0) / 100.0))
    return {**r, "tasa": round(t, 6), "tasa_base": r["tasa"], "margen_pct": float(margen_pct or 0)}
