# Auditoría y rediseño del módulo de Facturación — Stanza (2026-07-03)

> Análisis multidisciplinar **previo a implementar** (por pedido del dueño: "no implementes
> hasta terminar el análisis"). Tres miradas, todas fundamentadas en el código real:
> **Arquitectura de producto** (Claude), **UX/UI** (subagente `ux-hospedaje`) y
> **Facturación electrónica peruana / tributario** (subagente `facturacion-electronica-peru`,
> creado para este módulo). Este documento es la fuente de la decisión; la implementación se
> hará por fases tras la aprobación.

---

## 1. Auditoría inicial — qué existe hoy

Tres secciones del sidebar tocan facturación con responsabilidades solapadas:

| Sección (label) | Ruta | Visible | Contenido real | Capa que representa |
|---|---|---|---|---|
| **Facturas** | `facturas` | Todos | Historial de **cuentas internas** (tabla `facturas`: total/pagado/saldo) + PDF + botón **"Emitir boleta"** | Cuenta/folio (mal nombrada) |
| **Facturación** | `sunat` | Admin | **"Datos del emisor"** (RUC, serie, razón, dirección, activar) + **"Comprobantes emitidos"** (lista plana) | Emisor + comprobantes (mezclados) |
| **Configuración** | `configuracion` | Admin | **"Datos del negocio"** (Nombre, RUC, Razón social, Dirección, Tel, Email) + Apariencia/Adelanto/Plan | Emisor (duplicado) |

**Infraestructura que SÍ está bien** (no rehacer): adaptador `EmisorBase`/`EmisorSandbox` con
factory `obtener_emisor` (preparada para OSE/PSE tipo Nubefact), tabla `comprobantes` con campos
tributarios reales (`tipo`, `serie`, `correlativo`, `numero`, `cliente_tipo_doc`, `estado`,
`modo`, `hash`), correlativo por hospedaje, bloqueo de doble emisión por factura, y el aviso
honesto "Modo demo (sandbox), sin valor tributario".

---

## 2. Problema de fondo: **3 capas jurídicamente distintas, mezcladas**

Un PMS peruano correcto separa tres cosas; hoy están confundidas y repartidas en 3 pantallas:

| Capa | Qué es | Mutabilidad | Fuente de verdad correcta |
|---|---|---|---|
| **A · Emisor** (identidad fiscal) | RUC, razón social, domicilio fiscal, series, ambiente | RUC/razón/domicilio: **solo lectura** tras validar; serie/ambiente/activar: editable auditado | **Un único lugar fiscal** |
| **B · Cuenta / folio** | Lo que el huésped debe (total, pagado, saldo, consumos) | **Editable** hasta emitir | `facturas` (nombre desafortunado) |
| **C · Comprobante** | Boleta/Factura/NC/ND con serie-correlativo, IGV, CDR | **Inmutable** (se corrige con NC/ND) | `comprobantes` |

Hoy: la capa B se llama "Facturas" (❌), la C se emite en "Facturas" pero se lista en
"Facturación" (❌ acción e historial separados), y la A vive en **dos tablas editables a la vez**
(❌ ver §3).

---

## 3. Duplicidades detectadas (evidencia en código)

**Emisor duplicado en dos tablas, editable desde dos pantallas:**
- `hospedajes` (ruc, razon_social, direccion, telefono, email) ← editable en **Configuración**
  (`guardar_mi_hospedaje`, api.py:689-728).
- `sunat_config` (ruc, razon_social, direccion, serie, modo, activo) ← editable en **Facturación**
  (`sunat_guardar_config`, api.py:3227-3240).
- **Sync de una sola vía:** Configuración empuja ruc/razón/dirección a `sunat_config`
  (api.py:723-726), pero editar "Datos del emisor" **no** reescribe `hospedajes`.
  → **RUC divergente garantizado** entre pantallas (riesgo tributario **R6**).
- El patrón "leer todo y reescribir" del sync es frágil: podría **pisar la serie** si mañana se
  añade al formulario comercial.

---

## 4. Hallazgos tributarios adicionales (SUNAT) — más allá de la duplicidad

Del subagente `facturacion-electronica-peru`, verificados en `sunat.py`/`api.py`:

- **R1 (alto) · Correlativo duplicable:** `comprobantes` no tiene `UNIQUE(hospedaje_id, serie,
  correlativo)` ni lock; un crash entre INSERT y `UPDATE correlativo_boleta` (sunat.py:280-285)
  puede repetir número → infracción SUNAT.
- **R2 (alto en prod) · No hay IGV desglosado:** el comprobante guarda solo `total`; UBL 2.1
  **exige** base gravada + IGV 18% (`cbc:TaxAmount`). El XML de producción **será rechazado**.
  Funciona en sandbox y fallará el día que se conecte el OSE (falsa sensación de completitud).
- **R3 (medio) · No hay factura:** un huésped con **RUC** (viajero corporativo, empresa que paga
  la estadía) **no puede recibir factura** → sin crédito fiscal. `emitir_boleta` hardcodea
  `"tipo": "boleta"` (sunat.py:245).
- **R4 (medio) · `tipo_documento` no propagado:** `sunat_emitir_boleta` pasa solo `{nombre,
  documento}` (api.py:3297); CE/Pasaporte se graban como DNI.
- **R5 (medio) · No hay NC/ND ni baja:** un comprobante emitido por error es irreversible en el
  sistema (legalmente solo se corrige con nota de crédito).
- **R7 (medio) · Emisor leído en vivo al generar el PDF** (sunat.py:314) → cambiar la razón social
  reescribe la apariencia de comprobantes ya emitidos → rompe inmutabilidad (falta **snapshot**).
- Falta **resumen diario de boletas** (obligatorio en producción) y **multi-moneda** funcional
  (`moneda` existe pero se hardcodea "PEN"; turismo receptivo cobra en USD).

---

## 5. Hallazgos UX — más allá de la arquitectura

Del subagente `ux-hospedaje`:
- **R8 (alto) · "Factura #id" sobre la cuenta interna** (Facturas.jsx:215): recepción cree que ya
  declaró a SUNAT cuando solo cerró el folio → riesgo de **no emitir** el comprobante real.
- **R9 · Tres pantallas solapadas + nombres homófonos** ("Facturas"/"Facturación") → el usuario no
  sabe dónde emitir, dónde consultar ni dónde editar. `label` del sidebar ≠ `title` de la pantalla.
- **"Datos del emisor"** es una card fija de 5 campos que estorba a quien solo quiere ver
  comprobantes → debe ser **colapsable**.
- **"Comprobantes emitidos"** es lista plana → no escala; sin agrupar por periodo ni totales (lo
  que el **contador** necesita); renderiza todo a la vez (lento en laptops económicas).
- **Prevención de error:** "Emitir boleta" falla si el emisor no está activo, en vez de
  deshabilitarse con tooltip.
- Badges del comprobante no reflejan el estado real; `ConfigSunat` no valida el RUC (Configuración
  sí); hay `<header>` vacíos.

---

## 6. Decisiones arquitectónicas (síntesis de las 3 miradas)

### 6.1 Nomenclatura (las tres miradas convergen)
| Hoy | Nuevo | Por qué |
|---|---|---|
| "Facturas" (cuenta interna) | **"Cuentas"** | Es el folio del huésped ("la cuenta de la habitación"). No es un comprobante tributario. En Perú "factura" = comprobante con RUC → confunde. |
| "Facturación electrónica" (comprobantes) | **"Comprobantes"** | Término paraguas que escala a Boleta/Factura/NC/ND sin renombrar. El contador entiende "comprobantes por periodo" al instante. |
| Botón "Emitir boleta" | **"Emitir comprobante"** | No asume boleta; abre la elección boleta/factura. |
| "Configuración > Datos del negocio" con RUC | RUC **fuera** de ahí | Domicilio comercial ≠ domicilio fiscal; no mezclar. |

### 6.2 Single Source of Truth del emisor (decisión clave)
**Una sola pantalla edita la identidad fiscal.** Recomendación consolidada: la identidad fiscal
(RUC, razón social, domicilio fiscal, series, ambiente, activar) vive en **una sección fiscal
única** — "Datos de facturación electrónica" — dentro de **Configuración**. En "Datos del negocio"
quedan solo los datos **comerciales** (nombre comercial, teléfono, email); **se quita el RUC**.
- Cada dato se edita en **un solo lugar** (elimina R6 y la doble validación de RUC).
- "Comprobantes" muestra el emisor en **solo lectura** con enlace *"Editar en Configuración →"*.
- Al **emitir**, el comprobante **congela** (snapshot) el emisor vigente → inmutabilidad (R7).

### 6.3 Estructura objetivo del módulo
```
SIDEBAR                          RESPONSABILIDAD
──────────────                   ─────────────────────────────────────────────
· Cuentas        (recepción)     Folio del huésped: total/pagado/saldo, PDF de la
                                 cuenta, y "Emitir comprobante" (solo si saldo=0).
· Comprobantes   (admin/contador)Historial tributario: árbol Año→Mes→Comprobantes,
                                 filtros por periodo, export CSV, PDF/(prod) XML+CDR.
· Configuración  (admin)         · Datos del negocio (comercial, SIN RUC)
                                 · Datos de facturación electrónica (fiscal = SSOT,
                                   colapsable): RUC, razón, domicilio, series,
                                   ambiente, activar.
                                 · Apariencia / Adelanto / Plan (ya existen)
```

### 6.4 Flujo de emisión correcto
```
1. CUENTA cerrada (total con consumos)
2. SALDO = 0                         ← ya validado, mantener
3. TIPO: [Boleta] | [Factura]        ← elección explícita (falta)
4a. Boleta → doc adquirente OPCIONAL (DNI/CE/Pas); si > S/700 exige doc
4b. Factura → RUC OBLIGATORIO (11 díg) + razón social del adquirente  ← bloqueante
5. DESGLOSE: base gravada + IGV 18% + total    ← calcular y guardar (falta)
6. EMITIR (sandbox hoy; OSE/PSE en prod)
7. CDR/ESTADO (sandbox: "aceptado demo"; prod: CDR real + hash XML)
8. HISTORIAL en "Comprobantes" (inmutable, PDF + prod XML/CDR)
9. CORRECCIÓN → Nota de Crédito referida al comprobante (nunca editar)
```

---

## Estado de implementación (2026-07-03)

**MVP COMPLETO e implementado** (verificado backend + preview), en 4 commits:
- **MVP-1** (`c16d648`): IGV desglosado (op_gravada/igv, base=total/1.18) + `UNIQUE(hospedaje_id,
  serie, correlativo)` + propagación de `tipo_documento`. Cierra R1, R4; prepara R2.
- **MVP-2** (`3cabf0f`): SSOT del emisor — `sunat_config` es la única fuente fiscal; Configuración
  ya no edita RUC/razón/domicilio; backfill idempotente; PDFs usan la fuente canónica. Cierra R6.
- **MVP-3** (`4261103`): rename Facturas→**Cuentas**, Facturación→**Comprobantes**, "Emitir
  comprobante", "Cuenta #id"; ids de ruta conservados. Cierra R8, R9.
- **MVP-4** (`c1f9a48`): emisor colapsable + árbol **Año→Mes→Comprobantes** con render diferido +
  totales + export CSV; badges por estado real; "Emitir" deshabilitado si el emisor no está activo.

Nota de arquitectura final: la identidad fiscal se **edita** en Comprobantes → "Datos del emisor"
(sección fiscal única) y `sunat_config` es su fuente de verdad; Configuración solo tiene datos
comerciales y remite ahí. (Variante equivalente a la §6.3; se optó por no partir el emisor entre
dos pantallas para menor fricción.) **V2/V3 siguen pendientes** (factura real, NC/ND, OSE/PSE).

## 7. Roadmap priorizado (MVP / V2 / V3)

### 🟢 MVP — corregir lo que ya existe, sin romper (bajo esfuerzo, alto impacto)
1. **SSOT del emisor:** quitar el RUC de "Datos del negocio"; la identidad fiscal se edita solo en
   "Datos de facturación electrónica" (dentro de Configuración). Eliminar/volver explícito el sync
   de una vía. *(Cierra R6.)*
2. **Renombrar navegación:** Facturas→**Cuentas**, Facturación→**Comprobantes**; botón→**"Emitir
   comprobante"**; unificar `label`↔`title`; corregir "Factura #id"→"Cuenta #id". *(Cierra R8, R9.)*
3. **`UNIQUE(hospedaje_id, serie, correlativo)`** + correlativo e INSERT en una sola transacción.
   *(Cierra R1.)*
4. **Propagar `tipo_documento`** del huésped al emitir (api.py:3297). *(Cierra R4.)*
5. **Campos de IGV** en `comprobantes` (`op_gravada`, `igv`, `total`) calculados al emitir, aunque
   siga en sandbox. *(Prepara R2, evita re-migrar.)*
6. **UX:** "Datos de facturación electrónica" colapsable (patrón acordeón de Reservas); árbol
   **Año→Mes→Comprobantes** con render diferido + totales por periodo + export CSV; deshabilitar
   "Emitir" si el emisor no está activo; emisor solo-lectura en "Comprobantes".

### 🟡 V2 — factura real + correcciones
7. Tabla **`series`** (serie+correlativo por `tipo`) → habilita **factura** (F001) además de boleta.
8. **Flujo de elección** boleta/factura con RUC obligatorio para factura (pasos 3-4b).
9. **Notas de crédito/débito** (`comprobante_ref_id`, motivo catálogo 09/10). *(Cierra R5, R3.)*
10. **Snapshot del emisor** en cada comprobante. *(Cierra R7.)*
11. Filtro por rango de fechas + export para el contador externo.

### 🔴 V3 — validez tributaria (producción)
12. Adaptador **OSE/PSE** (factory ya lista), **firma digital + XML UBL 2.1 + CDR** persistidos.
13. **Resumen diario de boletas** y **comunicación de baja**.
14. **Multi-moneda** funcional; establecimientos anexos si un RUC tiene varios locales.

**Porqué de la priorización:** el MVP no añade features tributarias nuevas; corrige los riesgos
que ya existen hoy con bajo esfuerzo y deja el esquema de IGV listo para no re-migrar. La factura
(V2) es lo primero que exige el mercado corporativo. OSE/PSE (V3) es la única fase que da validez
tributaria — y la arquitectura modular actual ya está preparada, así que no toca el resto.

---

## 8. Riesgos identificados (resumen)
| Id | Riesgo | Nivel | Se cierra en |
|---|---|---|---|
| R1 | Correlativo duplicable (sin UNIQUE) | Alto | MVP #3 |
| R2 | Sin IGV → XML rechazado en producción | Alto (prod) | MVP #5 + V3 |
| R6 | RUC divergente por sync de una vía | Alto | MVP #1 |
| R8 | "Factura #id" sobre cuenta interna confunde | Alto | MVP #2 |
| R9 | Tres pantallas solapadas / nombres homófonos | Alto | MVP #2 |
| R3 | Sin factura para huésped con RUC | Medio | V2 #7-8 |
| R4 | `tipo_documento` no propagado | Medio | MVP #4 |
| R5 | Sin NC/ND ni baja (error irreversible) | Medio | V2 #9 |
| R7 | Emisor en vivo rompe inmutabilidad del PDF | Medio | V2 #10 |

---

## 9. Responsabilidades por sección (estado objetivo)
- **Cuentas** (recepción): abrir/cerrar cuenta, cobrar, ver saldo, emitir comprobante. NO edita
  datos fiscales.
- **Comprobantes** (admin/contador): consultar el historial tributario por periodo, ver/descargar
  PDF (y en prod XML/CDR), exportar. NO edita cuentas ni emisor (solo-lectura del emisor).
- **Configuración** (admin): única fuente de verdad. Datos comerciales + datos fiscales (SSOT del
  emisor) + apariencia/adelanto/plan.

## 10. Mejoras futuras (fuera de este alcance)
Pagos online (pasarela) que emitan comprobante automático; envío del comprobante por correo/WhatsApp
al huésped; conciliación con el resumen diario; reportes tributarios (ventas por periodo para el
PDT/declaración); detracciones si aplica.

## 11. Riesgo de la propia reorganización
El renombrado de rutas (`facturas`→`cuentas`, `sunat`→`comprobantes`) puede romper enlaces
guardados/documentación interna; se mitiga manteniendo alias de ruta temporales. Mover el RUC exige
una **migración de datos** cuidadosa (consolidar el valor vigente de `hospedajes` vs `sunat_config`
antes de quitar la columna). Nada de esto se toca hasta aprobar el alcance.
