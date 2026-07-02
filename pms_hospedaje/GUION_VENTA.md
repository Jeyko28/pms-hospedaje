# Guion de venta — Stanza (PMS para hospedajes)

> Documento operativo (2026-07-01). Para vender Stanza a hospedajes pequeños/medianos
> del Perú (5–40 habitaciones) que hoy usan Excel, cuaderno o WhatsApp.
> Complementa `ANALISIS_COMPETITIVO.md`. Posicionamiento base:
> **"El PMS simple y en soles para el hospedaje peruano. Tan fácil que lo usas el
> primer día; tan completo que dejas el cuaderno para siempre."**

---

## 0. A quién le vendemos (y a quién no)

**Cliente ideal:** dueño/a o recepción de hostal, hotel pequeño, B&B, casa de playa o
apart 5–40 habitaciones, que lleva reservas en cuaderno/Excel/WhatsApp, pierde tiempo y
a veces sobrevende. Sensible al precio, sin equipo técnico, ya usa Yape.

**NO es cliente:** cadenas grandes, hoteles 80+ hab con channel manager, quien ya paga
Cloudbeds feliz. No perder tiempo ahí.

---

## 1. Pitch de 30 segundos (ascensor)

> "Stanza es un sistema simple, en soles, para manejar tu hospedaje: reservas,
> calendario, check-in y boletas en un solo lugar. Además te damos **tu propia página
> de reservas** para que recibas reservas directas por WhatsApp o Instagram **sin pagar
> la comisión de Booking**. Cuesta desde S/79 al mes y lo pruebas gratis 14 días."

## 2. Pitch de 2 minutos (con dolor → solución)

1. **El dolor:** "¿Hoy cómo llevas tus reservas? ¿Cuaderno, Excel, WhatsApp? ¿Te ha
   pasado vender dos veces la misma habitación, o perder una reserva por no anotarla?"
2. **El costo oculto:** "Y cuando llega una reserva por Booking, te descuentan 15–18%.
   En una habitación de S/100 la noche, regalas S/15–18 cada vez."
3. **La solución:** "Stanza junta todo: calendario visual para no sobrevender, check-in
   y cobros en segundos, boleta electrónica, y **tu propio link de reservas** que
   compartes en tus redes — el huésped reserva solo y tú **no pagas comisión**."
4. **La facilidad:** "Está pensado para que lo entiendas el primer día, desde el celular
   o la compu, sin instalar nada. Y si necesitas ayuda, nos escribes por WhatsApp."
5. **El cierre suave:** "Te doy 14 días gratis para que lo pruebes con tu hospedaje
   real. Si te sirve, quedas; si no, no pagas nada. ¿Lo activamos?"

---

## 3. Demo en vivo (orden recomendado, 5–7 min)

Mostrar VALOR rápido, no funciones. Secuencia:
1. **Link público de reservas** — "Este sería tu link. El huésped elige fechas, ve
   disponibilidad y reserva. Cero comisión." (Mostrar `#/reservar/<slug>`.)
2. **Calendario** — "Aquí ves todas tus habitaciones y fechas; imposible sobrevender."
3. **Check-in / cobro** — "Llega el huésped, un clic, cobras con Yape y listo."
4. **Boleta** — "Emites tu comprobante desde el mismo sistema."
5. **Reportes** — "Y sabes cuánto vendiste y de dónde vinieron tus reservas."
Cerrar la demo volviendo al dolor: "Todo esto que hoy haces en el cuaderno, aquí es un clic."

---

## 4. Manejo de objeciones

**"Está caro / no me alcanza."**
> "Piénsalo así: con **una sola reserva directa** por tu link te ahorras la comisión de
> Booking, que en pocas noches ya paga el mes. Además tienes 14 días gratis para
> comprobar que te sirve antes de pagar un sol. Y si eres de los primeros, te dejo el
> **precio fundador de S/99 al mes de por vida**."

**"Ya uso Excel / WhatsApp y me funciona."**
> "Perfecto que tengas orden. La diferencia es que Excel no evita la sobreventa, no te
> da un link de reservas, no emite boleta ni te dice cuánto ganaste. Stanza hace todo
> eso solo. No reemplazas tu esfuerzo: lo automatizas."

**"No tengo tiempo de aprender un sistema nuevo."**
> "Por eso lo hicimos simple a propósito. La mayoría lo entiende el primer día. Yo te
> hago la configuración inicial contigo por WhatsApp y cargamos tus habitaciones juntos.
> No te dejo solo."

**"¿Y si se cae internet o pierdo mis datos?"**
> "Tus datos están en la nube, guardados y respaldados, no en una laptop que se puede
> malograr. Entras desde cualquier dispositivo. Es más seguro que el cuaderno."

**"Booking igual me trae clientes, ¿para qué otra web?"**
> "No te pedimos dejar Booking. Stanza es para que las reservas que YA llegan por tu
> WhatsApp o Instagram las cobres **sin comisión**, con tu propio link. Lo que hoy
> anotas a mano, ahí entra solo. Booking para captar, Stanza para lo directo."

**"Déjame pensarlo."**
> "Claro. Para pensarlo mejor, actívalo gratis 14 días sin tarjeta y lo pruebas con tus
> reservas reales. Pensar sin probar no ayuda; probando decides con datos. ¿Te lo dejo listo hoy?"

**"¿Emite comprobantes válidos para SUNAT?"**
> "Emite boletas y llevas tu facturación ordenada. La conexión directa a SUNAT en
> producción está en camino; hoy ya te ordena y te deja listo para ese paso." (Ser honesto.)

---

## 5. Oferta fundador (palanca de cierre)

- **Los primeros 10 hospedajes pagan S/99/mes de por vida**, en cualquier plan.
- El precio **no sube** aunque crezcamos. Es un "gracias" por confiar temprano.
- Comunicar escasez real: "Quedan pocos cupos fundador."
- Al cerrar: marcar la casilla **"Precio fundador"** al registrar el pago (guarda el
  `precio_pactado`).

---

## 6. Cierre + cobro (paso a paso)

1. **Acuerdo:** confirma plan (Inicia/Crece/Pro) y periodo (mensual o **anual = 2 meses
   gratis**, mejor para la caja y contra el churn).
2. **Cobro:** el cliente paga por **Yape o transferencia** al número/cuenta del negocio.
   Pide captura o número de operación.
3. **Activación (automática):** en el panel **super-admin → Hospedajes**, en la tarjeta
   del cliente, botón **"Registrar pago"** → elige plan, periodo, método, monto (o marca
   "Precio fundador"), agrega la nota con el N° de operación y **Registrar pago y activar**.
   → El sistema **activa al cliente y le extiende el vencimiento automáticamente**
   (+30 días mensual / +365 anual, acumulando si aún no vencía).
4. **Confirmación:** avisa al cliente por WhatsApp que ya está activo y hasta qué fecha.
5. **Onboarding:** agenda 15 min para cargar habitaciones y su link. El cliente que
   arranca bien, se queda.

---

## 7. Seguimiento (para que no se enfríe)

- **Día 1 de prueba:** "¿Pudiste entrar? ¿Te ayudo a cargar tus habitaciones?"
- **Día 7:** "¿Cómo te está yendo? ¿Alguna duda?" (mostrar una función que no vio).
- **Día 12–13:** "Tu prueba termina en 2 días. ¿Lo dejamos activo con el precio fundador?"
- **Anual > mensual:** siempre ofrecer el anual (2 meses gratis) como defensa anti-churn.

---

## 8. Precios de referencia (resumen)

| Plan | Habitaciones | Mensual | Anual (2 meses gratis) |
|---|---|---|---|
| Inicia | hasta 8 | S/79 | S/790 |
| Crece ⭐ | hasta 20 | S/139 | S/1,390 |
| Pro | 40+ / multipropiedad | S/239 | S/2,390 |
| **Fundador** | cualquiera (primeros 10) | **S/99 vitalicio** | S/990 |

> Nunca cobrar comisión por reserva en el link público: es nuestra bandera
> ("escapa del 15% de Booking"). Débito automático (Culqi/MP) recién a ~30 clientes.
