# Cambios de Seguridad - PMS Hospedaje

**Fecha:** 27 de junio de 2026  
**Version:** 0.5.0  
**Auditoria:** Análisis de seguridad completo con remediación de vulnerabilidades críticas y altas.

---

## Resumen de Cambios

| Severidad | Cambios | Archivos afectados |
|-----------|---------|-------------------|
| CRITICA   | 3       | auth.py           |
| ALTA      | 4       | api.py, utils.py, sunat.py, requirements-api.txt |
| MEDIA     | 2       | api.py            |

---

## Cambios CRITICOS

### 1. Secret Key JWT Obligatoria (auth.py)

**Problema:** La clave secreta para firmar JWT estaba hardcodeada como `"dev-only-cambia-esta-clave-pms-2026"`. Cualquier persona podía forjar tokens y acceder como superadmin.

**Solución:**
- En desarrollo: se genera una clave aleatoria con `secrets.token_urlsafe(48)` (cambia cada reinicio)
- En producción (`PMS_ENV=production`): la app **no arranca** si falta `PMS_SECRET_KEY`
- Se eliminó la clave por defecto predecible

```python
# ANTES
_DEFAULT_DEV_KEY = "dev-only-cambia-esta-clave-pms-2026"
SECRET_KEY = os.environ.get("PMS_SECRET_KEY", _DEFAULT_DEV_KEY)

# DESPUÉS
_SECRET_DEFAULT = _secrets.token_urlsafe(48)
_SECRET_KEY_RAW = os.environ.get("PMS_SECRET_KEY", "")
_ES_PROD = os.environ.get("PMS_ENV") == "production"

if _ES_PROD and not _SECRET_KEY_RAW:
    raise RuntimeError("PMS_SECRET_KEY no esta definida en produccion.")

SECRET_KEY = _SECRET_KEY_RAW or _SECRET_DEFAULT
```

### 2. Password Admin Obligatorio en Producción (auth.py)

**Problema:** El password del admin por defecto era `"admin123"`, conocido por todos los scanners automáticos.

**Solución:**
- En producción: la app **no arranca** si falta `PMS_ADMIN_PASSWORD`
- En desarrollo: usa `"cambia-esta-clave"` (nunca `"admin123"`)
- Se eliminó el password predecible

```python
# ANTES
ADMIN_PASSWORD_INICIAL = os.environ.get("PMS_ADMIN_PASSWORD", "admin123")

# DESPUÉS
_ADMIN_PASS_RAW = os.environ.get("PMS_ADMIN_PASSWORD", "")
if _ES_PROD and not _ADMIN_PASS_RAW:
    raise RuntimeError("PMS_ADMIN_PASSWORD no esta definida en produccion.")
ADMIN_PASSWORD_INICIAL = _ADMIN_PASS_RAW or "cambia-esta-clave"
```

### 3. Rate Limiting en Endpoints de Autenticación (api.py)

**Problema:** Sin límite de velocidad, un atacante podía hacer brute-force de credenciales a velocidad de red.

**Solución:** Se instaló `slowapi` y se aplicaron límites:
- `/api/auth/login`: **5 intentos/minuto** por IP
- `/api/auth/registro`: **3 intentos/minuto** por IP
- `/api/auth/google`: **5 intentos/minuto** por IP

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@limiter.limit("5/minute")
@app.post("/api/auth/login")
def login(datos: LoginIn, request: Request):
    ...
```

---

## Cambios ALTOS

### 4. Headers de Seguridad (api.py)

**Problema:** Sin headers de seguridad, la app era vulnerable a clickjacking, MIME sniffing y otros ataques del navegador.

**Solución:** Middleware que agrega headers en todas las respuestas:

| Header | Valor | Protege contra |
|--------|-------|----------------|
| `X-Content-Type-Options` | `nosniff` | MIME sniffing |
| `X-Frame-Options` | `DENY` | Clickjacking |
| `X-XSS-Protection` | `1; mode=block` | XSS reflectado |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Fugas de información |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Solo en producción (HTTPS downgrade) |

### 5. CORS Restrictivo (api.py)

**Problema:** `allow_methods=["*"]` y `allow_headers=["*"]` permitían cualquier método y header. El regex de puertos era demasiado amplio (`5100-5199`).

**Solución:**
- Métodos permitidos: `GET, POST, PUT, DELETE, PATCH` (solo necesarios)
- Headers permitidos: `Authorization, Content-Type` (solo necesarios)
- Regex de puertos: `(5173|5190)` (exactos, no rangos)

```python
# ANTES
allow_methods=["*"],
allow_headers=["*"],
allow_origin_regex=r"http://(localhost|127\.0\.0\.1):51\d\d",

# DESPUÉS
allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
allow_headers=["Authorization", "Content-Type"],
allow_origin_regex=r"http://(localhost|127\.0\.0\.1):(5173|5190)",
```

### 6. Sanitización de Nombres de Archivo PDF (utils.py, sunat.py)

**Problema:** `huesped.nombre` se usaba directamente en rutas de archivos sin sanitizar. Un nombre como `../../etc/passwd` podría causar path traversal.

**Solución:** Función `_sanitize_filename()` que:
- Quita acentos (NFKD normalize)
- Reemplaza caracteres no alfanuméricos con `_`
- Colapsa guiones bajos múltiples
- Nunca permite `..` o `/`

```python
def _sanitize_filename(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    texto = texto.lower().strip()
    texto = re.sub(r"[^a-z0-9._-]", "_", texto)
    texto = re.sub(r"_+", "_", texto).strip("_")
    return texto or "archivo"
```

### 7. Token Lifetime Reducido (auth.py)

**Problema:** Los tokens JWT duraban 12 horas. Un token robado daba acceso por medio día.

**Solución:** Se redujo a **2 horas**. Para sesiones persistentes, se recomienda implementar refresh tokens (pendiente).

```python
# ANTES
TOKEN_HORAS = 12

# DESPUÉS
TOKEN_HORAS = 2
```

---

## Cambios MEDIOS

### 8. max_length en Modelos Pydantic (api.py)

**Problema:** Los campos de texto no tenían límite de longitud. Un atacante podía enviar megabytes de texto.

**Solución:** Se agregaron约束 `max_length` a todos los campos string:

| Modelo | Campo | max_length |
|--------|-------|------------|
| Todos los modelos | `notas` | 2000 |
| HuespedDatos | `nombre` | 200 |
| HuespedDatos | `email` | 254 |
| HuespedDatos | `direccion` | 300 |
| HabitacionDatos | `numero` | 10 |
| LoginIn | `usuario` | 100 |
| LoginIn | `password` | 200 |
| HospedajeNuevo | `nombre` | 200 |
| SunatConfigDatos | `ruc` | 11 |
| ... | ... | ... |

### 9. Excepciones de Password (auth.py)

**Problema:** `verificar_password` capturaba todas las excepciones (`Exception`) y devolvía `False`, ocultando errores reales.

**Solución:** Solo captura `ValueError` y `TypeError` (los errores esperados de bcrypt).

```python
# ANTES
except Exception:
    return False

# DESPUÉS
except (ValueError, TypeError):
    return False
```

---

## Variables de Entorno Requeridas en Producción

Para que la app arranque en producción, **deben** estar definidas:

| Variable | Descripción | Obligatoria |
|----------|-------------|-------------|
| `PMS_ENV` | `"production"` | Sí |
| `PMS_SECRET_KEY` | Clave secreta para JWT (mínimo 32 caracteres) | Sí |
| `PMS_ADMIN_PASSWORD` | Password del admin inicial | Sí |
| `DATABASE_URL` | URL de conexión a PostgreSQL | Sí |
| `CORS_ORIGINS` | Dominios del frontend (separados por coma) | Recomendada |
| `GOOGLE_CLIENT_ID` | Client ID de Google OAuth | Opcional |

**Ejemplo de configuración en Render:**
```yaml
envVars:
  - key: PMS_ENV
    value: production
  - key: PMS_SECRET_KEY
    generateValue: true
  - key: PMS_ADMIN_PASSWORD
    generateValue: true
  - key: DATABASE_URL
    fromDatabase:
      name: pms-db
      property: connectionString
  - key: CORS_ORIGINS
    value: https://tu-frontend.vercel.app
```

---

## Pendiente (Mejoras Futuras)

| Prioridad | Descripción |
|-----------|-------------|
| Alta | Implementar refresh tokens (reducir lifetime a 15min + refresh de 7d) |
| Alta | Token blocklist para logout/revocación |
| Alta | CAPTCHA en registro público y reserva pública |
| Media | Logging estructurado de eventos de seguridad |
| Media | Connection pooling para PostgreSQL |
| Media | Audit trail (created_by, updated_by, created_at, updated_at) |
| Media | HTTPS redirect middleware |
| Baja | Request body size limits explícitos |

---

## Archivos Modificados

| Archivo | Cambios |
|---------|---------|
| `auth.py` | Secret key generada, admin password obligatorio, token 2h, excepciones específicas |
| `api.py` | Rate limiting, security headers, CORS restrictivo, max_length en modelos, v0.5.0 |
| `utils.py` | Sanitización de nombres de archivo PDF |
| `sunat.py` | Sanitización de nombres de archivo PDF |
| `requirements-api.txt` | Agregado `slowapi>=0.1.9` |

---

## Cómo Verificar

1. **Rate limiting:** Intenta hacer login 6 veces en 1 minuto. La 6ta debe retornar HTTP 429.
2. **Security headers:** Abre DevTools > Network > cualquier respuesta > Headers. Debes ver `X-Frame-Options: DENY`.
3. **CORS:** Intenta hacer un request desde un origen no autorizado. Debe ser bloqueado.
4. **Token lifetime:** Login, espera 2 horas, intenta usar el token. Debe retornar HTTP 401 "La sesion expiro".
5. **Production guard:** Configura `PMS_ENV=production` sin `PMS_SECRET_KEY`. La app debe fallar al arrancar.
