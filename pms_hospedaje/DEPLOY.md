# Guía de despliegue — PMS Hospedaje

La app tiene 3 piezas: **Base de datos** (Neon, ya lista), **Backend** (FastAPI →
Render) y **Frontend** (React → Vercel).

El código ya está preparado: lee toda la configuración sensible de variables de
entorno. No hay secretos en el código.

---

## 0. Requisito: subir el código a GitHub
Render y Vercel despliegan desde un repositorio Git.
- `pms_hospedaje/` (backend) y `pms-frontend/` (frontend) pueden ir en un mismo
  repo (monorepo) o en dos. Los `.gitignore` ya evitan subir secretos, la BD
  local y node_modules.

---

## 1. Base de datos — Neon (ya hecha)
Connection string lista (la del proyecto `pms-hospedaje` en Neon).
La pegarás como variable `DATABASE_URL` en Render.

---

## 2. Backend — Render (https://render.com)
1. New + → **Web Service** → conecta tu repo.
2. Si el backend está en subcarpeta: **Root Directory** = `pms_hospedaje`
   (o usa el `render.yaml` incluido y Render lo configura solo).
3. Build command:  `pip install -r requirements.txt`
   Start command:  `uvicorn api:app --host 0.0.0.0 --port $PORT`
4. **Variables de entorno** (Environment):
   - `PMS_ENV` = `production`
   - `PMS_SECRET_KEY` = (una clave larga aleatoria; o deja que Render la genere)
   - `DATABASE_URL` = (la cadena de Neon, con `?sslmode=require`)
   - `CORS_ORIGINS` = (la URL de tu frontend en Vercel, p.ej. `https://pms-hospedaje.vercel.app`)
   - `PMS_ADMIN_PASSWORD` = (contraseña inicial del admin; si la omites será `admin123`)
5. Deploy. Cuando termine, copia la URL pública (p.ej. `https://pms-hospedaje-api.onrender.com`).

> Nota: el plan free de Render "duerme" el servicio tras inactividad; la primera
> petición tras un rato puede tardar ~30s en despertar. Normal.

---

## 3. Frontend — Vercel (https://vercel.com)
1. New Project → importa el repo.
2. **Root Directory** = `pms-frontend`  (Framework: Vite, lo detecta solo).
3. **Variable de entorno**:
   - `VITE_API_URL` = la URL del backend en Render (paso 2.5).
4. Deploy. Vercel te da la URL pública del frontend.

---

## 4. Cerrar el círculo (CORS)
Cuando tengas la URL de Vercel, ponla en `CORS_ORIGINS` del backend (Render) y
vuelve a desplegar el backend. Así el navegador permite que el frontend hable
con la API.

---

## 5. Primer acceso
- Entra a la URL de Vercel.
- Usuario `admin`, contraseña = la que pusiste en `PMS_ADMIN_PASSWORD`
  (o `admin123` si no la definiste). **Cámbiala desde la sección Usuarios.**

---

## Checklist de variables
| Variable | Dónde | Para qué |
|---|---|---|
| `DATABASE_URL` | Render | Conexión a Neon |
| `PMS_SECRET_KEY` | Render | Firma de los JWT |
| `PMS_ENV=production` | Render | Activa validación de clave |
| `CORS_ORIGINS` | Render | Permitir el dominio del frontend |
| `PMS_ADMIN_PASSWORD` | Render | Clave inicial admin (opcional) |
| `VITE_API_URL` | Vercel | URL del backend |
