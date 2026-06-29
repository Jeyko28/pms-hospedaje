# PMS Hospedaje — Documentación del proyecto

> **Property Management System (PMS) multi-tenant para hospedajes pequeños/medianos en Perú.**
> SaaS web que reemplaza el "cuaderno + Excel + WhatsApp" de hostales, hoteles boutique y
> casas de hospedaje (5–80 habitaciones). Compite con HQBeds/Cloudbeds con un enfoque simple,
> accesible y en español.

**Versión backend:** 0.5.0 · **Última actualización de este doc:** 2026-06-28

---

## 1. Visión general

El producto cubre el ciclo completo de operación de un hospedaje:

- **Motor de reservas** (manual y por link público), con calendario tipo timeline y anti-overbooking.
- **Recepción**: check-in / check-out por noches reales, cobros (efectivo/Yape/Plin/tarjeta/transferencia), arqueo de caja y cierre de turno.
- **Facturación interna** (PDF) + **facturación electrónica SUNAT** (hoy en modo demo/sandbox).
- **Housekeeping** (estado de limpieza + asignación de tareas).
- **Consumos y catálogo de servicios** (minibar, lavandería, etc. cargados a la reserva).
- **Dashboard y reportes** (ocupación, ingresos, origen de reservas).
- **Multi-tenant + roles** (superadmin del SaaS, admin del hospedaje, recepción).
- **Onboarding self-service** con prueba gratis de 14 días y página de precios pública.

---

## 2. Arquitectura y stack

```
┌─────────────────────────┐        HTTPS/JSON        ┌──────────────────────────┐
│  Frontend (pms-frontend) │  ───────────────────►   │   Backend (pms_hospedaje) │
│  React 18 + Vite (JSX)   │   Authorization: Bearer  │   FastAPI (Python)        │
│  Hash router propio      │   ◄───────────────────   │   JWT + bcrypt            │
│  Deploy: Vercel          │                          │   Deploy: Render          │
└─────────────────────────┘                          └────────────┬─────────────┘
                                                                    │
                                                       ┌────────────┴─────────────┐
                                                       │  PostgreSQL (Neon) prod   │
                                                       │  SQLite (local/escritorio)│
                                                       └───────────────────────────┘
```

- **Monorepo**: `C:\Users\jeyko\OneDrive\Documentos\Proyectos\`
  - `pms_hospedaje/` → backend FastAPI **+ app de escritorio Tkinter original** (legacy, intacta).
  - `pms-frontend/` → frontend web React/Vite.
- **Repo Git**: rama `main`, GitHub `Jeyko28/pms-hospedaje`. Push a `main` despliega Render (backend) y Vercel (frontend).
- **Doble motor de BD** (`dbengine.py`): SQLite en local, PostgreSQL en la nube. El mismo código funciona en ambos.
- **Capa de negocio reutilizable** (`modelos.py`): clases OOP independientes de la UI, compartidas por la API web y la app de escritorio.

### Estructura de carpetas (resumen)

```
pms_hospedaje/
  api.py                 # FastAPI: ~75 endpoints REST
  modelos.py             # Habitacion, Huesped, Reserva, Estancia, Factura, Pago,
                         #   TareaLimpieza, Consumo, ServicioHabitacion
  auth.py                # JWT, bcrypt, roles, secret key, rate-limit helpers
  database.py            # Esquema base + seed (SQLite/PG)
  dbengine.py            # Selección de motor (SQLite vs PostgreSQL)
  migracion_multitenant.py  # Migración idempotente: hospedaje_id, columnas e índices
  sunat.py               # Facturación electrónica (emisor modular, hoy sandbox)
  utils.py               # PDF de factura (reportlab), helpers
  tarifas.py             # (EN PROGRESO/huérfano) motor de precios por fecha — ver §9
  views/                 # App de escritorio Tkinter (legacy)
  SECURITY_CHANGES.md    # Bitácora del endurecimiento de seguridad v0.5.0
  SUNAT_PRODUCCION.md    # Guía para pasar SUNAT a producción

pms-frontend/src/
  main.jsx               # Punto de entrada; enruta páginas públicas vs app (code-split)
  App.jsx                # Router por hash + Suspense/lazy de las páginas
  api/client.js          # Cliente HTTP (token, GET/POST/PUT/PATCH/DELETE, blobs)
  auth/                  # AuthContext, Login, Registro
  components/            # AppShell, Card, Button, Badge, Field, Modal, Toast, etc.
  pages/                 # Una carpeta por sección (ver §6)
  publico/               # ReservaPublica, Precios (sin login)
  utils/                 # fechas, whatsapp, exportar, pdf, normalizar
  UI_CHANGES.md          # Bitácora del rework de UI y de Reservas/Consumos
```

---

## 3. Cómo levantar en local

**Backend** (puerto 8000):
```bash
cd pms_hospedaje
python -m pip install -r requirements-api.txt
python -m uvicorn api:app --port 8000 --host 127.0.0.1
```
> La migración se ejecuta sola al arrancar (crea/actualiza tablas e índices, idempotente).
> Si al matar uvicorn queda un worker huérfano reteniendo el 8000, mátalo buscando el
> proceso `python` con `multiprocessing.spawn` (`Get-CimInstance Win32_Process`).

**Frontend** (puerto 5190):
```bash
cd pms-frontend
npm install
npm run dev -- --host --port 5190 --strictPort
```
App en `http://localhost:5190`. Credenciales de desarrollo: **admin / admin123**.

---

## 4. Modelo de datos (17 tablas)

Todas las tablas de datos llevan `hospedaje_id` (aislamiento multi-tenant). La migración lo
añade de forma idempotente y crea índices sobre `hospedaje_id` y las FKs más usadas.

| Tabla | Propósito | Campos clave |
|-------|-----------|--------------|
| `hospedajes` | Tenant (cada cliente del SaaS) | nombre, slug, plan, estado, fecha_expira, **ruc, razon_social, direccion, telefono, email_contacto** |
| `usuarios` | Cuentas de acceso | usuario, password (bcrypt), rol, hospedaje_id |
| `habitaciones` | Inventario de cuartos | numero, tipo, precio_base, estado, estado_limpieza |
| `huespedes` | Directorio de clientes | nombre, email, telefono, documento, **tipo_documento** (DNI/CE/Pasaporte) |
| `reservas` | Reservas | huesped_id, habitacion_id, fechas, estado, total, origen, **grupo_id** |
| `estancias` | Check-in activo / histórico | reserva_id, fechas reales, usuario_checkin_id/checkout_id |
| `facturas` | Cobro de una estancia | subtotal, **descuento, descuento_motivo**, total, estado |
| `pagos` | Pagos de una factura | monto, metodo, fecha, **usuario_id** (auditoría) |
| `tareas_limpieza` | Housekeeping | habitacion_id, estado, asignado_a, notas |
| `bloqueos` | Habitación fuera de servicio | habitacion_id, rango de fechas, motivo |
| `cierres_turno` | Arqueo firmado de caja | total_sistema, efectivo_sistema/contado, diferencia, usuario, por_metodo (json) |
| `tarifas` | Precios por temporada / fin de semana | nombre, rango fechas, dias_semana, habitacion_id (o todas), precio o ajuste_pct |
| `servicios_habitacion` | Catálogo de servicios/productos | nombre, categoria, precio, activo |
| `consumos` | Servicios/pedidos cargados a una reserva | reserva_id, tipo, descripcion, cantidad, precio_unitario, total |
| `visitas` | Analítica del link público | hospedaje_id, creado_en |
| `sunat_config` | Config de facturación electrónica | ruc, razon_social, serie, correlativo, modo, activo |
| `comprobantes` | Boletas/facturas emitidas | serie-correlativo, total, estado, cliente |

**Relaciones núcleo:** `reserva → estancia → factura → pagos`. Una reserva de **grupo**
crea N reservas (una por habitación) que comparten `grupo_id`; cada una conserva su folio.

---

## 5. API REST (resumen, ~78 endpoints)

Base: `/api`. Autenticación por **JWT** (`Authorization: Bearer <token>`), salvo los
endpoints públicos. Roles: `superadmin` (SaaS), `admin` (hospedaje), recepción (resto).

| Grupo | Endpoints |
|-------|-----------|
| **Auth** | `POST /auth/login` · `POST /auth/registro` · `POST /auth/google` · `GET /auth/yo` *(login/registro con rate-limit)* |
| **Mi hospedaje** | `GET/PUT /mi-hospedaje` · `PUT /mi-hospedaje/slug` |
| **Usuarios** (admin) | `GET/POST/PUT/DELETE /usuarios` |
| **Hospedajes** (superadmin) | `GET/POST/PUT /hospedajes` |
| **Público** (sin login) | `GET /config` · `GET /publico/hospedaje/{slug}` · `GET /publico/disponibilidad/{slug}` · `POST /publico/reservar/{slug}` |
| **Habitaciones** | `GET/POST/PUT/DELETE /habitaciones` · `PATCH /habitaciones/{id}/limpieza` |
| **Housekeeping** | `GET/POST /tareas-limpieza` · `POST /tareas-limpieza/{id}/completar` |
| **Huéspedes** | `GET/POST/PUT/DELETE /huespedes` |
| **Reservas** | `GET /reservas` · `GET /reservas/calendario` · `POST /reservas` · `POST /reservas/grupo` · `PUT /reservas/{id}` · `POST /reservas/{id}/{cancelar\|confirmar\|mover}` · `GET /reservas/{id}/detalle` |
| **Bloqueos** | `POST /bloqueos` · `DELETE /bloqueos/{id}` |
| **Recepción** | `GET /recepcion/reservas-pendientes` · `GET /recepcion/estancias-activas` · `POST /recepcion/checkin` · `POST /recepcion/checkout` · `POST /recepcion/recalcular` · `GET /recepcion/caja` · `POST/GET /recepcion/cierres` |
| **Pagos / Facturas** | `POST /pagos` · `GET /facturas` · `GET /facturas/{id}/pagos` · `GET /facturas/{id}/pdf` |
| **SUNAT** | `GET/PUT /sunat/config` · `POST /facturas/{id}/emitir` · `GET /comprobantes` · `GET /comprobantes/{id}/pdf` |
| **Consumos / Servicios** | `GET/POST/DELETE /consumos` · `GET/POST/PUT/DELETE /servicios-habitacion` |
| **Tarifas** (admin) | `GET/POST/DELETE /tarifas` (precios por temporada / fin de semana) |
| **Dashboard / Reportes** | `GET /dashboard/{resumen\|agenda\|overview}` · `GET /reportes/{ocupacion\|financiero}` |
| **Export** | `GET /export/{reservas\|huespedes\|pagos}.csv` |

> Docs interactivas de la API: `http://localhost:8000/docs` (Swagger generado por FastAPI).

---

## 6. Funcionalidades por sección (frontend)

| Sección (nav) | Rol | Qué hace |
|---------------|-----|----------|
| **Panel** | todos | KPIs (ocupación hoy, etc.), agenda del día, reservas por confirmar (cierre del ciclo del link por WhatsApp), aviso de onboarding si falta RUC. Revenue oculto a recepción. |
| **Reservas** | operativa | Lista agrupada por mes (mes actual primero) + filtros (búsqueda sin tildes, estado, año). Crear reserva individual **o de grupo** (multi-habitación). Click en tarjeta → **modal Detalle** (huésped, estadía, consumos, pagos, resumen financiero). |
| **Calendario** | operativa | Timeline habitación × día; crear desde celda; arrastrar para mover; **bloquear** habitación por rango. |
| **Recepción** | operativa | Check-in / check-out por noches reales, cobros, **Caja del día** + **Cierre de turno** (arqueo firmado). |
| **Habitaciones** | operativa | CRUD de cuartos. |
| **Tarifas** | admin | Precios por temporada (rango de fechas) y/o fin de semana (días), por habitación o globales; precio fijo o ajuste %. Si no hay regla, se usa `precio_base`. |
| **Limpieza** | operativa | Tablero de estado (Limpia/Sucia/Revisión) con cambio de 1 clic + asignación de tareas a personal. |
| **Servicios** | admin | Catálogo de servicios/productos (categoría, precio, activo) que se cargan como consumos a una reserva. |
| **Huéspedes** | operativa | Directorio + CRUD; documento estructurado (DNI/CE/Pasaporte). |
| **Facturas** | operativa | Historial, PDF, exportar pagos. |
| **Facturación** (SUNAT) | admin | Config del emisor + emitir boletas (demo) + comprobantes. |
| **Reportes** | admin | Ocupación, ingresos por día, reservas por día, origen (link vs manual). |
| **Usuarios** | admin | Gestión de cuentas del hospedaje. |
| **Configuración** | admin | Datos del negocio (para la factura) + estado del plan + "Activar/Renovar por WhatsApp". |
| **Hospedajes** | superadmin | Panel de gestión de los clientes del SaaS. |

**Páginas públicas (sin login):** `#/reservar/<slug>` (motor de reservas del hospedaje) y `#/precios` (marketing, 3 planes + precio fundador).

---

## 7. Multi-tenancy y roles

- Cada usuario pertenece a un `hospedaje_id` que viaja en el **JWT**. `Depends(auth.hospedaje_actual)`
  inyecta ese id en cada endpoint y **todas las consultas filtran por él** (aislamiento estanco).
- **Roles:** `superadmin` (dueño del SaaS, solo ve "Hospedajes"); `admin` (configura su hospedaje);
  recepción (operación diaria). El **revenue mensual** se oculta a recepción; la **caja del día** sí
  se le muestra (es el dinero que maneja).
- **Trial:** registro crea hospedaje en estado prueba con `fecha_expira` a +14 días; `auth.verificar_acceso_hospedaje`
  bloquea (403) si la prueba/suscripción venció.

---

## 8. Seguridad (v0.5.0)

Detalle completo en [`pms_hospedaje/SECURITY_CHANGES.md`](pms_hospedaje/SECURITY_CHANGES.md). Resumen:

- **Secret JWT y password admin obligatorios en producción** — la app no arranca sin ellos.
- **Rate-limiting** (`slowapi`) en login (5/min), registro (3/min), google (5/min).
- **Security headers** (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, HSTS en prod).
- **CORS restrictivo** (métodos, headers y orígenes acotados).
- **Sanitización** de nombres de archivo en los PDF (anti path-traversal).
- **Token JWT 2h**; `max_length` en todos los modelos Pydantic; passwords con bcrypt.

### Variables de entorno en producción

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `PMS_ENV=production` | Sí | Activa los guardas de producción |
| `PMS_SECRET_KEY` | Sí | Clave de firma JWT (≥32 chars) |
| `PMS_ADMIN_PASSWORD` | Sí | Password del admin inicial |
| `DATABASE_URL` | Sí | Conexión a PostgreSQL (Neon) |
| `CORS_ORIGINS` | Recomendada | Dominios del frontend (coma-separados) |
| `GOOGLE_CLIENT_ID` | Opcional | OAuth de Google (público; el secret NO va aquí) |

> **Nunca** se commitean secretos. Los PDFs generados (`facturas/`, `comprobantes/`) están gitignored.

---

## 9. Estado actual y pendientes

### Hecho y commiteado en `main`
Motor de reservas + link público, calendario, recepción (check-in/out por noches reales),
facturación interna PDF, SUNAT demo, dashboard/reportes, multi-tenant + roles, página de precios,
cierre del ciclo del link por WhatsApp, descuentos, export CSV, **caja del día, auditoría por
usuario, bloqueo de habitación, documento estructurado, datos del negocio en factura, Configuración,
Housekeeping, cierre de turno, reserva multi-habitación**, e infra técnica (índices de BD,
code-splitting, validación del endpoint público, limpieza de código muerto).

### Cambios recientes **sin commitear** (funcionando, listos para revisar/commitear)
1. **Rework de UI** — sidebar limpio + header dinámico + sin `<h1>` por página.
2. **Seguridad v0.5.0** — ver §8.
3. **Reservas + Consumos + Servicios** — detalle de reserva, búsqueda sin tildes, orden/filtro,
   catálogo de servicios y consumos cargados a la reserva.

### En progreso / pendiente
- **SUNAT a producción:** requiere cuenta **OSE/PSE** (el dueño tiene RUC). El RUC no basta: hace
  falta certificado digital + canal autorizado (SEE-SOL manual, o PSE/OSE con API tipo Nubefact).
  Ver [`SUNAT_PRODUCCION.md`](pms_hospedaje/SUNAT_PRODUCCION.md).
- **Cobro de la suscripción:** hoy manual (Yape/transferencia + activación desde superadmin).
  Mercado Pago automático = ola futura.
- **Mejoras de seguridad futuras** (de SECURITY_CHANGES.md): refresh tokens, blocklist de tokens,
  CAPTCHA en formularios públicos, logging estructurado, connection pooling.

---

## 10. Convenciones de trabajo

- **Commit/push solo cuando el usuario lo pide.** Verificar cada cambio en localhost antes.
- **Diseño:** rol de Director Senior UX/UI — accesibilidad (WCAG), heurísticas de Nielsen,
  jerarquía visual, máx. 3 tipografías, modo claro/oscuro, `prefers-reduced-motion`.
- **SUNAT** permanece en demo hasta tener OSE; no emitir sandbox a un cliente real.
- **Subagentes** disponibles (opus): `agente-hospedaje`, `product-manager`, `cliente-critico`,
  `operaciones-hoteleras`, `ux-hospedaje` — para validar producto/mercado/operación/UX.
