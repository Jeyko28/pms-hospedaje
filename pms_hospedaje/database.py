"""
database.py
Gestiona la conexión a la base de datos y crea todas las tablas.

Usa dbengine, que elige automáticamente el motor:
  - PostgreSQL si existe la variable de entorno DATABASE_URL (nube/producción).
  - SQLite en caso contrario (desarrollo local y la app de escritorio).
El resto de este archivo no cambia: el motor traduce la sintaxis por debajo.
"""

import sqlite3  # se mantiene por compatibilidad (sqlite3.Row en código legado)
import dbengine

DB_NAME = "pms_prueba.db"

def get_connection():
    return dbengine.conectar(DB_NAME)

def crear_tablas():
    conn = get_connection()
    cursor = conn.cursor()

    # Tabla habitaciones (con nuevo campo 'estado' y 'estado_limpieza')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS habitaciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT UNIQUE NOT NULL,
            tipo TEXT NOT NULL,
            precio_base REAL NOT NULL,
            estado_limpieza TEXT DEFAULT 'Limpia',
            estado TEXT DEFAULT 'disponible',   -- 'disponible', 'ocupada', 'mantenimiento'
            activa INTEGER DEFAULT 1
        )
    ''')

    # Tabla tareas_limpieza (sin cambios)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tareas_limpieza (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            habitacion_id INTEGER NOT NULL,
            fecha TEXT NOT NULL,
            estado TEXT DEFAULT 'Pendiente',
            asignado_a TEXT,
            notas TEXT,
            FOREIGN KEY (habitacion_id) REFERENCES habitaciones(id) ON DELETE CASCADE
        )
    ''')

    # Tabla huespedes (sin cambios)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS huespedes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            email TEXT,
            telefono TEXT,
            documento TEXT,
            direccion TEXT
        )
    ''')

    # Tabla reservas (sin cambios)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS reservas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            huesped_id INTEGER NOT NULL,
            habitacion_id INTEGER NOT NULL,
            fecha_entrada TEXT NOT NULL,
            fecha_salida TEXT NOT NULL,
            estado TEXT DEFAULT 'Confirmada',
            total REAL,
            notas TEXT,
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (huesped_id) REFERENCES huespedes(id),
            FOREIGN KEY (habitacion_id) REFERENCES habitaciones(id)
        )
    ''')

    # NUEVA: Tabla estancias (check-in activo)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS estancias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reserva_id INTEGER NOT NULL,
            huesped_id INTEGER NOT NULL,
            habitacion_id INTEGER NOT NULL,
            fecha_checkin TEXT NOT NULL,
            fecha_checkout_esperado TEXT NOT NULL,
            fecha_checkout_real TEXT,
            estado TEXT DEFAULT 'activa',   -- 'activa', 'finalizada'
            FOREIGN KEY (reserva_id) REFERENCES reservas(id),
            FOREIGN KEY (huesped_id) REFERENCES huespedes(id),
            FOREIGN KEY (habitacion_id) REFERENCES habitaciones(id)
        )
    ''')

    # NUEVA: Tabla facturas
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS facturas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            estancia_id INTEGER NOT NULL,
            huesped_id INTEGER NOT NULL,
            fecha_emision TEXT NOT NULL,
            subtotal REAL NOT NULL,
            impuestos REAL DEFAULT 0,
            total REAL NOT NULL,
            estado TEXT DEFAULT 'pendiente',   -- 'pendiente', 'pagada'
            pdf_generado INTEGER DEFAULT 0,
            FOREIGN KEY (estancia_id) REFERENCES estancias(id),
            FOREIGN KEY (huesped_id) REFERENCES huespedes(id)
        )
    ''')

    # NUEVA: Tabla pagos
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pagos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            factura_id INTEGER NOT NULL,
            monto REAL NOT NULL,
            metodo TEXT NOT NULL,   -- 'efectivo', 'tarjeta', 'transferencia'
            fecha TEXT NOT NULL,
            referencia TEXT,
            FOREIGN KEY (factura_id) REFERENCES facturas(id)
        )
    ''')

    # Insertar datos de ejemplo si las tablas están vacías
    cursor.execute("SELECT COUNT(*) FROM habitaciones")
    if cursor.fetchone()[0] == 0:
        habitaciones_ejemplo = [
            ("101", "Individual", 45.0, "Limpia", "disponible"),
            ("102", "Doble", 65.0, "Limpia", "disponible"),
            ("103", "Suite", 95.0, "Sucia", "disponible"),
            ("104", "Doble", 65.0, "Limpia", "disponible"),
            ("105", "Individual", 45.0, "Revisión", "disponible"),
        ]
        cursor.executemany('''
            INSERT INTO habitaciones (numero, tipo, precio_base, estado_limpieza, estado)
            VALUES (?, ?, ?, ?, ?)
        ''', habitaciones_ejemplo)

    cursor.execute("SELECT COUNT(*) FROM huespedes")
    if cursor.fetchone()[0] == 0:
        huespedes_ejemplo = [
            ("Juan Pérez", "juan@mail.com", "555-1234", "12345678A", "Calle Falsa 123"),
            ("María López", "maria@mail.com", "555-5678", "87654321B", "Avenida Siempreviva 456"),
        ]
        cursor.executemany('''
            INSERT INTO huespedes (nombre, email, telefono, documento, direccion)
            VALUES (?, ?, ?, ?, ?)
        ''', huespedes_ejemplo)

    cursor.execute("SELECT COUNT(*) FROM reservas")
    if cursor.fetchone()[0] == 0:
        reservas_ejemplo = [
            (1, 1, "2025-06-01", "2025-06-05", "Confirmada", 180.0, "Reserva de prueba"),
            (2, 2, "2025-06-10", "2025-06-12", "Confirmada", 130.0, "Reserva para María"),
        ]
        cursor.executemany('''
            INSERT INTO reservas (huesped_id, habitacion_id, fecha_entrada, fecha_salida, estado, total, notas)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', reservas_ejemplo)

    conn.commit()
    conn.close()

if __name__ != "__main__":
    crear_tablas()