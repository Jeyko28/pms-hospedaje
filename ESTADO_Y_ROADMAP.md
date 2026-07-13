# Vantry PMS — Estado actual y Roadmap (handoff)

> **Para quien retome el proyecto (dev o IA).** Este documento resume qué es Vantry, cómo
> correrlo, qué se hizo, qué está pendiente y las decisiones/lecciones clave. Última
> actualización: **2026-07-09**.

---

## 1. Qué es
**Vantry** (antes "Stanza") es un **SaaS PMS para hospedajes pequeños del Perú** (hostales,
hoteles boutique, 5–80 habitaciones): reservas directas sin comisión (link público), calendario,
recepción (check-in/out, caja), huéspedes, tarifas, inventario, comprobantes (SUNAT en camino),
reportes. Multi-tenant (cada hospedaje = un "tenant"). Modelo: suscripción mensual por rango de
habitaciones (Inicia/Crece/Pro), trial 14 días, **0% comisión por reserva**.

> ⚠️ El nombre "Vantry" es el elegido pero **no 100% cerrado** (alternativas evaluadas: Kelira,
> Zarvo). Si cambia, es un find-replace global + deploy.

## 2. Stack y despliegue
| Capa | Tecnología | Dónde | URL |
|---|---|---|---|
| Frontend | React + Vite | Vercel | https://vantry-pms.vercel.app |
| Backend | FastAPI (Python) | Render (free) | https://pms-hospedaje-api.onrender.com |
| BD (prod) | PostgreSQL | Neon | — |
| BD (local) | SQLite | `pms_hospedaje/pms_prueba.db` | — |

- **Repo:** monorepo en `Proyectos/`, GitHub `github.com/Jeyko28/pms-hospedaje`, rama `main`.
  - `pms_hospedaje/` = backend FastAPI (+ la app de escritorio Tkinter original, intacta).
  - `pms-frontend/` = frontend React.
  - *(Ignora `pms-backend/` si aparece: no es el backend en uso.)*
- **Deploy = `git push origin main`** → Vercel y Render redespliegan solos.
- **El backend en Render solo redepliega cuando cambian archivos de `pms_hospedaje/`.**

## 3. Correr en local
```bash
# Backend (SQLite local; sin PMS_ENV=production no exige secretos)
cd pms_hospedaje
python -m uvicorn api:app --host 127.0.0.1 --port 8000

# Frontend (usa VITE_API_URL || http://localhost:8000)
cd pms-frontend
npm run dev -- --host --port 5174 --strictPort
```
- **Login local:** admin / admin123 (admin del hospedaje 1). Superadmin: jeyko / jeyko123.
- **Prod:** superadmin jeyko / `Hosp3daje$26`.
- ⚠️ En dev, si no defines `PMS_SECRET_KEY`, el secreto JWT se **regenera en cada arranque** →
  los tokens previos dejan de valer (hay que re-loguear tras reiniciar el backend).
- La BD corre migraciones solas al arrancar (`database.py` → `migracion_multitenant.migrar`).

## 4. Estado actual — hecho en la sesión reciente (2026-07-09)
Commits relevantes (de más nuevo a más viejo):
- **Fotos de habitación — vista del huésped** (incr.3): `ReservaPublica.jsx` con tarjetas
  (foto + descripción + capacidad + chips) + galería modal. Verificado en preview.
- `a45cf15` **Fotos de habitación — editor admin** (incr.2): modal "Fotos y detalles" en la
  página Habitaciones (subir fotos comprimidas en el navegador, descripción, capacidad,
  amenidades).
- `95da78f` **Fotos de habitación — backend**: migración 31-32 (`habitaciones.descripcion/
  capacidad/amenidades` + tabla `habitacion_fotos`), endpoints admin + exposición pública.
- `cd72c2b` **Pasarela de pagos Fase 1 (sandbox)**: `pasarela.py` (adaptador), tablas
  `pasarela_config`/`pagos_online`, checkout + webhook + estado. **Inactiva por defecto.**
- `c89a8a7` **Propuesta de pasarelas** (`pms-frontend/ANALISIS_PASARELAS.md`).
- `06dcfe3`, `cceaf54`, `a4101f3`, `f02cd0e` **Serie de fixes de deploy** (ver §7).
- `bfad638`, `8c56357` **Correo Brevo + rebrand Stanza→Vantry**.

**Correo (SMTP):** configurado con **Brevo** (plan Free, sin dominio). Variables en Render:
`SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`,
`SMTP_FROM=en.cuadre1612@gmail.com`, `SMTP_TLS=1`, `APP_URL`, `CORS_ORIGINS`. Remitente
"Vantry PMS". Envía bienvenida + recuperación de contraseña (`correo.py`).

## 5. Documentos de referencia (leer según el tema)
- `DOCUMENTACION.md` (raíz) — arquitectura general, tablas, endpoints (base; puede estar algo atrasado).
- `pms-frontend/ANALISIS_PASARELAS.md` — **pasarela de pagos** (propuesta + Fase 1). §13 = lo implementado.
- `pms-frontend/ANALISIS_RESERVAS_USD.md` + `ANALISIS_MULTIMONEDA.md` — **multi-moneda / USD**.
- `pms-frontend/FLUJO_CONTRATACION.md` — **registro/onboarding + correo (Brevo/Render)**.
- `pms_hospedaje/SUNAT_PRODUCCION.md` + `SECURITY_CHANGES.md` — SUNAT y seguridad.
- `pms_hospedaje/GUION_VENTA.md` — pitch de venta.

## 6. Roadmap / pendientes

### 6.1 Inmediato (sin bloqueos)
- ✅ **Fotos de habitación — incremento 3 (vista del huésped) HECHO:** `ReservaPublica.jsx` ya
  muestra cada habitación como **tarjeta con foto + descripción + capacidad + chips de amenidades**,
  con **galería** (modal) al hacer clic. Verificado en preview.
- ✅ **Pasarela Fase 1 — frontend HECHO:** sección "Pagos online" en Configuración (activar
  sandbox), botón "Pagar adelanto online" en el motor público, y página `#/pago` (checkout
  sandbox que simula aprobado/rechazado). Verificado E2E en preview: pago aprobado →
  `reserva.adelanto_estado='verificado'` automático. **Falta solo la Fase 2 (Mercado Pago real,
  bloqueada por DNI).**

### 6.2 Bloqueado por el DNI del dueño (KYC) — hacer cuando lo actualice
- **Pasarela producción:** implementar `PasarelaMercadoPago` real (SDK + credenciales + firma de
  webhook). Ver `ANALISIS_PASARELAS.md`. Nota: el cobro de **reservas** va a la cuenta de cada
  hospedaje; la **suscripción** va a la cuenta de Vantry (ahí pesa el DNI del dueño).
- **SUNAT producción (#9):** requiere RUC (ya lo tiene) + Clave SOL + certificado digital +
  cuenta OSE/PSE (ej. Nubefact). Implementar `EmisorNubefact` (el adaptador ya existe en `sunat.py`).

### 6.3 Configuración pendiente del usuario (no es código)
- ✅ **Google login HECHO:** se agregó `https://vantry-pms.vercel.app` a los "Authorized JavaScript
  origins" del OAuth Client ID.
- **Backups de la BD:** Supabase Free NO hace backups automáticos. Interino (gratis):
  `pms_hospedaje/backup_bd.py` exporta TODA la base a `backups/*.json` (correr con `DATABASE_URL`
  apuntando a Supabase; sin instalar nada). Real (cuando haya clientes): **Supabase Pro (~US$25/mes)**
  = backups diarios automáticos + PITR.
- **Dominio propio (~US$10/año):** para que los correos no caigan en spam (hoy remitente `@gmail`
  → DKIM/DMARC no alineables). Al comprarlo: autenticarlo en Brevo y cambiar `SMTP_FROM`/`APP_URL`.
- **Render de pago (~US$7/mes):** Settings → Instance Type → Starter (quita el spin-down de 50s).

### 6.4 Brief grande (product team) — restante
- ✅ **#10 Escalabilidad HECHO:** auditoría en `pms-frontend/ANALISIS_ESCALABILIDAD.md`. Hallazgos
  P0: **sin pooling de conexiones** (Neon pooled string) + **Render free spin-down** (pasar a pago).
  P1: imágenes base64 → object storage, rate-limits en endpoints públicos. Quick-wins listados.
- ✅ **#11 Auditoría final integral HECHA:** `AUDITORIA_FINAL.md`. Veredicto: núcleo sólido y
  vendible en piloto; sin defectos críticos. Trabajo real = ops (backups + Render pago) y desbloquear
  DNI. Hallazgo corregido en la sesión: rate-limits que no se aplicaban. Checklist priorizado dentro.
- ✅ **#12 Documentación consolidada HECHA:** `README.md` (raíz) es ahora el front-door con un
  **índice completo** de toda la doc (estado, análisis, backend/ops) + "léeme primero" → este archivo.

### 6.5 Ideas futuras / a definir con el usuario
- **Reservas/pagos en USD:** el usuario tiene una "lista de pendientes" por pasar. Decisión ya
  tomada: cobrar en **PEN + USD referencial** (ya construido); USD real solo vía PayPal (Fase 3).
- **Monitoreo del efectivo USD que entra a caja:** idea futura, fuera de alcance por ahora.
- **Fotos:** upgrade de storage a object storage (Cloudinary/Vercel Blob) cuando crezca el tráfico.

## 7. Gotchas y lecciones clave (¡importante!)
- **Los deploys de Render pueden fallar en silencio:** si la app crashea al arrancar, Render sigue
  sirviendo la instancia vieja → los cambios "no se ven" aunque el push exista. **Siempre verificar
  que el deploy quede "live"** (pestaña Events + un preflight CORS por curl). Casos ya vividos:
  faltaba `slowapi` en `requirements.txt`; un `%` literal en SQL rompía psycopg2 (ver abajo).
- **psycopg2 y `%`:** en Postgres, un `%` literal en el SQL (comentarios, `LIKE '%x%'`) hace que
  psycopg2 intente interpolar y lance `IndexError` **si se pasa una tupla de params vacía**. Fix de
  raíz aplicado en `dbengine._PgCursor.execute` (pasa `None` cuando no hay params). En SQLite no pasa.
- **Modelos y columnas nuevas:** al añadir una columna a una tabla con modelo en `modelos.py`,
  actualizar el `__init__` del modelo (aceptan `**_`) **y** el método que construye desde filas
  (p. ej. `Habitacion.obtener_todas` arma con campos explícitos, no con `**dict(row)`).
- **Migraciones:** todas van en `pms_hospedaje/migracion_multitenant.py` → `migrar(conn)`, con
  pasos numerados, idempotentes (`_tabla_existe`, `_columnas_de`, `CREATE TABLE IF NOT EXISTS`).
- **CORS:** los orígenes de producción deben estar en la lista `_origenes` de `api.py` (o en la env
  `CORS_ORIGINS`). El regex solo cubre localhost. `vantry-pms.vercel.app` ya está en la lista.
- **Patrón adaptador** reutilizado para proveedores externos: `sunat.py` (emisor), `tipo_cambio.py`,
  `correo.py`, `pasarela.py`. Todos: interfaz base + Sandbox/Fake + real, factory `obtener_*`.
- **Storage de imágenes MVP:** base64 en Postgres (sin cuentas externas, sobrevive los redeploys de
  Render que tienen FS efímero), comprimidas en el cliente. Límite 6 fotos/hab, ~1MB.
- **El texto "Mi Pequeño Hospedaje"** del PDF de factura (`utils.py`) NO es la marca; queda.
- **slowapi (rate-limit): el orden de decoradores importa.** Debe ser `@app.<método>` ARRIBA y
  `@limiter.limit(...)` DEBAJO (encima del `def`). Al revés, FastAPI registra la función sin el
  límite y **no se aplica** (bug latente que tenía todo el proyecto, incl. login; corregido y
  verificado con un test de 130 requests → 429 tras el umbral). Los endpoints públicos ya tienen
  límites (reads 120/min, writes 15/min, webhook 60/min) y `hospedajes.slug` está indexado.

## 8. Decisiones de producto ya tomadas (no re-litigar sin motivo)
- **Nunca cobrar comisión** por reserva en el link público (es el posicionamiento de venta).
- **Gating por plan** (límite de habitaciones) = diferido hasta tener 2-3 clientes que lo excedan.
- **Cobrar en soles**, mostrar USD referencial. Nada de FX de tarjeta por el PMS.
- **No forzar verificación de email** aún (para no romper el alta directa).
- Pasarela y SUNAT reales **esperan el DNI actualizado**; mientras, todo se construye en sandbox.
