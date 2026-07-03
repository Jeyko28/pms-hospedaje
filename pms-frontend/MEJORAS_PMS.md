# Mejoras del PMS — programa de trabajo (brief "Autonomous Product Team v2")

> Documento vivo. Registra las decisiones (UX/UI/arquitectura) de cada fase de mejora del
> PMS Stanza, con su fundamento. Se actualiza al cerrar cada fase.

El brief es un programa grande (11 frentes + auditoría + loop). Se ejecuta **por fases
priorizadas por impacto/esfuerzo**, cada una verificada y desplegada, en vez de todo a la
vez y superficial. En cada decisión se aplican las lentes de PM, UX, hotelería, a11y,
performance y data-viz.

---

## FASE 1 (hecha) — Correcciones visibles de alto valor

### 1. Dashboard · "Ingresos del mes" (mini-gráfico)
**Problema:** el mini-gráfico (Recharts `MiniLine` con `ResponsiveContainer`) se desbordaba
sobre el número en tarjetas angostas (medía mal el ancho), compitiendo con el dato.
**Decisión (data-viz + frontend):** reemplazar los mini-gráficos de KPI por **sparklines en
SVG inline** (`MiniLine` = área, `SparkBars` = barras) — deterministas, nunca se desbordan,
degradan bien con 0/pocos puntos, más livianos, color vía `currentColor` (adaptan a
claro/oscuro). Recharts se mantiene para los gráficos grandes de Reportes. Además,
`.kpi__chart` lleva `overflow:hidden` como red de seguridad. Resultado: el número es el
protagonista; el sparkline complementa. *(charts.jsx, widgets.css)*

### 2. Configuración · Apariencia (claro / oscuro / sistema)
El sistema de tema ya existía (topbar) pero no había un apartado para elegirlo. Se añadió
una sección **Apariencia** con 3 opciones (radiogroup accesible). Se extendió `useTheme`
para soportar el modo **"Sistema"** (sigue `prefers-color-scheme` en vivo) además de
claro/oscuro; el modo se persiste en `localStorage` y se aplica al instante. Compatibilidad:
`theme`/`toggle` siguen funcionando para el topbar y la landing. *(useTheme.js,
Configuracion.jsx/.css)*

### 3. Reservas · Acordeón de meses
**Problema:** todos los meses expandidos → lista larguísima. Se convirtió cada mes en un
**acordeón** (cabecera-botón con chevron que rota, `aria-expanded`). Animación de altura con
`grid-template-rows: 0fr↔1fr` (suave, sin medir alturas; se anula con
`prefers-reduced-motion`). **Se recuerda** el estado por mes en `localStorage`; permite
varios meses abiertos a la vez; por defecto solo el **mes en curso** queda expandido (acorta
la lista sin perder acceso). *(Reservas.jsx, Reservas.css)*

---

## FASE 2 (hecha) — Huéspedes: vista lista + métricas + archivar

- **Vista Lista/Tarjetas** con toggle segmentado; preferencia recordada en `localStorage`
  (`pms-huespedes-vista`). La **Lista** es una tabla densa (Huésped, Estado, Reservas,
  Noches, Gastado, Última visita, Próxima, Contacto, Acciones) pensada para cientos/miles.
- **Métricas por huésped** (backend, `GET /api/huespedes` enriquecido): reservas, noches,
  gasto total, ticket promedio, última visita, próxima reserva, cancelaciones y **estado
  derivado** — VIP (5+ estadías o S/1500+), Frecuente (2+), Nuevo. Se computan en una sola
  pasada sobre `reservas` (portable, sin SQL específico de motor).
- **Dirección relegada:** ya no se muestra en la tarjeta principal (poco valor operativo);
  sigue disponible y opcional en el formulario. Las tarjetas ahora muestran lo valioso
  (estado, reservas, gasto, noches, próxima/última visita, contacto).
- **Archivar en vez de eliminar (soft-delete):** `DELETE /api/huespedes/{id}` ahora **archiva**
  (`archivado=1`, migración additiva) y hay `POST /{id}/desarchivar`. Conserva TODO el
  historial y estadísticas (en un PMS real borrar rompe reportes/trazabilidad). Filtro
  "Mostrar archivados" en la UI. *Fundamento:* la integridad del historial > la limpieza del
  listado; el archivado da lo segundo sin sacrificar lo primero.
- Verificado: métricas correctas, archivar 23→22 y restaurar→23, toggle + persistencia,
  dirección ausente de la tarjeta. *(api.py, migracion_multitenant.py, client.js,
  huespedes/Huespedes.jsx + Huespedes.css)*

## FASE 4 (hecha) — Centro de notificaciones real

- **Decisión de arquitectura:** las notificaciones se **calculan del estado actual**
  (`GET /api/notificaciones`), no se guardan en un buzón. Evita montar infraestructura de
  eventos y siempre refleja la realidad: cuando el evento se resuelve (p. ej. confirmas la
  reserva), la notificación desaparece sola. El estado **"leída" vive en el cliente**
  (localStorage por usuario, con el id estable de cada notificación) → contador de no leídas.
- **Eventos con prioridad** (crítica/alta/media/baja): reservas por confirmar (alta),
  salidas vencidas (crítica), check-in/check-out de hoy (media; check-out con saldo → alta),
  y suscripción por vencer/vencida (solo admin). Ordenadas por prioridad y fecha.
- **UI:** campana en el header con **contador** de no leídas; panel desplegable con filtro
  Todas/No leídas, punto de color por prioridad, "Marcar todas como leídas", clic en un ítem
  → navega a la sección y lo marca leído. Cierra al hacer clic fuera / Escape; refresco cada
  60s. *(components/NotificationCenter.jsx + .css, AppShell.jsx, api.py, client.js)*
- Verificado: badge=3, panel con ítems, "marcar todas" → 0 no leídas + persistencia.
- Pendiente menor: la campana está en el header de escritorio; añadir acceso en móvil en
  próximas iteraciones. (La fuente "stock bajo" ya está integrada — ver Fase 3.)

---

## FASE 3 (hecha) — Inventario (módulo escalable)

- **Arquitectura:** tablas `inventario_items` (nombre, categoría [Cocina/Minimarket/Limpieza/
  Operación], unidad, stock, stock_minimo, costo_unitario, proveedor, activo) e
  `inventario_movimientos` (entrada/salida/ajuste, cantidad, stock_resultante, motivo, costo,
  usuario). El **historial de movimientos es la fuente de verdad** del stock. Migración additiva.
- **Endpoints (admin):** GET `/api/inventario` (con alerta y valorización), GET
  `/api/inventario/resumen`, POST/PUT/DELETE (archivar), POST `/{id}/movimiento` (actualiza
  stock atómicamente; la salida valida stock suficiente → 409), GET `/{id}/movimientos`.
- **UI:** sección "Inventario" (admin) con filtro por categoría, buscador, KPIs (productos, en
  alerta, valor del stock), tabla con alerta de stock bajo/agotado, y modales para crear/editar
  y **registrar movimiento** (entrada/salida/ajuste + historial reciente). Archivar en vez de
  borrar. *(pages/inventario/*, App.jsx, AppShell.jsx, client.js, api.py, migración)*
- **Integración con notificaciones:** stock bajo → "Stock bajo" (alta) / "Producto agotado"
  (crítica) con ruta a Inventario. **Verificado.**
- Verificado end-to-end: crear → salida 24→4 → alerta; salida excesiva → 409; resumen; nav;
  notificación de stock bajo.
- **Preparado para 3B:** columna `servicios_habitacion.inventario_item_id` (ya creada) para
  enlazar el catálogo de productos con items de inventario y **descontar stock al vender**.

---

## FASE 3B (hecha) — Auto-descuento de stock al vender

- **Enlace producto ↔ inventario:** en el catálogo de Servicios, un **producto** puede
  enlazarse a un item de inventario (`servicios_habitacion.inventario_item_id`). Selector en
  el formulario (solo productos). Backend: create/edit persisten el enlace; el listado lo
  devuelve (`inventario_item_id` + `inventario_nombre`).
- **Descuento automático:** al registrar un consumo desde un producto enlazado
  (`POST /api/consumos` con `servicio_id`), se **descuenta el stock** del item (movimiento
  'salida' "Venta a huésped"). No baja de 0 y **nunca bloquea la venta** si falta stock.
  Los consumos libres (sin enlace) no tocan el inventario.
- **⚠️ Regresión corregida (importante):** al añadir columnas nuevas en fases previas
  (`huespedes.archivado` en F2, `servicios_habitacion.inventario_item_id` en 3B), los modelos
  `Huesped`/`ServicioHabitacion` hacían `Modelo(**dict(row))` y **fallaban** con
  `TypeError: unexpected keyword argument`. Esto rompía `editar_huesped` y **`hacer_checkout`**
  (¡en producción desde F2!). Fix: los `__init__` ahora aceptan las columnas nuevas + `**_`
  para tolerar cualquier columna futura. *(modelos.py)*
- Verificado: vender 3 de un producto enlazado → stock 10→7; consumo sin enlace → stock
  intacto; selector en la UI; `editar_huesped`/checkout de nuevo 200.
- Escalable a **recetas/insumos** (un plato consume varios items) vía una tabla de composición
  futura, reutilizando `_descontar_inventario_por_venta`.

---

## ROADMAP (siguientes fases)

### FASE 5 — Auditoría completa + loop de mejora
- Auditoría crítica de todo (landing → PMS → cada módulo → responsive → dark → performance →
  a11y → código → conversión). Detectar debilidades, priorizar, corregir, repetir.

> Nota de método: cada fase se entrega verificada (build + preview + backend) y desplegada, y
> se documenta aquí. Las fases 2-4 son features de mayor tamaño (backend + UI) y se
> construyen de forma incremental.
