# Auditoría final integral — Vantry PMS (#11)

> Revisión transversal del sistema: seguridad, aislamiento multi-tenant, integridad,
> pagos, infraestructura y estado de producción. Aterrizada en el código real y en el
> trabajo de esta etapa. Fecha: 2026-07-12.

## Veredicto general
El **núcleo está sólido y es vendible en piloto** (reservas, dinero, multi-tenant, auth). Lo que
falta para vender/escalar en serio es **infraestructura y operaciones** (backups, always-on) y los
items bloqueados por el **DNI** (pagos reales, SUNAT producción) — no defectos del código.

**Semáforo:** 🟢 Núcleo · 🟡 Ops/infra (backups, Render pago) · 🔴 Nada crítico abierto.

---

## Hallazgos por categoría

### 1. Aislamiento multi-tenant 🟢 (lo más importante en un SaaS)
- **123** dependencias `Depends(auth.*)` → casi todo endpoint interno exige sesión + rol, y filtra
  por `hospedaje_actual` (hid). Patrón consistente en todo `api.py`.
- Superadmin ve todo (intencional); admin/recepción quedan acotados a **su** `hospedaje_id`.
- **Sin fugas detectadas** en el patrón. Recomendación de continuidad: un **test automatizado** que,
  con 2 hospedajes, verifique que uno no puede leer/editar datos del otro (defensa ante regresiones).

### 2. Endpoints públicos (superficie sin login) 🟡 bajo riesgo
Solo 6, todos bajo `/api/publico/` (+ auth, webhook, contacto). Revisión:
- `hospedaje/{slug}`, `disponibilidad/{slug}`, `reservar/{slug}` → motor de reservas, por diseño.
- `pagos/checkout`, `pagos/{external_id}/estado`, `pagos/webhook/{proveedor}` → `external_id` es UUID
  aleatorio (no enumerable). ✅
- ⚠️ **`habitacion/{id}/fotos`** expone fotos por **id secuencial** → alguien podría enumerar
  (1,2,3…) y raspar fotos de todos los hospedajes. **Severidad baja** (las fotos son contenido que
  igual se muestra al huésped), pero es enumeración cross-tenant. *Mejora opcional:* limitar a
  habitaciones de hospedajes activos.
- ✅ **Rate-limits ya aplicados** (reads 120/min, writes 15/min, webhook 60/min) — esta sesión se
  corrigió que **NO se aplicaban** (orden de decoradores slowapi invertido en todo el proyecto,
  incluido el anti fuerza-bruta del login). Ya funcionan (verificado con 429 tras el umbral).

### 3. Seguridad / auth 🟢
- Secretos **obligatorios en prod**: la app no arranca sin `PMS_SECRET_KEY` ni `PMS_ADMIN_PASSWORD`
  (`auth.py`). Credenciales (BD, SMTP, Google) por env, nunca en el repo.
- Contraseñas con **bcrypt**; JWT con expiración; recuperación con token hasheado + 1 h + un solo uso.
- Headers de seguridad + CORS acotado (origen de prod en lista).
- Pendiente menor (de `SECURITY_CHANGES.md`): refresh tokens, blocklist de tokens, CAPTCHA en
  formularios públicos, logging estructurado. No bloqueantes para piloto.

### 4. Integridad de datos 🟢
- Migraciones **idempotentes** en `migracion_multitenant.py` (guards `_tabla_existe`/`_columnas_de`).
- Soft-delete (archivar) en huéspedes; auditoría por usuario en pagos/estancias/check-in-out.
- **Lección ya aplicada:** al añadir columnas, los modelos aceptan `**_` (evita `TypeError`); y el
  wrapper `dbengine` pasa `None` cuando no hay params (evita el crash de `%` en Postgres).

### 5. Pagos / PCI 🟢 (diseño correcto)
- Fase 1 en **sandbox** (no mueve dinero). El diseño real (Mercado Pago) usa **checkout hospedado**
  → el sistema **nunca toca datos de tarjeta** (PCI mínimo). Webhook idempotente por `external_id`.
- Bloqueado por DNI para producción (esperado).

### 6. Infraestructura / deploy / backups 🟡 (aquí está el trabajo real)
- ✅ **BD en Supabase con pooler (6543)** — resuelto el P0 de conexiones (migrado esta sesión).
- 🟡 **Render Free hace spin-down** (~50 s el primer request) → **plan de pago** antes de vender.
- 🔴 **Backups:** Supabase Free tiene backups limitados (se vio "No backups"). **Definir estrategia
  de respaldo** (plan Supabase con PITR, o export periódico) antes de datos reales de clientes.
- ⚠️ **Los deploys de Render pueden fallar en silencio** (ya pasó con `slowapi`, `%` en SQL): la
  instancia vieja sigue viva. **Verificar siempre "live"** tras cada push (Events + preflight CORS).

### 7. Correo / entregabilidad 🟡
- SMTP (Brevo) funciona, pero con remitente `@gmail` la **entregabilidad es regular** (spam). Fix:
  **dominio propio** autenticado (DKIM/DMARC). Ya documentado.

### 8. Frontend 🟢
- Code-splitting por ruta (el huésped no descarga el PMS); `ErrorBoundary` por sección; toasts;
  responsive + claro/oscuro. Sin hallazgos.

---

## Lo que está sólido (no tocar sin motivo)
Multi-tenant con auth densa + 21 índices; patrón adaptador swappable (sunat/pasarela/correo/
tipo_cambio); funciones a prueba de fallos (tasa/correo no tumban el request); migraciones
idempotentes; backend stateless; front con code-splitting.

## Checklist antes de vender/escalar (prioridad)
1. 🔴 **Estrategia de backups** de la BD (Supabase con PITR o export programado).
2. 🟡 **Render de pago** (quitar spin-down).
3. 🟡 **Dominio propio** para el correo (salir de spam).
4. 🟢 **Test de aislamiento multi-tenant** (2 hospedajes) — defensa anti-regresión.
5. 🟢 Object storage para fotos (Supabase Storage) cuando crezcan.
6. ⛔ Bloqueado por DNI: pagos reales (MP) + SUNAT producción.

## Conclusión
No hay defectos críticos abiertos. El código está **listo para un piloto pagado** con 1-3
hospedajes; el salto a "vender ampliamente" depende de **ops** (backups + always-on) y de **desbloquear
el DNI**, no de reescribir nada. Recomendación: piloto ya, y atacar el checklist por orden.
