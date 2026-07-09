# Auditoría del sistema — Vantry PMS (2026-07-03)

> Auditoría crítica tras las fases de mejora (Fase 5 del brief "Autonomous Product Team").
> Metodología: revisión automatizada (modelos vs. esquema, barrido de errores de consola/API
> en todas las secciones) + revisión por dimensiones (responsive, dark, performance, a11y,
> seguridad, código). Enfoque "detectar → priorizar → corregir → re-verificar".

## Hallazgos y correcciones

### 🔴 Crítico (corregido) — Clase de bug: modelos vs. columnas nuevas
Los modelos de `modelos.py` se construyen con `Modelo(**dict(row))`. Al añadir columnas a
una tabla en migraciones (multi-tenant, y las de estas fases), si el `__init__` del modelo no
aceptaba la columna, lanzaba `TypeError` y **tumbaba el endpoint**.
- **Detectado (auditoría automática):** `TareaLimpieza` no aceptaba `hospedaje_id`;
  `Huesped` no aceptaba `archivado` (rompía **check-out** y editar huésped, en prod desde la
  Fase 2); `ServicioHabitacion` no aceptaba `inventario_item_id`.
- **Corregido:** los 9 modelos ahora aceptan sus columnas + `**_` para **tolerar cualquier
  columna futura** → clase de bug eliminada. Re-auditoría: **0 modelos rotos.**
- **Lección/proceso:** al añadir una columna a una tabla con modelo, el `__init__` ya la
  ignora vía `**_`; no se requiere acción, pero conviene mantener el patrón.

### 🟠 Menor (corregido) — Petición inútil en DetalleReserva
`DetalleReserva` pedía `/api/reservas/null/detalle` (→ 422) al estar el modal cerrado
(`reservaId` nulo). Se guardó el fetch para que solo pida con una reserva seleccionada.

### 🟢 Estabilidad — Barrido de errores
Recorrido de las **14 secciones** (dashboard, reservas, calendario, recepción, habitaciones,
tarifas, limpieza, servicios, inventario, huéspedes, facturas, reportes, usuarios,
configuración): **0 errores de consola** y **0 fallos de API** tras las correcciones.

## Revisado — OK (con notas)
- **Colorimetría / dark mode:** unificada App↔Landing (índigo + off-white cálido) vía tokens;
  claro y oscuro verificados por estilos computados.
- **Responsive:** sidebar → drawer en móvil; tablas con scroll horizontal; grids que colapsan
  por breakpoint.
- **Performance:** rutas con code-splitting (lazy) y Recharts solo en Dashboard/Reportes; los
  mini-gráficos de KPI son SVG inline (sin ResponsiveContainer). Migraciones additivas e
  idempotentes.
- **Accesibilidad:** foco visible (tokens), `prefers-reduced-motion` respetado, roles/aria en
  nav, notificaciones y formularios; contraste AA cuidado (muted más oscuro que la landing).
- **Seguridad/integridad:** endpoints por rol (`solo_admin`/`solo_superadmin`); soft-delete
  (huéspedes, inventario) preserva historial; validaciones (stock, montos, fechas).

## Recomendaciones (siguiente iteración)
1. **Notificaciones en móvil:** hoy la campana vive en el header de escritorio; añadir acceso
   en el topbar móvil.
2. **Recetas/insumos:** tabla de composición para que un plato descuente varios items
   (reutiliza `_descontar_inventario_por_venta`).
3. **Alinear `PLAN_LABEL`** de Configuración (`basico`) con inicia/crece/pro.
4. **Tests automatizados**: el bug de modelos se habría atrapado con un test que instancia
   cada modelo desde una fila real (el mismo chequeo de esta auditoría).
5. **Reportes SUNAT en producción** y **channel manager** siguen como hitos mayores del
   roadmap de producto (ver ANALISIS_COMPETITIVO.md).

## Verificación
- Auditoría de modelos: script que instancia cada modelo desde una fila → 0 rotos.
- Barrido de consola/API por sección → limpio.
- `npm run build` 0 errores; backend `py_compile` OK.
