# SUNAT — Hoja de ruta a producción (facturación electrónica real)

Estado actual: el módulo emite **boletas en modo DEMO/SANDBOX** (sin valor
tributario). Es seguro y no se debe desactivar: el PDF lleva marca de agua
"DEMO / SANDBOX — sin valor tributario", la UI muestra el badge "Demo" y un
aviso. Sirve para que el dueño pruebe el flujo. La emisión REAL se conecta cuando
el hospedaje tenga RUC + cuenta en un OSE. Este documento es el plan para ese día.

## Cómo está hecho hoy (arquitectura)
- `sunat.py`: `EmisorBase` (interfaz) + `EmisorSandbox` (demo). Factory
  `obtener_emisor(config)` que **hoy siempre devuelve sandbox**.
- Tablas: `sunat_config` (ruc, razon_social, serie_boleta, correlativo, `modo`
  ['sandbox'|'produccion'], `proveedor`, `activo`) y `comprobantes` (con `modo`,
  `estado`, `hash`, `pdf_path`).
- `emitir_boleta(...)` arma el comprobante, llama al emisor del factory, genera el
  PDF (`generar_boleta_pdf`, que pinta la marca DEMO si `modo != 'produccion'`) y
  lo guarda. El correlativo avanza por hospedaje.
- Endpoints: GET/PUT `/api/sunat/config`, POST `/api/facturas/{id}/emitir`,
  GET `/api/comprobantes`, GET `/api/comprobantes/{id}/pdf`.

## Qué falta para producción (cuando haya cuenta OSE)
Recomendado: integrar un **OSE/PSE peruano que abstrae la firma y el envío a
SUNAT** (p. ej. **Nubefact**, o similar). Evita manejar certificados digitales y
el XML UBL a mano.

1. **Trámite externo (pre-requisito, toma tiempo):** tener RUC activo + afiliarse
   a un OSE (Nubefact u otro) y obtener credenciales (API token / URL).
2. **`EmisorNubefact(EmisorBase)`** en `sunat.py`: implementar `emitir(comprobante,
   config)` que: arme el payload del OSE, haga el POST autenticado, y parsee la
   respuesta (aceptado/rechazado, hash/CDR, número SUNAT, mensaje). Manejar
   errores de red/validación (devolver estado 'rechazado' + motivo).
3. **Activar el factory**: en `obtener_emisor`, devolver `EmisorNubefact(...)`
   cuando `config['proveedor']=='nubefact'` y `config['modo']=='produccion'`;
   si no, seguir con `EmisorSandbox`.
4. **Credenciales en variables de entorno** (Render), NO en la base ni en el
   código. Ej. `NUBEFACT_API_URL`, `NUBEFACT_TOKEN` (por hospedaje si aplica).
5. **UI en `ConfigSunat.jsx`**: permitir elegir modo (sandbox/producción) y
   proveedor, y capturar/validar credenciales (botón "probar conexión").
6. **Validaciones reales**: RUC válido, serie autorizada por SUNAT, documento del
   cliente correcto. Hoy la validación es básica (11 dígitos).
7. **Pruebas**: emitir en el ambiente de homologación del OSE con el RUC real,
   validar el comprobante en el portal SUNAT, y solo entonces pasar a producción.

## Mejoras recomendadas al pasar a real
- **Anulación** de comprobantes (la tabla ya contempla `estado='anulado'`; falta
  llamada al OSE + botón/endpoint).
- **Auditoría**: registrar quién emitió, cuándo y la respuesta del OSE.
- **Reintentos** ante fallos de red del OSE.
- **Branding del PDF**: usar la razón social/RUC reales de `sunat_config` también
  en la factura interna (`utils.generar_factura_pdf`, hoy con texto fijo).

## Decisión vigente (2026-06-24)
El fundador tiene RUC pero aún no tiene cuenta OSE; el trámite toma tiempo. Se
deja en **demo seguro** y se retoma esta integración cuando el resto del producto
esté listo para vender, para no quemar tiempo en trámites externos ahora.
