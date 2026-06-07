# PMS Hospedaje

Sistema de gestión (Property Management System) para pequeños hospedajes.
Aplicación web: gestiona reservas, recepción (check-in/out y pagos),
habitaciones, huéspedes, facturación y reportes de ocupación.

## Estructura

```
pms_hospedaje/    Backend — API REST con FastAPI (Python). Reusa la lógica de
                  negocio de la versión de escritorio. Base de datos SQLite
                  (local) o PostgreSQL (producción) vía motor dual.
pms-frontend/     Frontend — interfaz web con React + Vite.
```

## Características

- 7 secciones: Panel, Reservas, Recepción, Habitaciones, Huéspedes,
  Facturas y Reportes.
- Autenticación con usuarios y roles (administrador / recepción), JWT + bcrypt.
- Modo claro/oscuro, diseño accesible (WCAG AA) y responsive.
- Facturas en PDF.

## Desarrollo local

Backend:
```bash
cd pms_hospedaje
pip install -r requirements.txt
uvicorn api:app --reload --port 8000
```

Frontend:
```bash
cd pms-frontend
npm install
npm run dev
```

Acceso inicial: usuario `admin`, contraseña `admin123` (cámbiala en Usuarios).

## Despliegue

Ver [`pms_hospedaje/DEPLOY.md`](pms_hospedaje/DEPLOY.md): backend en Render,
frontend en Vercel, base de datos en Neon (PostgreSQL).
