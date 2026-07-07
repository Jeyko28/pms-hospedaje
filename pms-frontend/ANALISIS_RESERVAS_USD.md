# Reservas y pagos internacionales — hospedaje en PEN, huésped paga en USD

> Análisis + arquitectura + implementación (multi-moneda Fase 2a). El hospedaje
> administra su negocio en su **moneda base** (PEN); el USD es una conveniencia de
> **presentación** (link público) y de **liquidación** (efectivo). No hay pasarela
> de pago online, así que el USD "online" es **referencial** y el cobro USD real
> ocurre en recepción (efectivo) o por depósito manual.

## Problema
Muchos huéspedes extranjeros solo tienen dólares. El sistema debe ayudarlos a
entender el precio y permitir cobrar en USD **sin romper** la contabilidad (que
sigue en la moneda base) y de forma **escalable** (no atado a PEN/USD).

## Alternativas evaluadas
- **Mostrar solo PEN** — simple pero mala UX para el extranjero. Descartado.
- **Mostrar PEN + equivalente USD referencial** — mejor UX, sin comprometer la
  contabilidad. **Elegido.**
- **Tipo de cambio manual / automático / híbrido** — se eligió **automático (API
  oficial) con caché + respaldo + margen opcional** del hospedaje.
- **Convertir la contabilidad a USD por transacción** — innecesario y frágil sin
  pasarela; se prefiere guardar el monto base + la divisa recibida + el tipo usado.

## Solución elegida
1. **Moneda base = la del hospedaje.** Precios, facturas, saldos y consolidación
   quedan en base. El USD nunca reemplaza la contabilidad.
2. **Tipo de cambio automático** (proveedor global, cacheado, con respaldo) +
   **margen %** opcional del hospedaje. `tasa` = unidades de base por 1 USD (≈3.75).
3. **Momento de conversión:** display = al renderizar (referencial); **vinculante =
   al liquidar** (cobro): se congela y guarda el tipo usado.
4. **Tarjeta en USD:** la conversión la hace el **banco del huésped**; el sistema
   registra en base (no hace FX de tarjeta).
5. **Efectivo en USD:** el sistema calcula equivalencia + **vuelto** y **audita**
   moneda recibida, monto recibido y tipo de cambio.

## Justificación
- **Técnica:** guardar el monto base garantiza que los reportes cuadren en una sola
  moneda; guardar (moneda_recibida, monto_recibido, tipo_cambio) da trazabilidad
  fiscal/contable sin ambigüedad. El proveedor de tasa es un adaptador → swappable.
- **UX:** el huésped ve el precio real (PEN) y una referencia clara en USD; en el
  cobro, recepción ve equivalencia y vuelto sin calcular a mano.

## Arquitectura
- **`tipo_cambio.py`** (backend): `tasa(base, moneda)` / `tasa_efectiva(...)` con
  caché en `tipos_cambio`, TTL, refresco perezoso y respaldo al último valor/default.
- **Códigos ISO** siempre (PEN/USD/…); añadir EUR/CLP = configurar el proveedor.
- **`utils/moneda.js`** (frontend): `MONEDAS`, `formatoMoneda`, `convertirDesdeBase/ABase`.

## Impacto
### Base de datos (migraciones aditivas, idempotentes)
- `tipos_cambio` (caché global): moneda_base, moneda, tasa, fuente, actualizado_en.
- `hospedajes`: `monedas_aceptadas` (CSV ISO), `margen_cambio` (%).
- `pagos`: `moneda_recibida`, `monto_recibido`, `tipo_cambio` (base ⇒ '', igual monto, 1).

### API
- `GET /api/tipo-cambio?moneda=USD` → tasa efectiva del hospedaje.
- `mi-hospedaje`: guarda/lee monedas aceptadas + margen.
- `hospedaje_publico`: expone base + USD referencial (tasa efectiva).
- `PagoNuevo`/`registrar_pago`: aceptan y guardan los campos de moneda recibida.
- Caja (`/api/recepcion/caja`): añade `por_moneda` (divisa recibida) sin alterar el
  consolidado en base.
- `auth.publico`: expone `moneda` + `monedas_aceptadas` al usuario (para recepción).

### Frontend
- **Configuración:** activar USD referencial + margen + tipo vigente.
- **Link público:** "S/ 180 ≈ US$ 49 (referencial)" (formatea en la moneda base).
- **Cobro en recepción:** toggle de moneda recibida (S/ / US$); en USD muestra el
  tipo (auto, ajustable), equivalencia, dólares recibidos y **vuelto**; audita.
- **Caja:** desglose "Recibido en dólares: US$ X (= S/ Y)".

## Cambios implementados
2a-A (tasa + config + link público) · 2a-B (cobro efectivo USD + auditoría) ·
2a-C (caja por moneda + esta documentación). Todo aditivo y compatible: sin
`monedas_aceptadas` el sistema se comporta como antes (solo base).

## Limitaciones actuales
- **Sin pasarela de pago online:** el USD del link es **referencial**; no hay cobro
  online en USD. El cobro USD real es en efectivo/recepción.
- **Tarjeta:** el FX lo hace el banco del huésped (el sistema registra en base).
- **Comprobante:** se emite en la moneda base del hospedaje (Fase 1). Un comprobante
  en USD con tipo SUNAT es parte de la evolución.

## Plan de evolución
- Pasarela de pagos (Culqi/MP/Stripe) con **cobro real en USD** y conciliación.
- Más monedas (EUR/CLP/COP/MXN/BRL) — solo configurar el proveedor de tasa.
- Tipo de cambio **SUNAT** para comprobantes; histórico de tasas por fecha.
- Reportes: filtro por moneda recibida + exportación para el contador.
