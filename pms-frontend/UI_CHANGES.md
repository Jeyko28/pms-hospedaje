# Cambios de UI - Layout del Sidebar, Header y Títulos

**Fecha:** 27 de junio de 2026  
**Archivos modificados:** `AppShell.jsx`, `AppShell.css`, 12 page components

---

## Resumen de cambios

1. **Sidebar limpio** — solo logo + items de navegación (sin usuario/tema/logout)
2. **Header dinámico** — muestra título + subtítulo de la sección activa, más acciones a la derecha
3. **Títulos eliminados de las páginas** — cada página ya no muestra su propio h1/subtítulo

---

## Layout final

```
┌──────────────┬─────────────────────────────────────┐
│   Sidebar    │  Panel de control        [👤][🔔][🚪]│
│              │  Resumen de tu hospedaje...          │
│  Logo        ├─────────────────────────────────────┤
│  Panel       │                                     │
│  Reservas    │         Contenido                   │
│  Calendario  │                                     │
│  Recepción   │                                     │
│  Habitaciones│                                     │
│  Limpieza    │                                     │
│  Huéspedes   │                                     │
│  ...         │                                     │
└──────────────┴─────────────────────────────────────┘
```

---

## Header de escritorio

### Lado izquierdo (dinámico según sección)
| Sección | Título | Subtítulo |
|---------|--------|-----------|
| Panel | Panel de control | Resumen de tu hospedaje en tiempo real. |
| Reservas | Reservas | Gestiona las reservas de tu hospedaje. |
| Calendario | Calendario | Vista de ocupación por habitación. |
| Recepción | Recepción | Gestiona las entradas y salidas de huéspedes. |
| Habitaciones | Habitaciones | Administra las habitaciones de tu hospedaje. |
| Limpieza | Limpieza | Estado de limpieza de las habitaciones. |
| Huéspedes | Huéspedes | Tu directorio de huéspedes registrados. |
| Facturas | Facturas | Historial de facturación de tu hospedaje. |
| Facturación | Facturación electrónica | Emite boletas de venta electrónicas (SUNAT). |
| Reportes | Reportes | Finanzas y ocupación de tu hospedaje. |
| Usuarios | Usuarios | Gestiona quién puede acceder al sistema. |
| Configuración | Configuración del negocio | Estos datos aparecen en tus facturas y comprobantes. |
| Hospedajes | Hospedajes | Panel de administración del servicio. |

### Lado derecho (siempre fijo)
| Posición | Elemento | Función |
|----------|----------|---------|
| 1 | Usuario (avatar + nombre + rol) | Quién está logueado |
| 2 | Notificaciones (campana) | Placeholder |
| 3 | Cerrar sesión (logout) | Cierra sesión |

---

## Páginas modificadas

Se eliminó el `<h1>` y el párrafo de subtítulo de cada página. Los botones de acción (ej: "Nueva reserva", "+ Nuevo huésped") se mantienen.

| Página | Acciones que se mantienen |
|--------|--------------------------|
| Dashboard | "Nueva reserva" |
| Reservas | "Exportar", "Nueva reserva" |
| Calendario | Navegación de mes, "Hoy", "Bloquear" |
| Recepción | (ninguna) |
| Habitaciones | "Nueva habitación" |
| Limpieza | (ninguna) |
| Huéspedes | "Exportar", "Nuevo huésped" |
| Facturas | "Exportar pagos" |
| Facturación | (ninguna) |
| Reportes | (ninguna) |
| Usuarios | "Nuevo usuario" |
| Configuración | (ninguna) |
| Hospedajes | "Nuevo hospedaje" |

---

## Mobile (< 860px)

En móvil, el header de escritorio se oculta. El topbar móvil muestra:
- Hamburguesa (abre drawer)
- Título fijo "PMS Hospedaje"
- Botón de tema

Los títulos/descripciones de cada sección se siguen mostrando dentro de cada página en móvil (comportamiento original).

---

# Reservas: Orden de Grupos y Filtro de Año

**Fecha:** 28 de junio de 2026  
**Archivos modificados:** `Reservas.jsx`, `Reservas.css`

---

## Cambios realizados

### 1. Orden de grupos por mes
Los meses ahora se muestran en este orden:
1. **Mes actual** (siempre primero)
2. **Meses futuros** (en orden cronológico ascendente)
3. **Meses pasados** (en orden cronológico ascendente)

Esto permite que lo más relevante (el mes en curso) aparezca siempre arriba.

### 2. Filtro de año
Se agregó un tercer filtro "Año" junto a "Buscar" y "Estado":
- Muestra los años disponibles extraídos automáticamente de las reservas existentes
- Opción "Todos" para mostrar todos los años
- Se combina con los filtros existentes (búsqueda por texto y estado)

### 3. Grid de filtros
El grid de filtros pasó de `2fr 1fr` (2 columnas) a `2fr 1fr 1fr` (3 columnas) para acomodar el filtro de año.

---

# Búsqueda sin tildes (normalización Unicode)

**Fecha:** 28 de junio de 2026  
**Archivos modificados:** `src/utils/normalizar.js` (nuevo), `Reservas.jsx`, `SelectorHuesped.jsx`, `Facturas.jsx`, `Huespedes.jsx`, `Hospedajes.jsx`

---

## Problema

La búsqueda de texto usaba `.toLowerCase().includes()`, que compara caracteres Unicode literalmente. Esto causaba que buscar "maria" no encontrara "María" porque `á` ≠ `a`.

## Solución

Se creó una función `normalizar(str)` que elimina diacríticos/acentos usando Unicode NFD normalization y luego convierte a minúsculas. Se aplicó en todas las páginas con búsqueda de texto:

```js
// ANTES
r.huesped.toLowerCase().includes(texto)

// DESPUÉS
normalizar(r.huesped).includes(normalizar(texto))
```

### Archivos modificados

| Archivo | Campos de búsqueda normalizados |
|---------|--------------------------------|
| `reservas/Reservas.jsx` | `huesped`, `habitacion` |
| `reservas/SelectorHuesped.jsx` | `nombre`, `documento`, `email` |
| `facturas/Facturas.jsx` | `huesped`, `habitacion` |
| `huespedes/Huespedes.jsx` | `nombre`, `email`, `documento`, `telefono` |
| `hospedajes/Hospedajes.jsx` | `nombre` |

Ahora buscar "maria", "cesar", "jose" etc. funciona sin importar las tildes.

---

# Detalle de Reserva + Consumos + Servicios

**Fecha:** 28 de junio de 2026  
**Archivos modificados (frontend):** `Reservas.jsx`, `client.js`, `DetalleReserva.jsx` (nuevo), `DetalleReserva.css` (nuevo), `Servicios.jsx` (nuevo), `Servicios.css` (nuevo), `App.jsx`, `AppShell.jsx`  
**Archivos modificados (backend):** `database.py`, `modelos.py`, `migracion_multitenant.py`, `api.py`

---

## Descripción

Al hacer clic en cualquier tarjeta de reserva en la página de Reservas, se abre un **modal de detalle** con toda la información de la reserva organizada en secciones:

### Secciones del modal

1. **Huésped** — nombre, estado (badge), teléfono, email, documento
2. **Habitación** — número, tipo, precio base por noche
3. **Estadía** — fechas reservadas (con noches), check-in real, check-out real, usuario que hizo check-in, origen
4. **Consumos** — tabla de servicios y pedidos asignados a la reserva (tipo, descripción, cantidad, precio unitario, total)
5. **Pagos** — tabla de pagos realizados (método con icono, monto, fecha, referencia)
6. **Resumen financiero** — hospedaje, consumos, descuento, total, pagado, saldo
7. **Notas** — notas de la reserva

### Backend — Nuevas tablas

- **`servicios_habitacion`** — catálogo de servicios disponibles (limpieza, mantenimiento, etc.)
- **`consumos`** — servicios y pedidos asignados a una reserva (tipo: "servicio" o "pedido")

### Backend — Nuevos endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/reservas/{id}/detalle` | Detalle completo con estancia, factura, pagos y consumos |
| `GET` | `/api/consumos?reserva_id=X` | Listar consumos de una reserva |
| `POST` | `/api/consumos` | Registrar consumo |
| `DELETE` | `/api/consumos/{id}` | Eliminar consumo |
| `GET` | `/api/servicios-habitacion` | Catálogo de servicios |
| `POST` | `/api/servicios-habitacion` | Crear servicio (admin) |
| `PUT` | `/api/servicios-habitacion/{id}` | Editar servicio (admin) |
| `DELETE` | `/api/servicios-habitacion/{id}` | Eliminar servicio (admin) |

### Frontend — Cambios

- `Reservas.jsx` — Las tarjetas ahora son clickeables (`onClick` → abre modal). Los botones "Confirmar" y "Cancelar" usan `stopPropagation()` para no abrir el modal.
- `client.js` — 8 llamadas API nuevas para detalle, consumos y servicios.
- `DetalleReserva.jsx` — Componente de modal con secciones de info, usa `useApi` para cargar datos del endpoint `/api/reservas/{id}/detalle`.
- `DetalleReserva.css` — Estilos BEM para el modal (secciones, tablas, totales, badges de tipo).

### Servicios — Página CRUD del catálogo

- **Ruta:** `servicios` (solo admin)
- **Nav:** "Servicios" entre Limpieza y Huéspedes en la barra lateral
- **Funcionalidad:**
  - Lista de servicios/productos del catálogo (precio, categoría, subcategoría, estado activo/inactivo)
  - Filtros: búsqueda por nombre/subcategoría + filtro por categoría
  - Resumen: total / activos / inactivos
  - CRUD completo: crear, editar, activar/desactivar, eliminar
  - Categorías: Bebidas, Snacks, Limpieza, Mantenimiento, Servicios, General
  - Subcategoría para jerarquía (ej: Bebidas → Agua, Gaseosa, Cerveza)
- **Archivos:**
  - `src/pages/servicios/Servicios.jsx` — Componente principal
  - `src/pages/servicios/Servicios.css` — Estilos
  - `AppShell.jsx` — Nav entry con icono Coffee
  - `App.jsx` — Lazy import + switch case (admin-only)
