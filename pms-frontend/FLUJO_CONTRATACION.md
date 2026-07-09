# Flujo de contratación del SaaS + onboarding — Vantry

> Diseño del flujo completo para que un cliente contrate Vantry, con lo que YA
> existía y lo implementado en #7. Objetivo: registro profesional (legal + email +
> recuperación) sin fricción.

## Flujo (estado objetivo)
```
Landing → Elegir plan (Precios) → Registro (con aceptación de términos) →
  creación automática del hospedaje + usuario admin → entra directo →
  Asistente de bienvenida (onboarding: primera habitación) →
  Prueba de 14 días → Pago (Yape/transferencia) → Activación (superadmin) →
  Acceso pleno al PMS.
```

## Ya existía
- **Registro self-service** (`/api/auth/registro`): crea hospedaje (trial 14 días,
  estado "prueba") + usuario admin y **entra directo** con token. También por **Google**.
- **Asistente de bienvenida** (`AsistenteBienvenida`): guía la primera vez, incluye
  crear la primera habitación.
- **Activación por pago manual** (superadmin registra el pago → activa/renueva, Opción B).

## Implementado en #7
### Aceptación de términos + plan elegido
- Registro exige **aceptar Términos y Privacidad** (checkbox con enlaces a
  `/terminos` y `/privacidad`); el backend rechaza sin aceptación (422) y guarda
  `usuarios.acepto_terminos_en`.
- El **plan elegido en Precios** viaja al registro (`#/registro?plan=crece`) y se
  guarda como `hospedajes.plan_deseado` (informativo; la activación real es por pago).

### Capa de correo (modular)
- **`correo.py`**: `enviar()` con proveedor **SMTP configurable** (env: `SMTP_HOST/
  PORT/USER/PASS/FROM/TLS`, `APP_URL`) y **fallback a log en desarrollo** (sin SMTP,
  registra el correo por consola). Nunca lanza: un fallo de correo no rompe el flujo.
  Plantillas: bienvenida, recuperación, verificación.
- **Correo de bienvenida** al registrarse (best-effort).

### Recuperación de contraseña (self-service)
- `POST /api/auth/recuperar` {email}: respuesta **genérica siempre** (no revela si el
  correo existe); si existe, guarda un **token con hash + vencimiento (1 h)** y envía
  el enlace `APP_URL/#/reset?token=…`.
- `POST /api/auth/reset` {token, password}: valida token y vencimiento, fija la nueva
  contraseña y **invalida el token** (un solo uso).
- Frontend: Login → "¿Olvidaste tu contraseña?" → pide correo; enlace del correo →
  `#/reset` → nueva contraseña. Componente `auth/Recuperar.jsx`; rutas en `App.Acceso`.

### Verificación de email (preparada)
- Columna `usuarios.email_verificado_en` + plantilla de verificación en `correo.py`.
  No se bloquea el acceso por email no verificado (para no romper el alta directa);
  queda listo para exigirlo cuando se decida.

## Impacto
- **BD:** `usuarios.acepto_terminos_en`, `email_verificado_en`, `reset_token_hash`,
  `reset_expira`; `hospedajes.plan_deseado`. (Migración 28, aditiva/idempotente.)
- **API:** registro valida términos + guarda plan; `/auth/recuperar` y `/auth/reset`.
- **Frontend:** Registro (checkbox + plan), Login (enlace olvidé), `Recuperar.jsx`,
  Precios (CTA con `?plan=`), routing de `Acceso`.

## Verificado
Registro sin términos → 422; con términos → 201 + entra; plan "Crece" llega al
registro; recuperar → 200 genérico; reset con token real → 200 (token de un solo
uso; reúso → 400); pantallas de auth renderizan. Build + `py_compile` OK.

## Limitaciones / evolución
- **Email en producción requiere configurar SMTP** (hoy en dev solo loguea el correo).
- **Verificación de email** está preparada pero no forzada.
- **Dominio/subdominio propio**: no aplica (un solo dominio; el link público usa el
  slug del hospedaje). Evolucionable a subdominios si se requiere.
- Futuro: activación automática al pagar (pasarela), doble opt-in de email, plantillas
  de correo enriquecidas, recordatorios de fin de prueba.
