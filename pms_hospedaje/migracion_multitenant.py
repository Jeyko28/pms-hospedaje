"""
migracion_multitenant.py
Etapa 4.1 (cimiento SaaS) — Prepara la base de datos para multi-cliente.

Qué hace (de forma SEGURA, idempotente y reversible-friendly):
  1. Crea la tabla `hospedajes` (cada cliente = un registro / "tenant").
  2. Asegura que exista el "Hospedaje #1" (el actual, datos ya existentes).
  3. Añade la columna `hospedaje_id` a las 7 tablas de datos + a `usuarios`,
     SOLO si aún no existe (usa ALTER TABLE ADD COLUMN, no recrea ni borra).
  4. Asigna todos los registros existentes (sin hospedaje) al Hospedaje #1.

Compatibilidad:
  - Funciona en SQLite (local / app de escritorio) y PostgreSQL (nube).
  - NO rompe la app de escritorio: la columna lleva DEFAULT 1, así los INSERT
    antiguos (que no envían hospedaje_id) siguen funcionando.

Esta migración es "invisible": no cambia el comportamiento de la app todavía.
Es solo el cimiento de datos. El filtrado por hospedaje vendrá en pasos
posteriores (auth + endpoints).
"""

import dbengine

# Tablas de datos que pertenecen a un hospedaje (se les añade hospedaje_id).
TABLAS_TENANT = [
    "habitaciones",
    "tareas_limpieza",
    "huespedes",
    "reservas",
    "estancias",
    "facturas",
    "pagos",
]


def _columnas_de(cursor, tabla):
    """Devuelve el conjunto de nombres de columnas de una tabla,
    según el motor (SQLite usa PRAGMA; PostgreSQL usa information_schema)."""
    if dbengine.USA_POSTGRES:
        cursor.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = %s",
            (tabla,),
        )
        return {row[0] for row in cursor.fetchall()}
    else:
        # SQLite: PRAGMA no admite parámetros, se interpola el nombre (es interno).
        cursor.execute(f"PRAGMA table_info({tabla})")
        return {row[1] for row in cursor.fetchall()}


def _tabla_existe(cursor, tabla):
    if dbengine.USA_POSTGRES:
        cursor.execute(
            "SELECT 1 FROM information_schema.tables WHERE table_name = %s",
            (tabla,),
        )
    else:
        cursor.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
            (tabla,),
        )
    return cursor.fetchone() is not None


def migrar(conn):
    """Ejecuta la migración multi-tenant sobre una conexión abierta.
    Idempotente: se puede llamar muchas veces sin efectos duplicados."""
    cursor = conn.cursor()

    # ----- 1. Tabla hospedajes (el tenant) -----
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS hospedajes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            slug TEXT,
            plan TEXT DEFAULT 'trial',          -- 'trial' | 'basico' | 'pro'
            estado TEXT DEFAULT 'activo',        -- 'prueba'|'activo'|'suspendido'|'cancelado'
            fecha_inicio TEXT DEFAULT CURRENT_TIMESTAMP,
            fecha_expira TEXT,
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # ----- 2. Asegurar el Hospedaje #1 (el actual) -----
    cursor.execute("SELECT COUNT(*) FROM hospedajes")
    if cursor.fetchone()[0] == 0:
        cursor.execute(
            "INSERT INTO hospedajes (nombre, slug, plan, estado) VALUES (?, ?, ?, ?)",
            ("Mi Hospedaje", "principal", "pro", "activo"),
        )

    # ----- 3. Añadir hospedaje_id a cada tabla tenant + usuarios -----
    tablas = list(TABLAS_TENANT)
    if _tabla_existe(cursor, "usuarios"):
        tablas.append("usuarios")

    for tabla in tablas:
        if not _tabla_existe(cursor, tabla):
            continue
        cols = _columnas_de(cursor, tabla)
        if "hospedaje_id" not in cols:
            # DEFAULT 1 => los INSERT antiguos (app de escritorio) siguen valiendo,
            # y las filas existentes quedan asignadas al Hospedaje #1.
            cursor.execute(
                f"ALTER TABLE {tabla} ADD COLUMN hospedaje_id INTEGER DEFAULT 1"
            )
            # Asegurar que filas previas (por si el default no las tocó) tengan id 1.
            cursor.execute(
                f"UPDATE {tabla} SET hospedaje_id = 1 WHERE hospedaje_id IS NULL"
            )

    conn.commit()


if __name__ == "__main__":
    # Permite correr la migración a mano:  python migracion_multitenant.py
    import database
    c = database.get_connection()
    migrar(c)
    c.close()
    print("Migración multi-tenant aplicada.")
