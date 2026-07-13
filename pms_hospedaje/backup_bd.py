"""
backup_bd.py — respaldo simple de TODA la base a un archivo JSON.

No necesita instalar nada (usa psycopg2/sqlite que ya vienen con el proyecto) ni
expone credenciales: toma la conexión de la variable de entorno DATABASE_URL
(o la base SQLite local si no está definida).

Uso:
    # Respaldar la base de PRODUCCIÓN (Supabase):
    cd C:\\Users\\jeyko\\OneDrive\\Documentos\\Proyectos\\pms_hospedaje
    $env:DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-1-sa-east-1.pooler.supabase.com:6543/postgres"
    python backup_bd.py

    # Respaldar la base LOCAL (SQLite): simplemente
    python backup_bd.py

Genera:  backups/vantry-backup-YYYYMMDD-HHMMSS.json  (todas las tablas, sus filas).
Guárdalo en un lugar seguro (tu gestor, Drive, etc.). Para restaurar avísame y te
armo el import; el archivo tiene TODOS los datos.
"""
import json
import os
import shutil
from datetime import datetime, date

import dbengine
import database


def _tablas(cursor):
    """Nombres de las tablas de datos, según el motor."""
    if dbengine.USA_POSTGRES:
        cursor.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
        )
    else:
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    return [row[0] for row in cursor.fetchall()]


def _serial(v):
    """Convierte valores no serializables (fechas) a texto."""
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    try:
        json.dumps(v)
        return v
    except (TypeError, ValueError):
        return str(v)


def main():
    conn = database.get_connection()
    try:
        cursor = conn.cursor()
        tablas = _tablas(cursor)
        data = {
            "generado_en": datetime.now().isoformat(timespec="seconds"),
            "motor": "postgres" if dbengine.USA_POSTGRES else "sqlite",
            "tablas": {},
        }
        total = 0
        print(f"Respaldando {len(tablas)} tablas ({data['motor']})...")
        for t in tablas:
            cursor.execute(f'SELECT * FROM "{t}"')
            filas = [
                {k: _serial(v) for k, v in dict(row).items()}
                for row in cursor.fetchall()
            ]
            data["tablas"][t] = filas
            total += len(filas)
            print(f"  {t}: {len(filas)} filas")
    finally:
        conn.close()

    carpeta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backups")
    os.makedirs(carpeta, exist_ok=True)
    nombre = f"vantry-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    ruta = os.path.join(carpeta, nombre)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    # Retención: conservar solo los últimos N respaldos (evita acumular sin fin).
    _MAX = 30
    existentes = sorted(
        f for f in os.listdir(carpeta)
        if f.startswith("vantry-backup-") and f.endswith(".json")
    )
    for viejo in existentes[:-_MAX]:
        try:
            os.remove(os.path.join(carpeta, viejo))
        except OSError:
            pass

    mb = os.path.getsize(ruta) / (1024 * 1024)
    print(f"\nOK -> {ruta}")
    print(f"{len(tablas)} tablas, {total} filas, {mb:.2f} MB")

    # Copia adicional a un disco externo / otra carpeta, si BACKUP_DIR está definido.
    destino = os.environ.get("BACKUP_DIR", "").strip()
    if destino:
        try:
            os.makedirs(destino, exist_ok=True)
            shutil.copy2(ruta, os.path.join(destino, nombre))
            print(f"Copia adicional -> {os.path.join(destino, nombre)}")
        except OSError as e:
            print(f"\n[AVISO] No se pudo copiar a BACKUP_DIR ({destino}).")
            print(f"        ¿El disco externo está conectado? Detalle: {e}")
            print("        El respaldo local SÍ se guardó; conecta el disco y vuelve a correr.")


if __name__ == "__main__":
    main()
