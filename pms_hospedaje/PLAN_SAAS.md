# Plan de arquitectura — Convertir el PMS en un SaaS multi-cliente

> Documento de diseño (Fase 4). Objetivo: pasar de "una app para un hospedaje"
> a "un producto que vendes a muchos hospedajes, cada uno con sus datos
> aislados y su suscripción".

---

## 1. El concepto central: Multi-tenancy

Hoy la app es **mono-cliente**: toda la base de datos asume un único hospedaje.
Para venderla a varios clientes necesitamos **multi-tenancy**: muchos clientes
("inquilinos" / *tenants*) compartiendo la misma aplicación, pero con datos
**totalmente aislados** entre sí.

Analogía: un edificio de apartamentos. Misma estructura (agua, luz, ascensor),
pero cada inquilino tiene su llave y nadie entra al apartamento de otro.

### Estrategia de aislamiento elegida
Hay 3 modelos posibles:
1. Una base de datos por cliente — máximo aislamiento, máximo costo/complejidad.
2. Un esquema por cliente — intermedio.
3. **Base de datos compartida + columna `hospedaje_id`** — ✅ **el elegido**.

Para la escala objetivo (decenas/cientos de hospedajes pequeños) la opción 3 es
la estándar de la industria: simple, barata, escalable. Cada fila de cada tabla
"sabe" a qué hospedaje pertenece, y **toda consulta filtra por ese id**.

---

## 2. Jerarquía de cuentas (roles)

| Nivel | Quién | Alcance | Login |
|---|---|---|---|
| **Super Admin** | TÚ (dueño del SaaS) | Ve y gestiona TODOS los hospedajes; activa/suspende; cobra | Sí |
| **Admin hospedaje** | Tu cliente (dueño del negocio) | Solo SU hospedaje; crea sus empleados | Sí |
| **Recepción** | Empleados del cliente | Operación diaria de SU hospedaje | Sí |
| **Huésped** | Persona que se aloja | NO entra al sistema; es un *dato* que el cliente registra | No* |

\* *Opcional a futuro: un "portal del huésped" para reservas online sería una
capa aparte (Fase 5+). Por ahora los huéspedes no tienen cuenta.*

---

## 3. Modelo de datos (cambios)

### 3.1 Tabla nueva: `hospedajes` (el tenant)
```
hospedajes
  id              PK
  nombre          nombre comercial del hospedaje
  slug            identificador corto único (ej. "hotel-sol")
  plan            'trial' | 'basico' | 'pro'
  estado          'prueba' | 'activo' | 'suspendido' | 'cancelado'
  fecha_inicio    cuándo se registró
  fecha_expira    cuándo vence la suscripción/prueba
  creado_en
```

### 3.2 Tabla `usuarios` (modificar)
- Añadir `hospedaje_id` (FK → hospedajes). NULL solo para el Super Admin.
- El rol gana un valor nuevo: `superadmin` (además de `admin` y `recepcion`).

### 3.3 Todas las tablas de datos (añadir `hospedaje_id`)
A estas 7 se les añade la columna `hospedaje_id` (FK → hospedajes):
`habitaciones, tareas_limpieza, huespedes, reservas, estancias, facturas, pagos`.

> Regla de oro: **NADA se consulta ni se crea sin su `hospedaje_id`.**

---

## 4. El aislamiento en el código (lo crítico)

El riesgo #1 de un SaaS multi-tenant es la **fuga de datos** (que un cliente vea
datos de otro). Se previene centralizando el filtro, no confiando en recordarlo
en cada consulta.

Plan técnico:
- El JWT del usuario ya lleva su info; se le añade `hospedaje_id`.
- Una dependencia de FastAPI (`hospedaje_actual`) extrae ese id del token.
- **Cada endpoint** filtra por ese id: `WHERE hospedaje_id = ?` en lecturas, y
  lo inyecta en cada INSERT.
- El Super Admin es la excepción: puede consultar across-tenants para su panel.

Esto toca prácticamente todos los endpoints de `api.py` (es el grueso del
trabajo) y la capa de negocio.

---

## 5. Suscripciones y control de acceso

### Estados de un hospedaje
```
prueba      → acceso completo, con fecha_expira (ej. 14 días)
activo      → pagó; acceso completo
suspendido  → no pagó; NO puede entrar, pero sus datos se conservan
cancelado   → se dio de baja; datos en espera de borrado
```

### Verificación en cada login / petición
Al entrar, el sistema revisa el estado y la fecha:
- Si `activo` o `prueba` vigente → adelante.
- Si expiró o `suspendido` → bloquea con mensaje "Renueva tu plan" (sin perder
  datos).

---

## 6. Onboarding (alta de clientes nuevos)

Página pública **"Crear cuenta / Prueba gratis"**:
1. El cliente ingresa: nombre del hospedaje + su nombre + email + contraseña.
2. El sistema crea en una transacción: el `hospedaje` (estado `prueba`,
   `fecha_expira` = hoy + 14 días) + su usuario `admin` ligado a ese hospedaje.
3. Entra directo a su panel, ya con datos aislados.

---

## 7. Cobro (modelo de negocio)

### Fase manual (recomendada para empezar)
- El cliente paga por Yape / transferencia / Mercado Pago manual.
- TÚ (super admin) marcas su hospedaje como `activo` y pones `fecha_expira`.
- Cero integración técnica. Ideal para los primeros clientes.

### Fase automática (cuando ya tengas clientes pagando)
- Pasarela: **Stripe** (internacional), **Mercado Pago** o **Culqi** (Perú).
- Cobro recurrente mensual; webhooks que activan/suspenden automáticamente.
- Es un proyecto en sí mismo; NO hacerlo antes de tener demanda real.

### Planes sugeridos (ejemplo)
| Plan | Límite | Precio orientativo |
|---|---|---|
| Trial | 14 días, todo incluido | Gratis |
| Básico | hasta X habitaciones, 2 usuarios | S/ 49/mes |
| Pro | habitaciones ilimitadas, +usuarios, reportes avanzados | S/ 99/mes |

---

## 8. Roadmap por etapas (de menor a mayor riesgo)

| Etapa | Entrega | Esfuerzo | Depende de |
|---|---|---|---|
| **4.1 Multi-tenant base** | tabla hospedajes + hospedaje_id en todo + filtrado + migrar datos actuales a "hospedaje #1" | 🔴 Alto | — |
| **4.2 Super Admin** | panel para ver/crear/suspender hospedajes | 🟠 Medio | 4.1 |
| **4.3 Onboarding** | página de registro con trial 14 días | 🟠 Medio | 4.1 |
| **4.4 Suscripciones** | estados + expiración + bloqueo por impago | 🟠 Medio | 4.1, 4.2 |
| **4.5 Cobro automático** | Stripe/Mercado Pago + webhooks | 🔴 Alto | 4.4 + clientes reales |

**Recomendación:** 4.1 → 4.2 → 4.3 → 4.4 manual. Dejar 4.5 para cuando haya
clientes pagando. No optimizar lo que aún no existe.

---

## 9. Consideraciones importantes

- **Migración de datos en producción:** ya hay una app en vivo con datos. Al
  hacer 4.1, los datos actuales se asignan a un "hospedaje #1" (el tuyo de
  prueba). Hay que hacerlo con un script de migración cuidadoso y backup previo
  (Neon permite backups/branches).
- **Seguridad/legal:** al tener datos de varios negocios y sus huéspedes (datos
  personales), conviene a futuro: política de privacidad, términos de servicio,
  y buenas prácticas de protección de datos.
- **Backups:** crítico cuando hay clientes pagando. Neon ofrece point-in-time
  restore.
- **El plan free de Render duerme**: con clientes reales conviene el plan de
  pago (~$7/mes) para que no haya esperas de 30s.

---

## 10. Resumen ejecutivo

Tu arquitectura actual (login con roles + JWT, BD en la nube, código en capas)
está **bien preparada** para este salto. El trabajo grande es el **4.1**
(añadir `hospedaje_id` a todo y centralizar el filtrado) — es el cimiento del
que dependen las demás etapas. Una vez hecho, el resto es incremental.

Es una Fase 4 completa, no un ajuste menor. Se recomienda hacerla por etapas,
verificando el aislamiento de datos en cada paso (es lo que no puede fallar).
