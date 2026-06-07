# PMS Hospedaje — Frontend web

Interfaz web del PMS, hecha con **React + Vite (JSX)**. Consume la API
**FastAPI** que reutiliza la lógica de negocio de la app de escritorio
(`pms_hospedaje/modelos.py`).

## Arquitectura (resumen)

```
pms_hospedaje/   ← Backend: lógica de negocio (modelos.py) + API (api.py, FastAPI)
pms-frontend/    ← Frontend: esta carpeta (React/JSX)
```

El navegador (frontend, puerto 5173) habla por HTTP con la API (puerto 8000),
que a su vez usa los modelos Python y la base SQLite ya existentes.

## Cómo ejecutar (necesitas DOS terminales)

### Terminal 1 — Backend (API)

```powershell
cd C:\Users\jeyko\OneDrive\Documentos\Proyectos\pms_hospedaje
pip install -r requirements-api.txt
uvicorn api:app --reload --port 8000
```

Comprueba: abre http://localhost:8000/docs (documentación interactiva).

### Terminal 2 — Frontend (web)

```powershell
cd C:\Users\jeyko\OneDrive\Documentos\Proyectos\pms-frontend
npm install
npm run dev
```

Abre la URL que muestre (normalmente http://localhost:5173).

> La app de escritorio en Tkinter (`python main.py`) sigue funcionando igual;
> no la hemos tocado. La web es una capa nueva encima de la misma lógica.

## Estructura del frontend

```
src/
  theme/
    tokens.css      ← DESIGN SYSTEM: colores (WCAG AA), tipografía, espaciado
    tokens.js       ← espejo en JS de los tokens
  styles/
    global.css      ← reset + tipografía base + accesibilidad (foco, motion)
  components/
    AppShell.jsx    ← layout (sidebar + contenido)
    Button.jsx      ← botón (variantes, target táctil 44px)
    Card.jsx        ← contenedor de superficie
    Badge.jsx       ← estado con icono + texto (no solo color)
    StatCard.jsx    ← tarjeta de KPI
    StateMessage.jsx← estados de carga / vacío / error
  config/
    estados.js      ← mapeo de estados del dominio a color+icono+etiqueta
  api/
    client.js       ← cliente HTTP de la API
  hooks/
    useApi.js       ← carga de datos con estados (loading/error/data)
  pages/
    Dashboard.jsx   ← primera pantalla, conectada a datos reales
```

## Principios de diseño aplicados

- **1 sola tipografía** (Inter) con jerarquía por tamaño y peso.
- **Color de texto con contraste WCAG AA** verificado.
- **Estados nunca solo por color** (icono + texto) → WCAG 1.4.1.
- **Espaciado en múltiplos de 4px**, aire generoso (anti *horror vacui*).
- **Foco visible** y respeto a *prefers-reduced-motion*.
- **Estados de carga/vacío/error** siempre visibles.
