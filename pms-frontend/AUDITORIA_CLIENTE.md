# Auditoría "Cliente Crítico" — Vantry (2026-07-03)

> Simulación de un **dueño de hostal (15 hab, provincia, hoy usa Excel + cuaderno + WhatsApp)**
> evaluando si pagaría el SaaS. Ejecutada con el subagente `cliente-critico`, que además revisó
> el código real. Documento para accionar; las decisiones estratégicas quedan para el dueño.

## Veredicto: **"Lo evaluaría — no lo compro hoy."** Interés medio-alto.
Se registraría a la prueba, cargaría sus habitaciones, probaría la **caja por turno** y pondría
el link en su Instagram. Si el link le trae 1 reserva real y la caja le cuadra → **paga el S/99
fundador sin pensarlo.** Si no → se queda en Excel.

## Lo que le gustó (real, verificado en código)
- **Caja por turno + arqueo firmado = la joya.** Le resuelve un dolor de plata real (turnos que
  no cuadran). "El que programó esto entiende un hostal de verdad." Por esto casi paga.
- **Link de reservas sin comisión** = el único ROI que lo mueve (hoy pierde ~15% con Booking).
- **En soles, Yape/transferencia, activación humana** = confianza de "ser de la zona".
- **Inventario que descuenta stock al vender** = útil, hoy se le pierde en el cuaderno.

## Objeciones críticas (lo que lo frena)
1. **El "motor de reservas" NO cobra: es un formulario de SOLICITUD.** El huésped no paga; el
   dueño confirma y cobra por Yape igual que hoy. "No es reservas directas de verdad."
2. **Boleta SUNAT en modo demo/sandbox "sin valor tributario"** → la landing lo vende como
   listo. Lo siente medio engañoso; no reemplaza su facturador.
3. **Sin Channel Manager (Booking/Airbnb)** → doble digitación = MÁS trabajo. Bloqueador #1 de
   adopción (no va a dejar Booking).
4. **Riesgo "proyecto de una persona":** cobro/activación manual + sin testimonios + SUNAT no
   listo. "Confío toda mi operación a algo que puede desaparecer en un año."
5. **Precio Fundador S/99 escondido como easter egg** → *"le están escondiendo su mejor
   argumento de cierre justo a la gente sensible al precio."* Lo considera un error de negocio.
6. **Onboarding/migración solo en el plan Pro (S/239)** → el cliente chico (el target) es el que
   más necesita que le migren el Excel, y se lo cobran caro.

## Preguntas reales que haría
1. ¿Puedo pedir adelanto por Yape dentro del link para que la reserva no se caiga?
2. ¿Cuándo estará SUNAT de verdad?
3. Sin Channel Manager, ¿cómo evito sobrevender entre Booking y mi link?
4. Si me atraso un mes en el Yape de la suscripción, ¿me cortan? ¿pierdo mis datos?
5. ¿Cuántos hospedajes lo usan HOY? (no vio ni un testimonio)
6. Si Vantry cierra, ¿cómo exporto mis reservas y huéspedes?
7. ¿Quién nos capacita? "5 minutos" suena optimista.

## 🟢 Lo que lo haría comprar YA (acciones)
1. **Sacar el Precio Fundador del escondite** (que el vendedor lo ofrezca de frente).
2. **Que el link pida un adelanto por Yape** (aunque sea 1 noche) → convierte "solicitud" en
   "reserva real". Es el ROI que de verdad mueve.
3. **Prueba social:** 2-3 testimonios reales con nombre/foto (sin inventar).
4. **Honestidad en la landing** sobre SUNAT y el motor ("boletas listas para cuando conectes
   SUNAT"; describir el link como recepción de solicitudes directas).
5. **Poner la caja por turno como protagonista de la venta** ("nunca más te descuadra la caja").

## 🔴 Lo que lo frena (bloqueadores)
1. Sin Channel Manager (doble digitación). 2. SUNAT en sandbox. 3. Reservas que no cobran.
4. Riesgo de continuidad (una persona, sin respaldo/exportación garantizada). 5. Migración solo
   en Pro.

## Frase resumen del auditor
> "Tienen una excelente herramienta de OPERACIÓN diaria (caja, inventario, calendario)
> disfrazada de 'motor de reservas + facturación' que todavía no cumple esas dos promesas.
> Vendan lo que SÍ funciona, cobren S/99 de frente, conecten Booking y SUNAT, y me tienen."

## Archivos que el auditor revisó
- `src/publico/ReservaPublica.jsx` — motor = solicitud, no cobra; éxito dice "El hospedaje confirmará tu reserva".
- `src/pages/sunat/ConfigSunat.jsx` — aviso "Modo demo (sandbox), sin valor tributario".
- `src/publico/sitio/Precios.jsx` + `founder.js` — Precio Fundador S/99 oculto como easter egg.
- `src/pages/recepcion/CajaDia.jsx` — la joya: arqueo por turno.
- `src/pages/facturas/Facturas.jsx` — emisión de boleta dependiente de SUNAT.

## Acciones tomadas tras la auditoría
- **Honestidad en la landing (hecho):** copy de "Boleta electrónica" ajustado para no implicar
  validez SUNAT ya operativa (SUNAT "en camino"). Quick-win de integridad.
- **Decisiones del dueño (recomendadas, no ejecutadas):** visibilidad del Precio Fundador
  (contradice el "easter egg" aprobado antes → lo decide el dueño); adelanto en el link;
  testimonios reales; Channel Manager y SUNAT prod (hitos mayores del roadmap).
