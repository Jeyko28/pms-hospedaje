"""
tarifas.py
Motor de precios por fecha (temporada / fin de semana) — centraliza el cálculo
del precio de la noche y del total de la estadía para que TODOS los puntos del
sistema (reservas, check-in/out, recálculo, disponibilidad pública) usen la
misma lógica (DRY).

Regla de tarifa (tabla `tarifas`): un override de precio que aplica a una noche
si cumple TODAS sus condiciones presentes:
  - rango de fechas [fecha_inicio, fecha_fin] (opcional),
  - días de la semana dias_semana (CSV de 0=Lun..6=Dom, opcional),
  - habitacion_id (opcional; NULL = todas las habitaciones).
El precio de la noche = `precio` absoluto si está definido (>0), si no
precio_base * (1 + ajuste_pct/100), si no el precio_base.

Si NO hay ninguna regla aplicable, se usa el precio_base de la habitación
(retrocompatible: sin tarifas configuradas, nada cambia).
"""

from datetime import datetime, timedelta

from database import get_connection


def obtener_reglas(hospedaje_id):
    """Devuelve las reglas de tarifa del hospedaje (lista de dicts).
    Si la tabla aún no existe, devuelve [] (no rompe)."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT id, nombre, fecha_inicio, fecha_fin, dias_semana,
                      habitacion_id, precio, ajuste_pct
               FROM tarifas WHERE hospedaje_id = ?""",
            (hospedaje_id,),
        )
        return [dict(r) for r in cursor.fetchall()]
    except Exception:
        return []
    finally:
        conn.close()


def _aplica(regla, fecha_str, habitacion_id):
    """¿La regla aplica a esta noche (fecha) y habitación?"""
    if regla.get("habitacion_id") and regla["habitacion_id"] != habitacion_id:
        return False
    fi, ff = regla.get("fecha_inicio"), regla.get("fecha_fin")
    if fi and ff:
        if not (fi <= fecha_str <= ff):
            return False
    elif fi and not ff:
        if fecha_str < fi:
            return False
    dw = regla.get("dias_semana")
    if dw:
        try:
            wd = datetime.strptime(fecha_str, "%Y-%m-%d").weekday()  # 0=Lun..6=Dom
        except (ValueError, TypeError):
            return False
        dias = {int(x) for x in str(dw).split(",") if x.strip().lstrip("-").isdigit()}
        if wd not in dias:
            return False
    return True


def _precio_una_noche(precio_base, fecha_str, habitacion_id, reglas):
    candidatas = [r for r in reglas if _aplica(r, fecha_str, habitacion_id)]
    if not candidatas:
        return round(precio_base, 2)
    # Más específica gana: por habitación (2) + con rango de fechas (1); desempata
    # la más reciente (id mayor).
    def _score(r):
        return ((2 if r.get("habitacion_id") else 0) + (1 if r.get("fecha_inicio") else 0), r.get("id") or 0)

    r = max(candidatas, key=_score)
    precio = r.get("precio")
    if precio is not None and precio > 0:
        return round(precio, 2)
    pct = r.get("ajuste_pct")
    if pct:
        return round(precio_base * (1 + pct / 100.0), 2)
    return round(precio_base, 2)


def total_estadia(hospedaje_id, habitacion_id, precio_base, fecha_entrada, fecha_salida, reglas=None):
    """Suma el precio de cada noche en [entrada, salida) aplicando las tarifas.
    Si no hay reglas, equivale a noches * precio_base."""
    if reglas is None:
        reglas = obtener_reglas(hospedaje_id)
    try:
        d = datetime.strptime(fecha_entrada, "%Y-%m-%d")
        fin = datetime.strptime(fecha_salida, "%Y-%m-%d")
    except (ValueError, TypeError):
        return 0.0
    total = 0.0
    while d < fin:
        total += _precio_una_noche(precio_base, d.strftime("%Y-%m-%d"), habitacion_id, reglas)
        d += timedelta(days=1)
    return round(total, 2)
