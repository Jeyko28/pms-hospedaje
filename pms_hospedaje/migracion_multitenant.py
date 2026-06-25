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

    # ----- 4. Columna 'origen' en reservas ('manual' | 'publico') -----
    # Para reportes: distinguir reservas creadas a mano vs. por el link público.
    # Las existentes quedan 'manual' (no podemos saber su origen retroactivo).
    if _tabla_existe(cursor, "reservas"):
        cols_reservas = _columnas_de(cursor, "reservas")
        if "origen" not in cols_reservas:
            cursor.execute("ALTER TABLE reservas ADD COLUMN origen TEXT DEFAULT 'manual'")
            cursor.execute("UPDATE reservas SET origen = 'manual' WHERE origen IS NULL")
            conn.commit()

    # ----- 5. Columna 'slug_cambios' en hospedajes (contador de cambios de link) -----
    # El admin puede personalizar el slug del link público, pero con un cupo
    # limitado (el link se comparte; cambiarlo a menudo rompe enlaces ya difundidos).
    if _tabla_existe(cursor, "hospedajes"):
        cols_hosp = _columnas_de(cursor, "hospedajes")
        if "slug_cambios" not in cols_hosp:
            cursor.execute("ALTER TABLE hospedajes ADD COLUMN slug_cambios INTEGER DEFAULT 0")
            cursor.execute("UPDATE hospedajes SET slug_cambios = 0 WHERE slug_cambios IS NULL")
            conn.commit()

    # ----- 6. Tabla 'visitas' (analítica de la página pública de reservas) -----
    # Cada vez que alguien abre el link público de un hospedaje se registra una
    # visita. Alimenta el "Visitors Chart" del dashboard. Se llena solo con el
    # tráfico real del link.
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS visitas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hospedaje_id INTEGER,
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()

    # ----- 7. Columnas 'descuento' y 'descuento_motivo' en facturas -----
    # Permiten aplicar un descuento/cortesía al cobro (total = subtotal - descuento)
    # sin tocar el precio base de la habitación. Las facturas previas quedan con 0.
    if _tabla_existe(cursor, "facturas"):
        cols_fact = _columnas_de(cursor, "facturas")
        if "descuento" not in cols_fact:
            cursor.execute("ALTER TABLE facturas ADD COLUMN descuento REAL DEFAULT 0")
            cursor.execute("UPDATE facturas SET descuento = 0 WHERE descuento IS NULL")
        if "descuento_motivo" not in cols_fact:
            cursor.execute("ALTER TABLE facturas ADD COLUMN descuento_motivo TEXT DEFAULT ''")
        conn.commit()

    # ----- 8. Auditoría por usuario: quién cobró / hizo check-in / check-out -----
    if _tabla_existe(cursor, "pagos"):
        if "usuario_id" not in _columnas_de(cursor, "pagos"):
            cursor.execute("ALTER TABLE pagos ADD COLUMN usuario_id INTEGER")
            conn.commit()
    if _tabla_existe(cursor, "estancias"):
        cols_est = _columnas_de(cursor, "estancias")
        if "usuario_checkin_id" not in cols_est:
            cursor.execute("ALTER TABLE estancias ADD COLUMN usuario_checkin_id INTEGER")
        if "usuario_checkout_id" not in cols_est:
            cursor.execute("ALTER TABLE estancias ADD COLUMN usuario_checkout_id INTEGER")
        conn.commit()

    # ----- 9. Tabla 'bloqueos' (habitación fuera de servicio por rango de fechas) -----
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS bloqueos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hospedaje_id INTEGER,
            habitacion_id INTEGER NOT NULL,
            fecha_inicio TEXT NOT NULL,
            fecha_fin TEXT NOT NULL,
            motivo TEXT DEFAULT '',
            creado_por INTEGER,
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()

    # ----- 10. Columna 'tipo_documento' en huespedes (DNI/CE/Pasaporte) -----
    if _tabla_existe(cursor, "huespedes"):
        if "tipo_documento" not in _columnas_de(cursor, "huespedes"):
            cursor.execute("ALTER TABLE huespedes ADD COLUMN tipo_documento TEXT DEFAULT 'DNI'")
            conn.commit()

    # ----- 11. Identidad del negocio en hospedajes (para la factura/comprobante) -----
    # Datos reales de cada hospedaje que antes estaban "quemados" en el PDF.
    # 'hospedajes' es la fuente de verdad; estos campos pre-llenan la config SUNAT.
    if _tabla_existe(cursor, "hospedajes"):
        cols_hosp_id = _columnas_de(cursor, "hospedajes")
        for col in ("ruc", "razon_social", "direccion", "telefono", "email_contacto"):
            if col not in cols_hosp_id:
                cursor.execute(f"ALTER TABLE hospedajes ADD COLUMN {col} TEXT DEFAULT ''")
        conn.commit()

    # ----- 13. Tabla 'cierres_turno' (arqueo firmado de caja por turno/día) -----
    # Snapshot de lo cobrado al cerrar el turno: total y desglose por método,
    # efectivo esperado vs contado y diferencia, con quién y cuándo. NO bloquea
    # pagos (un cobro tardío legítimo debe poder registrarse igual).
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS cierres_turno (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hospedaje_id INTEGER,
            usuario_id INTEGER,
            usuario_nombre TEXT DEFAULT '',
            fecha TEXT NOT NULL,
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
            total_sistema REAL DEFAULT 0,
            efectivo_sistema REAL DEFAULT 0,
            efectivo_contado REAL,
            diferencia REAL,
            num_pagos INTEGER DEFAULT 0,
            por_metodo TEXT DEFAULT '[]',
            notas TEXT DEFAULT ''
        )
        """
    )
    conn.commit()

    # ----- 12. Índices para rendimiento multi-tenant -----
    # Casi todas las consultas filtran por hospedaje_id y por las FK de relación
    # (habitacion_id, factura_id, etc.). Sin índices, cada lectura es un full-scan
    # que se degrada al crecer los datos. Idempotente (CREATE INDEX IF NOT EXISTS,
    # válido en SQLite y PostgreSQL) y barato.
    _crear_indices(cursor, conn)

    # Quitar la restriccion UNIQUE global de habitaciones.numero (de antes del
    # multi-tenant). En un SaaS, dos hospedajes distintos pueden tener su propia
    # habitacion "101"; la unicidad correcta es POR hospedaje (validada en la API).
    _quitar_unique_numero_habitaciones(cursor, conn)


# Índices: (nombre, tabla, columna). Cubren el filtro de tenant (hospedaje_id),
# las FK usadas en JOINs y los campos de filtrado más frecuentes.
_INDICES = [
    ("idx_habitaciones_hosp", "habitaciones", "hospedaje_id"),
    ("idx_huespedes_hosp", "huespedes", "hospedaje_id"),
    ("idx_reservas_hosp", "reservas", "hospedaje_id"),
    ("idx_reservas_hab", "reservas", "habitacion_id"),
    ("idx_reservas_estado", "reservas", "estado"),
    ("idx_estancias_hab", "estancias", "habitacion_id"),
    ("idx_estancias_reserva", "estancias", "reserva_id"),
    ("idx_estancias_estado", "estancias", "estado"),
    ("idx_facturas_hosp", "facturas", "hospedaje_id"),
    ("idx_facturas_estancia", "facturas", "estancia_id"),
    ("idx_facturas_huesped", "facturas", "huesped_id"),
    ("idx_pagos_factura", "pagos", "factura_id"),
    ("idx_pagos_hosp", "pagos", "hospedaje_id"),
    ("idx_bloqueos_hab", "bloqueos", "habitacion_id"),
    ("idx_bloqueos_hosp", "bloqueos", "hospedaje_id"),
    ("idx_tareas_hosp", "tareas_limpieza", "hospedaje_id"),
    ("idx_tareas_hab", "tareas_limpieza", "habitacion_id"),
    ("idx_visitas_hosp", "visitas", "hospedaje_id"),
    ("idx_usuarios_usuario", "usuarios", "usuario"),
    ("idx_usuarios_hosp", "usuarios", "hospedaje_id"),
    ("idx_comprobantes_hosp", "comprobantes", "hospedaje_id"),
    ("idx_cierres_hosp", "cierres_turno", "hospedaje_id"),
]


def _crear_indices(cursor, conn):
    """Crea los índices de rendimiento de forma idempotente y segura.
    Verifica que la tabla y la columna existan antes (algunas tablas, como
    comprobantes, se crean en otro módulo). Nunca rompe el arranque."""
    creados = 0
    for nombre, tabla, columna in _INDICES:
        if not _tabla_existe(cursor, tabla):
            continue
        if columna not in _columnas_de(cursor, tabla):
            continue
        try:
            cursor.execute(
                f"CREATE INDEX IF NOT EXISTS {nombre} ON {tabla} ({columna})"
            )
            creados += 1
        except Exception:
            # Un índice que falla no debe impedir el arranque de la app.
            pass
    conn.commit()
    return creados


def _quitar_unique_numero_habitaciones(cursor, conn):
    """Elimina el UNIQUE global de habitaciones.numero si todavia existe.
    Idempotente y compatible con SQLite y PostgreSQL."""
    if not _tabla_existe(cursor, "habitaciones"):
        return

    if dbengine.USA_POSTGRES:
        # En Postgres, buscar y eliminar cualquier constraint UNIQUE sobre 'numero'.
        cursor.execute(
            """
            SELECT tc.constraint_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.constraint_column_usage ccu
              ON tc.constraint_name = ccu.constraint_name
            WHERE tc.table_name = 'habitaciones'
              AND tc.constraint_type = 'UNIQUE'
              AND ccu.column_name = 'numero'
            """
        )
        for row in cursor.fetchall():
            nombre = row[0]
            try:
                cursor.execute(f'ALTER TABLE habitaciones DROP CONSTRAINT "{nombre}"')
            except Exception:
                pass
        conn.commit()
        return

    # SQLite: no permite DROP CONSTRAINT. Si la definicion tiene UNIQUE en numero,
    # recreamos la tabla sin esa restriccion, preservando los datos.
    fila = cursor.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='habitaciones'"
    ).fetchone()
    if not fila:
        return
    definicion = fila[0] if not hasattr(fila, "keys") else fila["sql"]
    if "UNIQUE" not in (definicion or "").upper():
        return  # ya esta limpia

    cursor.executescript(
        """
        PRAGMA foreign_keys=OFF;
        CREATE TABLE habitaciones_nueva (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT NOT NULL,
            tipo TEXT NOT NULL,
            precio_base REAL NOT NULL,
            estado_limpieza TEXT DEFAULT 'Limpia',
            estado TEXT DEFAULT 'disponible',
            activa INTEGER DEFAULT 1,
            hospedaje_id INTEGER DEFAULT 1
        );
        INSERT INTO habitaciones_nueva (id, numero, tipo, precio_base, estado_limpieza, estado, activa, hospedaje_id)
            SELECT id, numero, tipo, precio_base, estado_limpieza, estado, activa,
                   COALESCE(hospedaje_id, 1)
            FROM habitaciones;
        DROP TABLE habitaciones;
        ALTER TABLE habitaciones_nueva RENAME TO habitaciones;
        PRAGMA foreign_keys=ON;
        """
    )
    conn.commit()


if __name__ == "__main__":
    # Permite correr la migración a mano:  python migracion_multitenant.py
    import database
    c = database.get_connection()
    migrar(c)
    c.close()
    print("Migración multi-tenant aplicada.")
