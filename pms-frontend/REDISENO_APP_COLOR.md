# Unificación de colorimetría — App PMS ↔ Landing (Stanza)

> Documento de diseño (2026-07-02). La app del PMS adopta la misma paleta premium que la
> landing pública, para que "se sientan la misma marca". Alcance elegido por el usuario:
> **colorimetría índigo + profundidad + micro-detalles**.

## Por qué / contexto
La landing (`src/publico/sitio/`) ya usaba una paleta premium (off-white cálido + índigo),
scoped a `.sitio`. La app seguía con la paleta original (azul + fondo frío). Se unifican
actualizando **`src/theme/tokens.css`** (fuente única de verdad). Riesgo bajo: la app es
100% token-driven — el azul de marca solo vivía en `tokens.css`, ningún componente lo
hardcodea, así que el cambio se propaga a toda la app (incluidos los gráficos recharts, que
usan `var(--color-brand-*)`).

## Sistema de color (mapeo)

| Rol | Antes (frío/azul) | Ahora (cálido/índigo) — claro | Oscuro |
|---|---|---|---|
| Marca 600 (acción) | `#2563eb` | **`#4F46E5`** | `#818CF8` |
| Marca 700 (hover) | `#1d4ed8` | `#4338CA` | `#A5B0FF` |
| Marca 50 / 100 | `#eff6ff` / `#dbeafe` | `#EEF0FF` / `#E0E3FF` | `#1E1E3A` / `#34345E` |
| Info 600/700/50 | azul | **índigo** (igual que marca) | índigo claro |
| Fondo app | `#f8fafc` | **`#FAFAF8`** (off-white cálido) | `#111110` |
| Superficie | `#ffffff` | `#FFFFFF` | `#1A1A18` |
| Sutil | `#f1f5f9` | `#F4F4F1` | `#201F1D` |
| Texto primario | `#0f172a` | `#1C1C1A` | `#F5F4F1` |
| Texto secundario | `#475569` | `#56564F` | `#B8B7B0` |
| Texto muted | `#64748b` | **`#6E6E68`** | `#86857E` |
| Borde default / strong | `#e2e8f0` / `#cbd5e1` | `#E9E8E3` / `#DCDAD3` | `#2A2A27` / `#3A3A35` |

- **Estados** success/warning/danger (verde/ámbar/rojo) **no cambian**; solo la marca y el
  estado *info* pasan a índigo, y los neutros a cálidos.
- **Nota de accesibilidad (WCAG):** `--text-muted` se dejó en `#6E6E68` (más oscuro que el
  `#8A8A82` de la landing) **a propósito**, para conservar contraste AA en texto pequeño
  sobre las pantallas densas de datos del PMS (tablas, metadatos).

## Profundidad
- **Sombras** suaves multicapa y cálidas (tono del texto): `--shadow-sm/md/lg`.
- **Radios** un poco mayores: `--radius-sm 8`, `--radius-md 12`, `--radius-lg 16`.

## Micro-detalles
- **Botones** (`components/Button.css`): hover-lift sutil (`translateY(-1px)`, se anula al
  presionar; respeta `prefers-reduced-motion` por la regla global) + sombra índigo suave en
  `.btn--primary`.
- **Brand-mark** (`components/AppShell.css`, `auth/Login.css`): caja redondeada con
  **degradado índigo** e icono blanco (igual que la marca de la landing).
- **Tarjetas**: `StatCard` ya tenía hover-lift (ahora con las sombras suaves nuevas); se
  añadió el mismo realce sutil a `.entidad-card` (listas de habitaciones/huéspedes/etc.).
  No se aplica a tablas densas.

## Archivos tocados
- `src/theme/tokens.css` (núcleo: paleta claro/oscuro, sombras, radios).
- `src/components/Button.css`, `src/components/AppShell.css`, `src/auth/Login.css`,
  `src/pages/entidades.css` (micro-detalles).

## Verificación
- `npm run build` 0 errores.
- Estilos computados (preview, admin): **claro** `--bg-app #FAFAF8`, `--color-brand-600
  #4F46E5`, brand-mark con degradado, botón primario índigo; **oscuro** `--bg-app #111110`,
  `--color-brand-600 #818CF8`, botón primario `#818CF8`, texto `#F5F4F1`.
- La landing (`.sitio`) conserva sus tokens `--s-*` propios (no se fusionan); ambas quedan
  alineadas en la misma familia de color.

## Notas / futuro
- Si más adelante se quiere una sola fuente de tokens, se podría hacer que `sitio.css` lea
  los tokens globales; hoy se mantienen separados a propósito (la landing tiene matices
  propios como el `muted` más claro).
