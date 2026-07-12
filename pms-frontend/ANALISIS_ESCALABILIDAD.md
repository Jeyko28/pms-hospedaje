# Escalabilidad de Vantry — Auditoría (#10)

> Auditoría de qué aguanta hoy la arquitectura y qué se rompe primero al crecer a
> **100 / 500 / 1 000 / 5 000 hospedajes**. Aterrizada en el código real. No cambia nada:
> es diagnóstico + plan priorizado. Fecha: 2026-07-09.

## Contexto (stack)
Frontend React/Vite en **Vercel** (escala solo, CDN, sin problema). Backend **FastAPI** en
**Render (free)**, un worker. BD **PostgreSQL en Neon (free)**. El cuello de botella al crecer
está en el **backend + BD**, no en el frontend.

---

## Hallazgos priorizados

### 🔴 P0 — Se rompe primero (atacar antes de ~200-500 hospedajes activos)

1. **Sin pooling de conexiones a Postgres.** `dbengine.conectar` hace
   `psycopg2.connect(DATABASE_URL)` **en cada request** (dbengine.py:160) y varios endpoints
   abren más de una conexión. Abrir/cerrar una conexión por request es caro y **Neon limita las
   conexiones** (el plan free se agota rápido con concurrencia). → **Con decenas de hospedajes
   usando el PMS a la vez, aparecerán errores "too many connections" / lentitud.**
   **Fix (fácil, alto impacto):** usar la **cadena de conexión "pooled" de Neon (PgBouncer)** en
   `DATABASE_URL` (host `...-pooler...`) — es un **cambio de config en Render, sin código**. Como
   evolución: un pool en el proceso (psycopg2 `ThreadedConnectionPool`) o `get_connection` con pool.

2. **Render free hace spin-down.** El servicio "duerme" con inactividad → **primer request ~50 s**
   (frío) y un solo worker (poca concurrencia). Molesto ya con 1 cliente real.
   **Fix:** Render **plan de pago** (~US$7/mes) = always-on + más workers. Es el primer gasto de
   infraestructura obligatorio para vender en serio.

### 🟠 P1 — Duele a ~500-1 000 hospedajes

3. **Imágenes en base64 dentro de Postgres** (feature de fotos). Neon free = **0.5 GB**. Cada foto
   (~0.2-0.7 MB) vive en la BD → **infla la base, los backups y cada respuesta**. Además,
   `disponibilidad_publica` hace **N+1**: 2 queries extra por habitación para traer la foto
   principal, y devuelve el base64 inline (payload pesado del motor de reservas).
   **Fix:** mover a **object storage** (Cloudinary/Vercel Blob, free tier + CDN) y guardar solo la
   URL; generar **miniatura** para la tarjeta y foto completa para la galería. (Ya previsto como
   Fase 2 en `ANALISIS_PASARELAS`/fotos.)

4. **Sin rate-limiting en endpoints públicos.** `POST /api/publico/pagos/checkout`,
   `POST /api/pagos/webhook/{proveedor}`, `/api/publico/disponibilidad`, `/api/publico/habitacion/
   {id}/fotos` y `hospedaje_publico` no tienen `slowapi` (sí lo tienen login/registro). → riesgo de
   abuso/DoS y de inflar `pagos_online`/`visitas`.
   **Fix (código pequeño):** `@limiter.limit(...)` en esos endpoints (el `Limiter` ya existe).

5. **Migraciones en cada arranque.** `migrar()` corre todos los pasos (idempotentes) en cada cold
   start. Barato hoy, pero con muchos reinicios conviene un guard de versión de esquema.

### 🟡 P2 — A 1 000-5 000: rediseño de capacidad

6. **Consultas de disponibilidad** (`NOT IN (subquery)` sobre reservas/estancias por fechas): con
   cientos de miles de reservas conviene **índices compuestos** en `reservas(hospedaje_id,
   fecha_entrada, fecha_salida)` y `estancias(...)`, y/o reescribir con `NOT EXISTS`. Hoy hay
   índices por FK (bien), falta el compuesto por rango de fechas.
   Menor: **`hospedajes.slug`** (lookup público) no está indexado — barato de añadir.

7. **Sin caché.** `hospedaje_publico` y `disponibilidad` se recalculan en cada visita (y registran
   una fila en `visitas` por visita). A miles de hospedajes con tráfico, meter **caché** (Redis /
   Vercel edge / cache-control) para las páginas públicas y **agregación asíncrona** de visitas.

8. **Escalado horizontal.** A 5 000 hospedajes: múltiples workers/instancias del backend (stateless,
   ya lo es), Neon con más cómputo o **read replicas**, colas para trabajos pesados (correo, PDFs,
   emisión SUNAT), y separar el **motor de reservas público** (alto tráfico anónimo) del PMS
   interno para escalarlos por separado.

---

## Qué se rompe primero, por umbral

| Escala | Estado | Acción necesaria |
|---|---|---|
| **100** hospedajes | ✅ Aguanta | Render **de pago** (quitar spin-down). Neon pooled. |
| **500** | ⚠️ | **Pooling obligatorio**; rate-limits; empezar a mover imágenes a object storage; vigilar tamaño de Neon. |
| **1 000** | 🔧 | Object storage + miniaturas **obligatorio**; caché de páginas públicas; índices de fechas; varios workers; Neon con más cómputo. |
| **5 000** | 🏗️ | Read replicas/caché (Redis); colas para correo/PDF/SUNAT; separar motor público del PMS; CDN para imágenes. |

---

## Quick-wins (orden recomendado, bajo riesgo)
1. **Neon pooled connection string** en `DATABASE_URL` (Render env) — sin código, mayor impacto.
2. **Render de pago** — quita el cold start de 50 s.
3. **Rate-limits** con `slowapi` en los endpoints públicos (código pequeño).
4. Índice en `hospedajes.slug` (+ compuestos de fechas cuando crezcan las reservas).
5. Planear **object storage** para las fotos (Cloudinary free) antes de que muchos hospedajes suban fotos.

## Lo que YA está bien (no tocar)
- Multi-tenant con `hospedaje_id` + **21+ índices** por tenant/FK (migración `_INDICES`).
- Backend **stateless** (escala horizontal fácil).
- Frontend con **code-splitting** por ruta (el huésped del link no descarga el PMS).
- El patrón adaptador (sunat/pasarela/correo/tipo_cambio) permite cambiar proveedores sin refactor.
- `tasa()` y `correo.enviar()` a prueba de fallos (no tumban el request).

## Nota
Nada de esto es urgente para el **piloto** (1-10 hospedajes): el bar es "always-on + pooling". El
resto se ataca por umbral, con datos reales de uso, sin sobre-ingeniería anticipada.
