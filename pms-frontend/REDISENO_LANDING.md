# Rediseño premium de la landing — Stanza

> Documento de diseño (2026-07-02). Transformación de la web pública de Stanza a un
> estándar SaaS premium (referencia de calidad: Stripe / Linear / Vercel / Notion).
> Alcance: **solo la landing** (`src/publico/sitio/`); la app del PMS logueado no se tocó.

---

## 1. Auditoría inicial

**Fortalezas previas:** IA clara (Inicio/Funciones/Precios/Contacto), tokens + modo oscuro,
accesibilidad base, mensaje sólido ("en soles, sin comisión de Booking"), build liviano.

**Problemas encontrados (priorizados):**
1. 🔴 Look genérico: blanco puro (#fff) fatiga; planos sin profundidad; hero sin producto.
2. 🔴 Precio Fundador "gritado" (badge + banner) → abarataba la marca.
3. 🔴 Contacto exponía número de WhatsApp y correo → privacidad y poco profesional.
4. 🟠 Sin jerarquía de movimiento (nada de reveals ni micro-interacciones).
5. 🟠 Hero sin prueba visual del producto.
6. 🟠 Prueba social ausente; CTAs sin suficiente peso.
7. 🟡 Tipografía sin refinar; spacing sin ritmo editorial.

**Por qué mejorar cada punto sube conversión:** producto visible + reveals → credibilidad;
paleta premium → sube valor percibido (justifica el precio); fundador como recompensa →
exclusividad/urgencia sana; contacto profesional → menos fricción y protege datos.

---

## 2. Decisiones de diseño (UX/UI)

- **Alcance de paleta: solo la landing** (tokens `--s-*` scoped a `.sitio`), para no
  arriesgar la app operativa.
- **Producto visible**: mockups SVG (calendario, dashboard, reserva) en hero y secciones —
  livianos, nítidos, sin imágenes raster ni CLS.
- **Movimiento con propósito**: reveals al scroll (IntersectionObserver) + hover/press;
  lenguaje único; se anula con `prefers-reduced-motion`.
- **Fundador como recompensa** (ver §8) en vez de descuento gritado.
- **Contacto privado** (ver §9): WhatsApp por deep link + formulario que guarda leads.
- **Integridad**: no se inventaron testimonios, logos ni métricas. La confianza se basa en
  hechos reales (0% comisión, 14 días gratis, en soles, hecho en Perú).

---

## 3. Sistema de color (`sitio-tokens.css`)

Neutros **cálidos** (nada de #fff) + un acento índigo disciplinado + verde para el proof.

| Rol | Claro | Oscuro |
|---|---|---|
| Fondo página | `#FAFAF8` | `#111110` |
| Superficie / tarjeta | `#FFFFFF` / `#FDFDFC` | `#1A1A18` / `#201F1D` |
| Sutil / alt | `#F4F4F1` | `#171715` |
| Borde hairline | `#E9E8E3` / `#DCDAD3` | `#2A2A27` / `#3A3A35` |
| Texto | `#1C1C1A` / `#56564F` / `#8A8A82` | `#F5F4F1` / `#B8B7B0` / `#86857E` |
| Acento (CTA) | `#4F46E5` (hover `#4338CA`, soft `#EEF0FF`) | `#818CF8` |
| Éxito (proof) | `#15803D` (soft `#ECFDF3`) | `#4ADE80` |

Sombras suaves multicapa y cálidas (`--s-shadow-sm/md/lg`), foco visible (`--s-ring`).
**Justificación:** el off-white reduce fatiga (petición explícita); un solo acento fuerte +
neutros cálidos = la sobriedad "cara" de Stripe/Linear sin ruido cromático.

## 4. Sistema tipográfico

**Inter** (una sola familia, ≤3 tipografías, rendimiento). Refinamiento: hero
`clamp(2.4rem→4rem)`, tracking negativo en títulos (`-0.02/-0.035em`), `tabular-nums` en
precios, interlínea 1.6 en cuerpo. Sin fuentes nuevas.

## 5. Sistema de espaciado y profundidad

Ritmo editorial (secciones ~4.5rem, hero 5.5rem), contenedor `max-width 1120px`,
bordes hairline + sombras suaves + radios 8/12/18/24. Marco "navegador" (`.s-frame`) para
los mockups (barra con dots + URL) → sensación de producto real.

## 6. Sistema de componentes

Botones `s-btn` (primary/ghost, sm/lg) con lift en hover y ring en foco; nav glass con
sombra al scroll; **bento grid** de funciones; tarjetas con hover-lift; `s-eyebrow`,
`s-ico`, `s-head`, pasos numerados, bloque de confianza, CTA final en gradiente, FAQ, y el
panel del fundador.

## 7. Sistema de animación (`useReveal.js` + `sitio.css`)

- Tokens: `--s-dur-fast/base/slow` (140/240/520ms), `--s-ease` (ease-out expresivo),
  `--s-ease-spring`.
- `useReveal` (IntersectionObserver, `once`, con fallback a visible si hay reduced-motion o
  no hay IO) + componente `<Reveal>`; clases `.reveal`/`.reveal-in` con *stagger* por `delay`.
- Micro-interacciones: hover-lift en tarjetas/botones, press-scale, glass en nav.
- **Accesibilidad:** todo bajo `prefers-reduced-motion: reduce` (sin animación, contenido
  siempre visible).

## 8. Estrategia del Precio Fundador (easter egg)

**Qué se hizo:** se eliminó el badge/banner. El precio fundador (S/99 vitalicio) ahora es una
**recompensa oculta** que se **descubre**:
- **Por engagement (principal):** al cambiar el toggle a **Anual** *y* llegar a la sección de
  **preguntas** en /precios, aparece un panel sobrio (`FounderReveal`).
- **Trigger accesible (fallback WCAG):** un detalle discreto "✦" enfocable por teclado en el
  footer lo revela y lleva a /precios (para quien no usa scroll/hover).
- Se recuerda en `sessionStorage` durante la sesión (no se vuelve a esconder al navegar).

**Por qué:** mantiene el pricing limpio y premium (los referentes no gritan descuentos),
crea exclusividad y urgencia sana, y sube el valor percibido premiando a quien explora.
Implementación desacoplada en `founder.js` (evento + hook `useFounderUnlocked`).

## 9. Contacto (privacidad) — alternativas y elección

Requisito: no exponer número ni correo.
- **WhatsApp:** deep link `wa.me` — abre el chat en desktop y móvil **sin mostrar el número**.
- **Correo → formulario de leads.** Alternativas evaluadas:
  - *mailto/alias*: simple, pero expone un correo o exige dominio propio. ❌
  - *Servicio externo (Resend/SendGrid)*: profesional, pero requiere API key + dominio
    verificado (setup y credenciales). ⏳ (futuro)
  - *Endpoint que reenvía por SMTP*: igual necesita credenciales. ⏳
  - **✅ Elegida: captura de leads en BD.** `POST /api/contacto` (público, rate-limit 4/min)
    guarda el mensaje en la tabla `contactos`; el super-admin los ve en "Mensajes". Sin
    exponer nada, sin credenciales, y crea una lista de prospectos. Futuro: reenviar por
    email cuando se configure una API key.

---

## 10. Cambios realizados

**Nuevos:** `sitio/sitio-tokens.css`, `sitio/useReveal.js`, `sitio/Mockups.jsx`,
`sitio/FounderReveal.jsx`, `sitio/founder.js`, `REDISENO_LANDING.md`.

**Modificados:** `sitio/sitio.css` (reescrito, sistema premium), `sitio/SitioWeb.jsx`
(nav glass + footer + trigger fundador), `sitio/Inicio.jsx`, `sitio/Funciones.jsx`,
`sitio/Precios.jsx` (sin banner fundador + mecánica de reveal), `sitio/Contacto.jsx`
(WhatsApp sin número + formulario), `sitio/datos.js` (se quitaron `WHATSAPP_DISPLAY` y
`EMAIL`), `api/client.js` (`enviarContacto`, `contactos`), `pages/hospedajes/Hospedajes.jsx`
(vista "Mensajes"), `pms_hospedaje/api.py` (endpoints contacto + modelo),
`pms_hospedaje/migracion_multitenant.py` (tabla `contactos`).

**Eliminados (contenido):** badge y banner del Precio Fundador en Precios.

**Imágenes:** ninguna raster; visuales de producto en **SVG** (`Mockups.jsx`).

## 11. Mejoras por eje

- **Rendimiento:** sin librerías nuevas (motion en CSS + IO); mockups SVG inline (0 assets,
  sin CLS); code-splitting del sitio ya existente; animaciones sobre `opacity/transform`.
- **Accesibilidad:** foco visible (`--s-ring`), `prefers-reduced-motion`, easter egg con
  trigger por teclado, roles/aria en nav/estado, contraste WCAG en la paleta.
- **Conversión:** hero con producto + doble CTA, bento escaneable, pasos, confianza honesta,
  fundador como recompensa, CTAs repetidos, FAQ que resuelve objeciones.
- **Móvil:** nav con menú hamburguesa, bento/planes/áreas colapsan por breakpoint
  (820/900/560px), targets ≥44px.

## 12. Verificación

- `npm run build` → 0 errores. Backend `py_compile` OK. `POST /api/contacto` → 201; leads
  visibles para super-admin. `#/contacto` no expone número ni correo; WhatsApp por `wa.me`.
- Preview: fondo claro `#FAFAF8` y oscuro `#111110` (no #fff); hero con mockup; 6 tarjetas
  bento; fundador **oculto** por defecto y revelado por el trigger del footer.
- **Nota de entorno:** el preview MCP reporta `window.innerHeight = 0`, por lo que el
  IntersectionObserver (reveals al scroll y la ruta del fundador por engagement) no dispara
  *dentro del preview*; en un navegador real funciona con normalidad. Verificar en el
  navegador propio (localhost:5174).

## 13. Riesgos / pendientes / recomendaciones futuras

- Verificar dominio/marca "Stanza" antes de comprar (stanza.pe / getstanza).
- Reemplazar mockups SVG por **capturas reales** del PMS cuando haya datos de demo.
- Contacto: añadir reenvío por email (Resend) cuando haya API key + dominio.
- Prueba social real (testimonios/logos) cuando existan clientes — hoy, honestamente, no.
- Si se quiere unificar el look premium con la app logueada, migrar los `--s-*` a `tokens.css`.
- `d644e02` (Stanza + Opción B) y este rediseño siguen **sin pushear**: desplegar cuando el
  usuario confirme (push a main → Vercel/Render; migraciones additivas corren solas en Neon).
