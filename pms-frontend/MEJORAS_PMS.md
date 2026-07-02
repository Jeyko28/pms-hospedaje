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

## ROADMAP (siguientes fases)

### FASE 2 — Huéspedes (vista lista + información valiosa + archivar)
- **Vista Lista/Tarjetas** con selector elegante; preferencia recordada; la lista optimizada
  para cientos/miles (tabla densa, escaneable).
- **Información relevante:** quitar/relegar la *dirección* (poco valor operativo) y priorizar
  indicadores útiles para recepción/admin: nº de reservas, noches acumuladas, gasto total,
  ticket promedio, última visita, próxima reserva, estado (Nuevo/Frecuente/VIP),
  cancelaciones previas. Requiere agregaciones en backend (endpoint de "métricas de huésped").
- **Eliminar → Archivar (soft-delete):** en un PMS real no se borra un huésped (rompe
  historial/estadísticas/trazabilidad). Se propone `estado` (activo/archivado) + filtro
  "mostrar archivados", conservando el historial. Argumentado.

### FASE 3 — Inventario (módulo escalable) + integración Productos/Servicios
- Arquitectura: categorías (Cocina, Minimarket, Limpieza, Operación) + productos con stock,
  stock mínimo, unidad, costo, proveedor; movimientos (entradas/salidas), valorización,
  alertas de stock bajo, historial de consumo.
- Integración: al vender un producto (Coca-Cola, cerveza, snack…) se **descuenta stock**
  automáticamente. Base preparada para **recetas/insumos** (un plato consume ingredientes) —
  se documenta cómo escalar aunque quede como fundación.

### FASE 4 — Centro de notificaciones real
- Eventos con **prioridad** (crítica/alta/media/baja): reservas (nueva del link,
  cancelada, check-in/out próximos, sobreventa), huéspedes (VIP, frecuente), inventario
  (stock bajo/agotado), sistema y administración (pagos pendientes). Contador real, marcar
  leída/todas, filtrar, historial.

### FASE 5 — Auditoría completa + loop de mejora
- Auditoría crítica de todo (landing → PMS → cada módulo → responsive → dark → performance →
  a11y → código → conversión). Detectar debilidades, priorizar, corregir, repetir.

> Nota de método: cada fase se entrega verificada (build + preview + backend) y desplegada, y
> se documenta aquí. Las fases 2-4 son features de mayor tamaño (backend + UI) y se
> construyen de forma incremental.
