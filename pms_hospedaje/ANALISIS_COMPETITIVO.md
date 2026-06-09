# Análisis competitivo — PMS Hospedaje vs. Cloudbeds / Little Hotelier / HQBeds

> Documento estratégico (2026-06-08). Objetivo: entender el mercado real,
> dónde estamos parados y QUÉ construir para competir en el nicho correcto.

---

## 1. Los competidores (qué son realmente)

| | **Cloudbeds** | **Little Hotelier** | **HQBeds** |
|---|---|---|---|
| Escala | Gigante global, 150+ países | Global (de SiteMinder) | LatAm / **Perú** |
| Antigüedad | 10+ años | 10+ años | 9 años |
| Tamaño cliente | Hoteles indep., grupos, hostales, B&B | Pequeños-medianos | **Hostales y hoteles pequeños** |
| Tracción | Millones de reservas | 140+ países | 600+ propiedades, 25k reservas/mes |

**Conclusión clave:** Cloudbeds y Little Hotelier son "gigantes globales".
**HQBeds es tu competidor DIRECTO** — mismo país, mismo nicho, mismas
integraciones locales (SUNAT, Mercado Pago, Mincetur). A ese hay que estudiarlo
de cerca; a los otros dos, aprenderles pero no imitarlos.

---

## 2. Funcionalidades: ellos vs. nosotros

| Funcionalidad | Cloudbeds | Little Hotelier | HQBeds | **Nosotros (hoy)** |
|---|:---:|:---:|:---:|:---:|
| PMS core (reservas, check-in/out) | ✅ | ✅ | ✅ | ✅ |
| Multi-propiedad / multi-tenant | ✅ | ✅ | ✅ | ✅ |
| Facturación | ✅ | ✅ | ✅ SUNAT | ✅ PDF (no SUNAT aún) |
| Reportes / ocupación | ✅ | ✅ | ✅ | ✅ |
| Pagos parciales / Yape-Plin | parcial | parcial | ✅ | ✅ |
| **Channel Manager** (Booking/Airbnb/Expedia) | ✅ 300+ | ✅ 450+ | ✅ | ❌ |
| **Motor de reservas** (web directa) | ✅ | ✅ | ✅ | ❌ |
| **Pagos online** (tarjeta) | ✅ | ✅ | ✅ Mercado Pago | ❌ |
| **Calendario timeline** (arrastrar) | ✅ | ✅ | ✅ | ❌ |
| Tarifas dinámicas / revenue | ✅ IA | ✅ IA | parcial | ❌ |
| Check-in online | ✅ | — | ✅ | ❌ |
| POS (bar/restaurante) | — | — | ✅ | ❌ |
| Integración SUNAT (Perú) | ❌ | ❌ | ✅ | ❌ |
| Integración Mincetur | ❌ | ❌ | ✅ | ❌ |
| WhatsApp (cobros/mensajes) | — | — | ✅ | ❌ |
| App móvil nativa | — | ✅ | — | ❌ (web responsive sí) |
| Precio | a medida (caro) | no público | no público | **define-able barato** |

**Lectura:** tenemos el **core sólido**. El gap está en **distribución**
(channel manager + motor de reservas), **pagos online** y **lo local peruano**
(SUNAT, Mincetur, WhatsApp).

---

## 3. La oportunidad (dónde ganar)

No competir donde los gigantes son fuertes. Atacar lo que descuidan:

### Nuestra ventaja diferencial
1. 🇵🇪 **Hiper-local Perú/LatAm:** SUNAT, Yape/Plin (ya), Mincetur, soporte español, precios en soles.
2. 💵 **Precio accesible:** S/49-99/mes vs. tarifas USD de los globales.
3. ✨ **Simplicidad radical:** "PMS que se entiende en 10 minutos". Cloudbeds es potente pero abrumador.
4. 🎯 **Nicho ignorado:** hostales/B&B/casas de 5-20 habitaciones que hoy usan Excel o cuaderno porque Cloudbeds les queda grande/caro.

### El competidor a vencer: HQBeds
HQBeds ya hace bien lo "local". Para superarlo: **mejor UX, más simple, más
barato, mejor onboarding**. Nuestra carta fuerte es la experiencia de usuario
(que venimos cuidando con criterio senior) — su web sugiere un producto potente
pero más orientado a quien ya sabe de hotelería.

### Posicionamiento propuesto
> *"El PMS simple y en soles para el hospedaje peruano pequeño. Tan fácil que
> lo usas el primer día; tan completo que dejas el cuaderno para siempre."*

---

## 4. Qué NO hacer (foco)
- ❌ No intentar igualar a Cloudbeds feature-por-feature (perderíamos).
- ❌ No apuntar a hoteles grandes/cadenas (no es nuestro cliente).
- ❌ No construir IA de revenue ahora (sobreingeniería sin clientes).
- ❌ No Channel Manager todavía (lo más complejo; requiere convenios/APIs y certificación).

---

## 5. Roadmap competitivo (orden recomendado por impacto/esfuerzo)

| # | Feature | Impacto comercial | Esfuerzo | Notas |
|---|---|:---:|:---:|---|
| **1** | **Motor de reservas público** (web por hospedaje, sin comisión) | 🔴 Muy alto | 🟠 Medio | Lo más vendible. "Tu página de reservas propia, sin pagar 15% a Booking" |
| **2** | **Calendario timeline** (habitación×fecha, arrastrar) | 🟠 Alto | 🟠 Medio | "La cara" de un PMS pro; sube percepción de valor |
| **3** | **Pagos online** (Culqi / Mercado Pago) | 🔴 Alto | 🟠 Medio | Cierra reserva→cobro; habilita cobrar suscripciones del SaaS |
| **4** | **Facturación SUNAT** | 🟠 Alto (Perú) | 🔴 Alto | Diferenciador legal local; requiere proveedor OSE/PSE |
| **5** | **Onboarding self-service + trial** | 🟠 Alto | 🟢 Bajo | Que clientes se registren solos (ya estaba en plan SaaS 4.3) |
| **6** | **WhatsApp** (confirmaciones/cobros) | 🟡 Medio | 🟠 Medio | Muy usado en LatAm |
| **7** | **Channel Manager** (Booking/Airbnb) | 🔴 Muy alto | 🔴 Muy alto | El más difícil; a largo plazo, cuando haya tracción/caja |

---

## 6. Recomendación de secuencia realista

**Fase A — Cerrar el SaaS (casi listo):** terminar Super Admin + Onboarding/trial (4.3). Con esto ya puedes VENDER y dar de alta clientes.

**Fase B — Diferenciador vendible:** Motor de reservas (#1) + Pagos online (#3). Esto es lo que hace que un hospedaje diga "lo quiero": su propia web de reservas que cobra con tarjeta sin comisión.

**Fase C — Percepción pro:** Calendario timeline (#2) + Facturación SUNAT (#4).

**Fase D — A largo plazo:** Channel Manager (#7) cuando tengas clientes pagando y credibilidad.

> Filosofía: primero vender lo que ya tienes (es suficiente para un hostal que
> usa Excel), generar caja y feedback real, y construir lo siguiente CON los
> clientes, no antes de tenerlos.

---

## 7. Resumen ejecutivo
- Tenemos un **core PMS real y multi-tenant** — base que muchos MVP no logran.
- El competidor directo es **HQBeds** (Perú); los otros dos son referencia global.
- No competir de frente: ganar por **simplicidad + precio en soles + foco local Perú**.
- Lo más rentable a construir ahora: **motor de reservas + pagos online**, sobre
  un SaaS ya vendible (terminar onboarding).
- El Channel Manager es el santo grial pero el más caro/complejo: va al final.
