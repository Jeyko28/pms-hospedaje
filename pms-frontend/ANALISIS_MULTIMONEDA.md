# Análisis y arquitectura — Soporte multi-moneda (PEN / USD / …)

> Auditoría del manejo de moneda en Stanza y propuesta de arquitectura por fases para
> soportar múltiples monedas **sin grandes cambios futuros**. Documento previo a implementar;
> el alcance a construir se decide con el dueño.

## Estado de implementación (Fase 1 — HECHA)
- **Formateador central** `src/utils/moneda.js` (`MONEDAS`, `formatoMoneda`, `nfMoneda`,
  `setMonedaActual`). Codemod de **24 archivos**: cada `new Intl.NumberFormat("es-PE", …)` →
  `nfMoneda(…)` (conserva decimales/notación).
- **`hospedajes.moneda`** (migración paso 25) + selector **PEN/USD** en Configuración.
- La moneda se fija al autenticar (`AuthContext` → `setMonedaActual`) y al guardar en Config.
- El **comprobante** (y su PDF) toman la moneda del hospedaje; símbolo por moneda.
- FAQ de la landing menciona "soles o dólares" (veraz).
- Verificado E2E: cambiar a USD → montos "S/ 90.00" pasan a "$90.00"; comprobante emitido en USD;
  moneda inválida → 422. **Fases 2–3 (por transacción / conversión) siguen pendientes.**
- Follow-up menor: el PDF de la **factura interna** (`utils.py formatear_moneda`) usa "$" fijo
  (preexistente) — alinear con la moneda del hospedaje en una pasada futura.

## 1. Estado actual (auditoría)

- **Todo está clavado a soles (PEN).** El frontend repite en **~25 archivos** el mismo
  formateador `new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" })`
  (Dashboard, Reportes, Recepción, Caja, Reservas, Tarifas, Servicios, Inventario, Huéspedes,
  Facturas/Comprobantes, etc.). **No existe un formateador central** → no se puede cambiar de
  moneda en un solo lugar.
- **Backend:** los montos se guardan como `REAL` **sin moneda asociada** (reservas.total,
  facturas.total, pagos.monto, tarifas.precio, servicios.precio, inventario.costo…). La única
  columna de moneda es `comprobantes.moneda`, y está **fija en `"PEN"`** (`sunat.py`).
- **Sin tipo de cambio ni moneda por transacción.** No hay conversión, ni reportes por moneda.
- **Landing:** menciona "en soles" en varios sitios (ya se quitó del hero; quedan Precios y el
  bloque de confianza) — coherente revisarlo cuando exista multi-moneda real.

**Conclusión:** el sistema hoy asume una sola moneda implícita (PEN). El bloqueo #1 para
multi-moneda es la **ausencia de un formateador central** y de una **moneda configurable**.

## 2. Dos modelos posibles

| | **A · Moneda por hospedaje** | **B · Multi-moneda por transacción** |
|---|---|---|
| Idea | Cada hospedaje opera en UNA moneda (PEN **o** USD) | Reservas/cobros pueden ir en distintas monedas |
| Necesita conversión | No | Sí (tipo de cambio) |
| Complejidad | Baja | Alta |
| Cubre | El caso real más común (un hostal cobra en su moneda) | Turismo receptivo que cotiza en USD y cobra en S/ |
| Reportes | Directos | Consolidación en moneda base |

Para un hospedaje pequeño peruano, **A cubre la mayoría**; B es el escalón avanzado. La
arquitectura debe permitir pasar de A → B sin rehacer.

## 3. Arquitectura recomendada (por fases)

### Principios (para no rehacer al añadir monedas)
- Guardar SIEMPRE el **código ISO** de la moneda (`PEN`, `USD`, `EUR`…), **nunca el símbolo**.
- Una **tabla/config de monedas** central: `{ codigo, símbolo, locale, decimales }`. Añadir EUR
  = una fila, sin tocar lógica.
- Un **único formateador** `formatoMoneda(monto, moneda)` (frontend y backend) que toma el
  código. Prohibido volver a escribir `Intl.NumberFormat(... "PEN")` suelto.
- Los montos son números "puros"; la moneda viaja **aparte** (columna/campo), no en el string.

### Fase 1 — Moneda por hospedaje (MVP recomendado) 🟢
Base imprescindible; sin ella nada de multi-moneda es posible, y ya entrega valor.
1. **Central formatter** (frontend `src/utils/moneda.js`, backend helper): `formatoMoneda(monto,
   moneda)` con un mapa `MONEDAS`. **Refactor mecánico** de los ~25 archivos para usarlo.
2. **`moneda` en la config del hospedaje** (`hospedajes.moneda TEXT DEFAULT 'PEN'`), editable en
   Configuración. El frontend la lee (de `/api/mi-hospedaje`) y formatea TODO con ella.
3. `comprobantes.moneda` deja de estar fijo: toma la del hospedaje. UBL/SUNAT ya soporta el
   campo `moneda`.
4. Landing: "en soles" → neutral o "en tu moneda".
- **Resultado:** un hospedaje puede operar **100% en USD o en PEN**. Sin conversión, bajo riesgo.

### Fase 2 — Moneda por tarifa / reserva 🟡
1. `moneda` (+ opcional `tipo_cambio`) en `reservas`, `pagos` y `tarifas` (default = la del
   hospedaje).
2. Caja y reportes muestran **subtotales por moneda** (no se suman peras con manzanas).
3. Cada comprobante toma la moneda de su cuenta.

### Fase 3 — Conversión y consolidación 🔴
1. **Tipo de cambio** (manual o API SBS/SUNAT) con histórico por fecha.
2. Reportes **consolidados** en una moneda base elegida (con la conversión del día).
3. IGV/redondeo por moneda; multi-moneda dentro de un mismo folio si se requiere.

## 4. Impacto por área (qué toca cada fase)
- **Configuración:** Fase 1 (selector de moneda del hospedaje).
- **Tarifas / Servicios / Inventario:** F1 muestran en la moneda del hospedaje; F2 permiten moneda propia.
- **Reservas / Recepción / Caja:** F1 formatean con la moneda del hospedaje; F2 guardan moneda por operación y agrupan.
- **Reportes / Dashboard:** F1 en la moneda del hospedaje; F3 consolidan.
- **Comprobantes / SUNAT:** F1 usa la moneda del hospedaje; UBL exige el código ISO (ya existe la columna).
- **Impuestos (IGV):** el 18% aplica igual; solo cambia el símbolo y el redondeo por decimales.
- **Base de datos:** F1 añade `hospedajes.moneda`; F2 añade `moneda`(+`tipo_cambio`) a reservas/pagos/tarifas (aditivo, idempotente).

## 5. Riesgos
- **Refactor amplio (F1):** ~25 archivos tocan el formateador. Riesgo bajo (mecánico) pero hay
  que verificar que ninguno quede con el `Intl` viejo. Mitiga: util central + búsqueda global.
- **Sumar monedas distintas (F2/F3):** nunca sumar montos de distinta moneda; agrupar por código.
- **Redondeo:** definir decimales por moneda (PEN/USD = 2) en el mapa central.
- **SUNAT:** el comprobante debe declarar su moneda real; no emitir en PEN algo cobrado en USD.

## 6. Recomendación
Implementar **Fase 1 ahora**: es la base (hoy imposible sin el formateador central) y ya permite
operar un hospedaje en dólares. Fases 2–3 quedan diseñadas para añadirse sin rehacer. La landing
(#6 pide mencionar USD) se puede ajustar en F1 con honestidad ("soles o dólares" solo cuando F1
esté activo).
