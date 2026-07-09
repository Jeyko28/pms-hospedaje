# Pasarelas de pago — Propuesta y arquitectura (Vantry PMS)

> Documento de **decisión + arquitectura** (#8). NO es implementación: define qué
> proveedor, cómo encaja en el código actual y qué se necesita, para que cuando la
> cuenta de comercio esté lista (DNI actualizado) la integración sea rápida.
> **Estado:** propuesta. **Bloqueante para producción:** DNI del titular (KYC).

---

## 1. Problema y alcance

En Vantry hay **dos flujos de dinero distintos**, y hoy **ambos son manuales**:

| Flujo | Quién paga → a quién | Hoy | Oportunidad |
|---|---|---|---|
| **A. Reserva del huésped** | Huésped → Hospedaje | Adelanto por **Yape/transferencia**, el huésped pega el código de operación y el hospedaje lo **verifica a mano** | Pago **online con tarjeta/Yape** que **auto-confirma** la reserva |
| **B. Suscripción SaaS** | Hospedaje → **Vantry** | **Opción B manual**: el superadmin registra el pago y activa la cuenta | **Cobro recurrente automático** |

**Prioridad recomendada: A (reserva del huésped)** — es valor directo para el cliente
(menos fricción, menos "chamba" de verificar Yapes) y diferenciador de venta. B (automatizar
la suscripción) es interno de Vantry y puede ir después.

> ⚠️ **Dato clave (merchant of record):** en A, el dinero va **a la cuenta del hospedaje**
> (su KYC, no el tuyo). En B, el dinero va **a la cuenta de Vantry** (tu KYC → **aquí sí pesa
> tu DNI**). Es decir: el cobro de reservas depende de la cuenta de cada hospedaje; la
> suscripción depende de tu cuenta.

---

## 2. La realidad **USD vs soles** en Perú (importante)

- Las pasarelas **locales** (Mercado Pago Perú, Culqi, Izipay) **liquidan en SOLES (PEN)**.
  Aunque el huésped pague con una tarjeta extranjera, **el cargo se procesa en PEN** y el banco
  emisor del huésped hace la conversión a su moneda. Tú recibes **soles**.
- Cobrar la tarjeta **explícitamente en USD** (y recibir USD) requiere un proveedor
  **internacional**: **PayPal** (práctico en Perú, comisión alta) o Stripe/dLocal
  (Stripe no es directo para entidades peruanas). Más requisitos y más comisión.

**Recomendación:** mantener lo que ya construimos → **precio en PEN + equivalente USD
referencial**. El cobro real, en soles, por pasarela local. Para el **turista internacional**
que insista en pagar en dólares, ofrecer **PayPal** como opción secundaria (Fase 3). El
"monitoreo del efectivo USD que entra a caja" queda como **idea futura**, fuera de este alcance.

---

## 3. Comparativa de proveedores

> Comisiones **aproximadas** (2026) — **verificar** al momento de contratar; cambian y bajan
> por volumen. Todas suman **IGV (18%)** sobre la comisión.

| Proveedor | Métodos | Moneda | Comisión aprox. | Requisitos | Checkout | Notas |
|---|---|---|---|---|---|---|
| **Mercado Pago** ⭐ | Tarjetas, **Yape**, PagoEfectivo, cuotas | PEN | ~3.5–4% + IGV | DNI + (RUC recom.) + cuenta banco | **Checkout Pro (hospedado)** | Mejor docs/API, marketplace/split, muy usado |
| **Culqi** | Tarjetas, Yape | PEN | ~3.4–4% + IGV | RUC/empresa usual | Culqi Checkout / API | Peruano, sólido |
| **Izipay / Niubiz** | Tarjetas | PEN | Negociable (volumen) | Onboarding más pesado | API / redirect | Bancario; mejor a escala |
| **PayPal** | Tarjetas internacionales | **USD** | ~5.4% + fijo (cross-border) | Cuenta PayPal | Botón/redirect | Para el **turista**; retiro a Perú costoso |
| ~~Stripe~~ | — | — | — | — | — | No directo para entidades peruanas |

---

## 4. Recomendación

- **MVP → Mercado Pago (Checkout Pro / hospedado).** Razones: acepta **tarjetas + Yape** (lo que
  ya usan los huéspedes), **checkout hospedado** (no tocamos datos de tarjeta → mínima carga PCI),
  **webhooks** y **modo sandbox** para construir sin cuenta real, soporta **marketplace/split**
  (cada hospedaje cobra a su propia cuenta), y es el de mejor documentación.
- **PayPal → opción secundaria (Fase 3)** para el huésped internacional que quiera pagar en USD.
- **Diseño desacoplado** para poder sumar Culqi/Izipay después sin reescribir (ver §5).

---

## 5. Arquitectura (espejo del patrón que ya usamos)

Reutilizamos el **patrón adaptador** que ya funciona en `pms_hospedaje/sunat.py`
(`EmisorBase` → `EmisorSandbox` → `obtener_emisor(config)`, líneas 241-283) y en
`tipo_cambio.py` / `correo.py`. El proveedor es **intercambiable** sin tocar el resto.

```
pms_hospedaje/pasarela.py  (NUEVO)
  class PasarelaBase:
      crear_pago(monto, moneda, referencia, retorno_urls) -> {id, url_checkout}
      verificar_webhook(headers, body) -> {valido, external_id, estado, monto}
      consultar_estado(external_id) -> estado
  class PasarelaSandbox(PasarelaBase)     # simulada, para desarrollo sin cuenta
  class PasarelaMercadoPago(PasarelaBase) # real (Checkout Pro + webhooks)
  def obtener_pasarela(config)            # factory por hospedaje
```

**Principios:**
- **Config por hospedaje** (tabla `pasarela_config`, como `sunat_config`): proveedor,
  credenciales/OAuth, `modo` (sandbox|produccion), `activo`.
- **Checkout hospedado** (redirección a MP) → **nunca almacenamos tarjetas** (PCI SAQ-A).
- **Webhook firmado** (endpoint público) que **verifica la firma** y es **idempotente** por
  `external_id` (evita doble procesamiento si MP reintenta).
- **Estados de pago** explícitos: `pendiente → aprobado | rechazado | reembolsado`.

---

## 6. Puntos de integración (con el código real)

### A. Reserva del huésped (prioritario)
Hoy, al reservar en el motor público se calcula el adelanto y se guarda
`reservas.adelanto_monto / adelanto_codigo / adelanto_estado='por_verificar'`
(`_calcular_adelanto`, api.py ~1614-1644) y el hospedaje lo confirma con
`POST /api/reservas/{id}/adelanto` (`verificar_adelanto`, api.py:2400).

**Flujo online propuesto (coexiste con Yape como fallback):**
1. El huésped elige "Pagar adelanto con tarjeta/Yape" → backend `crear_pago(adelanto)` →
   devuelve URL de Checkout Pro.
2. El huésped paga en MP (hospedado).
3. MP llama al **webhook** → verificamos firma → marcamos `adelanto_estado='verificado'`
   **automáticamente** y confirmamos la reserva (sin intervención del hospedaje).
4. Yape manual sigue disponible para quien prefiera.

### B. Cobro en recepción
`registrar_pago` / `PagoNuevo` (api.py:264) — opción futura "enviar **link de pago**" al huésped
(mismo `crear_pago`, referencia = factura/estancia).

### C. Suscripción SaaS (Vantry)
`registrar_pago_suscripcion` / tabla `pagos_suscripcion` (api.py:1219), hoy manual (Opción B).
Automatizable con **preferencia/pre-aprobación** de MP → webhook → **activación automática** del
hospedaje (reutiliza la lógica de activar/extender que ya existe).

---

## 7. Seguridad / PCI
- **Checkout hospedado** → no tocamos ni guardamos datos de tarjeta (cumplimiento mínimo SAQ-A).
- **Webhook con verificación de firma** + **idempotencia** por `external_id`.
- **Credenciales por config** (por hospedaje / de Vantry), fuera del código — igual que `SMTP_*`
  y la config SUNAT. Nunca en el repo.
- **Conciliación**: registrar el `external_id` y el payload para poder auditar y re-procesar.

---

## 8. Impacto estimado (BD / API / frontend)

**BD (migración aditiva, idempotente):**
- `pasarela_config` (por hospedaje): `hospedaje_id, proveedor, modo, activo, credenciales…`.
- `pagos_online` (intentos): `id, hospedaje_id, tipo(reserva|suscripcion), referencia_id,
  proveedor, monto, moneda, estado, external_id, payload, creado_en`. El pago **confirmado** sigue
  aterrizando en las tablas actuales (`pagos` / `pagos_suscripcion`).

**API:**
- `POST /api/pagos/checkout` (crear preferencia; reserva o suscripción).
- `POST /api/pagos/webhook/{proveedor}` (público, firma verificada, idempotente).
- `GET /api/pagos/{id}/estado`.

**Frontend:**
- Motor público de reservas (`ReservaPublica.jsx`): botón "Pagar adelanto online" + páginas de
  retorno éxito/fallo.
- Configuración: sección "Pagos online" (conectar cuenta / credenciales, modo sandbox|prod).

---

## 9. Plan por fases

| Fase | Qué | ¿Necesita DNI? |
|---|---|---|
| **0** | Este documento | No |
| **1 — Sandbox** | `pasarela.py` (Base/Sandbox/MercadoPago) + `pasarela_config` + webhook + flujo de adelanto online, probado con **credenciales de prueba de MP** | **No** |
| **2 — Piloto** | Cuenta real: cada hospedaje conecta la suya (guest→hospedaje); Vantry conecta la suya para la suscripción | **Sí** (tu DNI para la cuenta de Vantry) |
| **3 — Extras** | Suscripción automática (recurrente), **PayPal USD** para turistas, split/marketplace | Sí |

**Se puede avanzar la Fase 1 completa sin DNI** (todo en sandbox). Es el siguiente paso natural
cuando quieras dejar el "enchufe" listo.

---

## 10. Requisitos para producción (para cuando actualices el DNI)
- **Tu DNI vigente** (KYC de la cuenta de Vantry → cobro de suscripción).
- **RUC** (ya lo tienes) + **cuenta bancaria** para los retiros.
- **Cuenta de comercio verificada** en Mercado Pago (y credenciales de producción).
- Cada **hospedaje cliente**: su propia cuenta MP (su KYC) para cobrar sus reservas.

---

## 11. Limitaciones y riesgos
- **Comisión ~3.5–4% + IGV** por transacción → **come margen**, sobre todo en el adelanto.
  Decisión de negocio: absorberla o trasladarla al huésped.
- **USD real limitado**: cobro en dólares práctico solo vía PayPal (comisión alta, retiro costoso).
- **Dependencia de KYC**: sin cuenta verificada no hay cobro real (de ahí el bloqueo por DNI).
- **Webhooks**: exigen idempotencia y conciliación; si se procesan dos veces, doble confirmación.
- **Churn en suscripción**: si la tarjeta del hospedaje falla, hay que reintentar/avisar.
- **Adopción**: pedir a cada hospedaje que conecte su cuenta MP añade fricción de onboarding
  (mitigable con OAuth "conectar en 1 clic").

---

## 12. Próximo paso sugerido
Cuando quieras: **Fase 1 en sandbox** (adaptador `pasarela.py` + Mercado Pago de prueba + flujo de
adelanto online), 100% sin DNI, para dejar todo listo y solo "enchufar" credenciales reales cuando
tu cuenta esté verificada.
