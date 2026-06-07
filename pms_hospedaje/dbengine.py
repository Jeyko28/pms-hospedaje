"""
dbengine.py
Motor de base de datos DUAL: SQLite (desarrollo local) o PostgreSQL (nube).

Por que existe:
  La app de escritorio (Tkinter) y la web comparten modelos.py / database.py,
  escritos para sqlite3 (placeholders '?', cursor.lastrowid, sqlite3.Row).
  PostgreSQL usa otra sintaxis ('%s', no hay lastrowid, etc.).

  En vez de reescribir TODO el codigo (y arriesgar la app de escritorio que ya
  funciona), este modulo envuelve psycopg2 para que se comporte IGUAL que
  sqlite3. Asi modelos.py no cambia ni una linea.

Como se elige el motor:
  - Si existe la variable de entorno DATABASE_URL (la que da Neon/Render) ->
    PostgreSQL.
  - Si no -> SQLite local (como hasta ahora).

Diferencias que traduce automaticamente para Postgres:
  - Placeholders de parametros:   ?   ->   %s
  - INSERT ... (sin RETURNING)  ->  se le anade  RETURNING id  y el id queda
    disponible como cursor.lastrowid (igual que en SQLite).
  - DDL:  INTEGER PRIMARY KEY AUTOINCREMENT  ->  SERIAL PRIMARY KEY
  - Acceso a filas por nombre (row["col"]) Y por indice (row[0]) gracias a
    psycopg2.extras.DictCursor.
"""

import os
import re

DATABASE_URL = os.environ.get("DATABASE_URL")
USA_POSTGRES = bool(DATABASE_URL)


# --------------------------------------------------------------------------- #
#  Traducciones de SQL SQLite -> PostgreSQL
# --------------------------------------------------------------------------- #
def _adaptar_sql(sql: str) -> str:
    s = sql

    # DDL: clave primaria autoincremental.
    s = re.sub(
        r"INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT",
        "SERIAL PRIMARY KEY",
        s,
        flags=re.IGNORECASE,
    )

    # Placeholders de parametros: ?  ->  %s  (cuidando de no tocar '?' dentro
    # de literales de texto; en este proyecto no hay '?' literales en SQL).
    s = s.replace("?", "%s")

    return s


def _necesita_returning(sql: str) -> bool:
    t = sql.lstrip().upper()
    return t.startswith("INSERT") and "RETURNING" not in t


def _adaptar_params(params):
    """SQLite acepta True/False como 1/0 en columnas INTEGER; PostgreSQL es
    estricto y los rechaza. Convertimos bool -> int para que el codigo que
    pasa booleanos (ej. modelos.py con 'activa') funcione en ambos motores."""
    if params is None:
        return params
    if isinstance(params, (list, tuple)):
        return type(params)(
            int(p) if isinstance(p, bool) else p for p in params
        )
    return params


# --------------------------------------------------------------------------- #
#  Wrappers que imitan la interfaz de sqlite3 sobre psycopg2
# --------------------------------------------------------------------------- #
class _PgCursor:
    """Cursor que traduce el SQL y emula cursor.lastrowid."""

    def __init__(self, real_cursor):
        self._cur = real_cursor
        self.lastrowid = None

    def execute(self, sql, params=()):
        adaptado = _adaptar_sql(sql)
        params = _adaptar_params(params)
        if _necesita_returning(sql):
            adaptado = adaptado.rstrip().rstrip(";") + " RETURNING id"
            self._cur.execute(adaptado, params)
            fila = self._cur.fetchone()
            self.lastrowid = fila[0] if fila else None
            return self
        self._cur.execute(adaptado, params)
        return self

    def executemany(self, sql, seq):
        seq = [_adaptar_params(p) for p in seq]
        self._cur.executemany(_adaptar_sql(sql), seq)
        return self

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    def __iter__(self):
        return iter(self._cur)

    def __getattr__(self, name):
        # Cualquier otra cosa (rowcount, description, etc.) la delega al real.
        return getattr(self._cur, name)


class _PgConnection:
    """Conexion que devuelve _PgCursor y soporta el resto de la API sqlite3."""

    def __init__(self, real_conn):
        self._conn = real_conn

    def cursor(self):
        import psycopg2.extras

        return _PgCursor(self._conn.cursor(cursor_factory=psycopg2.extras.DictCursor))

    def execute(self, sql, params=()):
        # sqlite3.Connection.execute existe; algunos sitios lo usan.
        cur = self.cursor()
        cur.execute(sql, params)
        return cur

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def __getattr__(self, name):
        return getattr(self._conn, name)


# --------------------------------------------------------------------------- #
#  Punto de entrada: devuelve una conexion del motor adecuado
# --------------------------------------------------------------------------- #
def conectar(sqlite_path: str):
    """Devuelve una conexion lista para usar.
    - Con DATABASE_URL definido: PostgreSQL (envuelto para imitar sqlite3).
    - Sin ella: SQLite normal (con row_factory para acceso por nombre)."""
    if USA_POSTGRES:
        import psycopg2

        real = psycopg2.connect(DATABASE_URL)
        return _PgConnection(real)

    import sqlite3

    conn = sqlite3.connect(sqlite_path)
    conn.row_factory = sqlite3.Row
    return conn
