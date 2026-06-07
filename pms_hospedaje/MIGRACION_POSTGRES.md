# Migración a PostgreSQL (Neon) — guía

La capa de datos ya es **dual**: usa SQLite en local y PostgreSQL si existe la
variable de entorno `DATABASE_URL`. No hay que cambiar código para alternar.

## Cómo activar Postgres

### 1. Crear la base de datos en Neon (gratis)
1. Entra a https://neon.tech y crea una cuenta.
2. Crea un proyecto → te da una **connection string** así:
   `postgresql://usuario:password@ep-xxxx.region.aws.neon.tech/dbname?sslmode=require`

### 2. Probar en local contra Neon (opcional, recomendado)
En PowerShell, define la variable y arranca la API:

```powershell
$env:DATABASE_URL = "postgresql://...tu-cadena-de-neon..."
cd C:\Users\jeyko\OneDrive\Documentos\Proyectos\pms_hospedaje
python -m uvicorn api:app --reload --port 8000
```

Al arrancar, `database.crear_tablas()` y `auth.crear_tabla_usuarios()` crean
todas las tablas en Postgres automáticamente (incluido el admin por defecto).

> Para volver a SQLite, cierra esa terminal o ejecuta `Remove-Item Env:DATABASE_URL`.

### 3. Migrar los datos existentes (si quieres conservar los actuales)
Los datos de prueba viven en `pms_prueba.db` (SQLite). Para llevarlos a Postgres
hay dos caminos:
- **Empezar limpio** (lo normal en un PMS nuevo): no migrar; Postgres arranca con
  el seed de ejemplo + admin. Recomendado.
- **Copiar datos**: exportar de SQLite e importar a Postgres con una herramienta
  como `pgloader`, o un script puntual. Pídelo si lo necesitas.

## Qué traduce el motor (dbengine.py) por debajo
- Placeholders `?` → `%s`
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
- `cursor.lastrowid` se emula con `RETURNING id`
- Acceso a filas por nombre y por índice (DictCursor)

## Pendiente de seguridad antes de producción
- Definir `PMS_SECRET_KEY` como variable de entorno (clave del JWT).
- Cambiar la contraseña del usuario `admin` (por defecto `admin123`).
