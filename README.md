# Vantry — PMS para hospedajes

**Vantry** es un SaaS PMS (Property Management System) para hospedajes pequeños del Perú:
motor de reservas directas **sin comisión** (link público), calendario, recepción
(check-in/out, caja), huéspedes, tarifas, inventario, comprobantes (SUNAT en camino),
reportes y pagos online. **Multi-tenant** (cada hospedaje = un tenant).

> 📌 El nombre "Vantry" es el elegido pero no 100% cerrado (alternativas: Kelira, Zarvo).

## 🚀 Empieza por aquí
👉 **[`ESTADO_Y_ROADMAP.md`](ESTADO_Y_ROADMAP.md)** — el "léeme primero": estado actual, cómo correr
en local, roadmap/pendientes, gotchas y decisiones de producto. Ideal para retomar (dev o IA).

## Estructura
```
pms_hospedaje/    Backend — API FastAPI (Python) + app de escritorio Tkinter original (intacta).
pms-frontend/     Frontend — React + Vite.
(pms-backend/)    Ignorar: no es el backend en uso.
```

## Stack y despliegue
| Capa | Tecnología | Dónde |
|---|---|---|
| Frontend | React + Vite | Vercel — https://vantry-pms.vercel.app |
| Backend | FastAPI | Render — https://pms-hospedaje-api.onrender.com |
| BD (prod) | PostgreSQL | **Supabase** (pooler 6543, São Paulo) |
| BD (local) | SQLite | `pms_hospedaje/pms_prueba.db` |

Deploy = `git push origin main` → Vercel y Render redespliegan solos. Detalle en
[`pms_hospedaje/DEPLOY.md`](pms_hospedaje/DEPLOY.md).

## Desarrollo local
```bash
# Backend (SQLite; sin DATABASE_URL usa la base local)
cd pms_hospedaje
pip install -r requirements.txt
python -m uvicorn api:app --host 127.0.0.1 --port 8000

# Frontend (usa VITE_API_URL || http://localhost:8000)
cd pms-frontend
npm install
npm run dev -- --host --port 5174 --strictPort
```
Login local: **admin / admin123**. Superadmin (dueño del SaaS): se crea con
`python crear_superadmin.py <usuario> <nombre> <password>`.

---

## 📚 Índice de documentación

**Estado y arquitectura**
| Doc | Cubre |
|---|---|
| [`ESTADO_Y_ROADMAP.md`](ESTADO_Y_ROADMAP.md) | **Léeme primero:** estado, cómo correr, roadmap, gotchas |
| [`AUDITORIA_FINAL.md`](AUDITORIA_FINAL.md) | Auditoría integral (seguridad, multi-tenant, infra, producción) |
| [`DOCUMENTACION.md`](DOCUMENTACION.md) | Arquitectura general, tablas y endpoints (base) |

**Análisis y decisiones de diseño** (`pms-frontend/`)
| Doc | Cubre |
|---|---|
| `ANALISIS_PASARELAS.md` | Pagos online / pasarela (propuesta + Fase 1 sandbox) |
| `ANALISIS_RESERVAS_USD.md`, `ANALISIS_MULTIMONEDA.md` | Multi-moneda y reservas en USD |
| `ANALISIS_ESCALABILIDAD.md` | Escalabilidad (100/500/1k/5k hospedajes) |
| `FLUJO_CONTRATACION.md` | Registro/onboarding + correo (Brevo/Render) |
| `MEJORAS_PMS.md`, `AUDITORIA*.md`, `REDISENO_*.md` | Brief de mejoras y auditorías/rediseños históricos |

**Backend / operaciones** (`pms_hospedaje/`)
| Doc | Cubre |
|---|---|
| `DEPLOY.md` | Despliegue (Render/Vercel/Postgres) + variables de entorno |
| `SECURITY_CHANGES.md` | Endurecimiento de seguridad + variables obligatorias |
| `SUNAT_PRODUCCION.md` | Ruta a facturación electrónica en producción (OSE/PSE) |
| `GUION_VENTA.md` | Pitch y guion de venta |

## Pendientes de config (ver ESTADO_Y_ROADMAP §6)
- Estrategia de **backups** de la BD · **Render de pago** (quitar spin-down) · **dominio propio**
  para el correo (salir de spam). Bloqueado por DNI: **pagos reales (Mercado Pago)** y **SUNAT producción**.
