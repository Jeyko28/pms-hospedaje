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
    req = urllib.request.Request(url, headers={"User-Agent": "Stanza-PMS"})
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


def tasa(base: str, moneda: str) -> dict:
    """Devuelve {'tasa', 'fuente', 'actualizado_en'} para (base, moneda).
    Nunca lanza: siempre cae a caché o al DEFAULT."""
    base = (base or "PEN").upper()
    moneda = (moneda or "USD").upper()
    if base == moneda:
        return {"tasa": 1.0, "fuente": "identidad", "actualizado_en": None}

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cache = _leer_cache(cursor, base, moneda)
        # Caché fresco → devolver.
        if cache and _es_reciente(cache["actualizado_en"]):
            return {"tasa": float(cache["tasa"]), "fuente": "cache", "actualizado_en": cache["actualizado_en"]}
        # Refrescar desde la API; si falla, respaldo.
        try:
            nueva = _fetch_api(base, moneda)
            _guardar_cache(cursor, base, moneda, nueva, "open.er-api.com")
            conn.commit()
            return {"tasa": nueva, "fuente": "api", "actualizado_en": datetime.now().isoformat(timespec="seconds")}
        except Exception:
            if cache:
                return {"tasa": float(cache["tasa"]), "fuente": "cache_viejo", "actualizado_en": cache["actualizado_en"]}
            default = _DEFAULTS.get((base, moneda))
            if default:
                # Sembrar el default para que exista un valor de respaldo.
                _guardar_cache(cursor, base, moneda, default, "default")
                conn.commit()
                return {"tasa": float(default), "fuente": "default", "actualizado_en": None}
            return {"tasa": 0.0, "fuente": "sin_datos", "actualizado_en": None}
    finally:
        conn.close()


def tasa_efectiva(base: str, moneda: str, margen_pct: float = 0) -> dict:
    """Como `tasa`, pero aplica el margen % del hospedaje sobre el tipo oficial."""
    r = tasa(base, moneda)
    t = r["tasa"] * (1 + (float(margen_pct or 0) / 100.0))
    return {**r, "tasa": round(t, 6), "tasa_base": r["tasa"], "margen_pct": float(margen_pct or 0)}
