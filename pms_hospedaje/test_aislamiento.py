"""
test_aislamiento.py — verifica el AISLAMIENTO multi-tenant: un admin de un
hospedaje NO puede ver ni tocar datos de OTRO hospedaje.

Requiere el backend corriendo en local (SQLite):
    python -m uvicorn api:app --host 127.0.0.1 --port 8000
    python test_aislamiento.py

⚠️ Es un test de integración local (crea y borra una habitación de prueba en un
hospedaje ajeno). NO correr contra producción.
"""
import json
import sys
import urllib.request
import urllib.error

import database

BASE = "http://127.0.0.1:8000"
PNG = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0"
       "lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")


def http(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def main():
    st, j = http("POST", "/api/auth/login", body={"usuario": "admin", "password": "admin123"})
    token = j.get("token") or j.get("access_token")
    assert token, ("login", st, j)

    conn = database.get_connection()
    cur = conn.cursor()
    cur.execute("SELECT hospedaje_id FROM usuarios WHERE usuario='admin'")
    mi_hid = cur.fetchone()["hospedaje_id"]
    cur.execute("SELECT id FROM hospedajes WHERE id != ? ORDER BY id LIMIT 1", (mi_hid,))
    r = cur.fetchone()
    assert r, "Se necesitan >= 2 hospedajes locales para probar el aislamiento."
    ajeno_hid = r["id"]
    cur.execute(
        "INSERT INTO habitaciones (numero, tipo, precio_base, estado_limpieza, estado, activa, hospedaje_id) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("ISO-TEST", "Doble", 100, "Limpia", "disponible", 1, ajeno_hid),
    )
    conn.commit()
    b_room = cur.lastrowid
    cur.execute("SELECT id FROM reservas WHERE hospedaje_id != ? LIMIT 1", (mi_hid,))
    rr = cur.fetchone()
    reserva_ajena = rr["id"] if rr else None
    conn.close()

    print(f"admin=hospedaje {mi_hid} | hospedaje ajeno={ajeno_hid} | hab. ajena={b_room} "
          f"| reserva ajena={reserva_ajena}")
    fails = []

    # 1) Mi listado de habitaciones NO incluye la ajena.
    st, j = http("GET", "/api/habitaciones", token)
    ids = [h["id"] for h in j] if isinstance(j, list) else []
    if b_room in ids:
        fails.append("GET /api/habitaciones incluye una habitación de OTRO hospedaje")
    print(f"1) GET /habitaciones ({len(ids)} mías) — ajena visible: {b_room in ids} (debe ser False)")

    # 2-4) Acciones sobre la habitación ajena -> 404.
    checks = [
        ("PUT",  f"/api/habitaciones/{b_room}/detalles", {"descripcion": "x", "capacidad": 1, "amenidades": ""}),
        ("POST", f"/api/habitaciones/{b_room}/fotos", {"imagen": PNG}),
        ("GET",  f"/api/habitaciones/{b_room}/fotos", None),
    ]
    for i, (m, p, body) in enumerate(checks, start=2):
        st, _ = http(m, p, token, body)
        if st != 404:
            fails.append(f"{m} {p} dio {st} (esperaba 404 = no es tuyo)")
        print(f"{i}) {m} habitación ajena -> {st} (espera 404)")

    # 5) Acción sobre una reserva ajena -> 404.
    if reserva_ajena:
        st, _ = http("POST", f"/api/reservas/{reserva_ajena}/adelanto", token, {"estado": "verificado"})
        if st != 404:
            fails.append(f"verificar_adelanto de reserva ajena dio {st} (esperaba 404)")
        print(f"5) POST /reservas/{reserva_ajena}/adelanto (ajena) -> {st} (espera 404)")

    # Limpieza.
    conn = database.get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM habitaciones WHERE id=?", (b_room,))
    conn.commit()
    conn.close()

    print()
    if fails:
        print("❌ FALLOS DE AISLAMIENTO:")
        for f in fails:
            print("   -", f)
        sys.exit(1)
    print("==== ✅ AISLAMIENTO OK: un hospedaje NO accede a datos de otro ====")


if __name__ == "__main__":
    main()
