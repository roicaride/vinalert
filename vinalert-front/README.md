# Viñalert — web application

React single-page application for the Viñalert platform. See the
[root README](../README.md) for the full project overview and backend setup.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | React 19 |
| Build tool | Vite 7 |
| Styling | Tailwind CSS 4 |
| Routing | React Router 7 |
| HTTP | Axios, with a 401 interceptor that surfaces expired sessions |
| Charts | Recharts |
| Maps | Leaflet |
| Spreadsheets | SheetJS (`xlsx`) |
| Testing | Vitest + Testing Library, jsdom environment |

## Setup

```bash
npm install
cp .env.example .env    # set VITE_API_BASE to your backend URL
npm run dev
```

The development server runs on `http://localhost:5173`. That origin must be listed in
the backend's `CORS_ORIGINS`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Development server with hot module replacement. |
| `npm run build` | Production bundle in `dist/`. |
| `npm run preview` | Serve the production bundle locally. |
| `npm run lint` | ESLint over the project. |
| `npm test` | Run the test suite once (86 tests). |
| `npm run test:watch` | Run the test suite in watch mode. |

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_API_BASE` | Yes | Base URL of the backend API. |

`.env` is git-ignored. Use `.env.example` as the template.

## Structure

```
src/
├── pantallas/      Screens: Login, SeleccionParcela, Estado, Sensores,
│                   Analisis, Tratamientos, Foliar, Miembros, Configuracion
│   └── analisis/   Analysis charts and range controls
├── componentes/    Shared components: MapaSensores, ModalExportar
├── ui/             Design system primitives: Boton, Campo, Panel, Estados
├── api/            One API client module per backend resource
├── sesion/         Session context and route guards
├── parcela/        Active-plot context
├── layout/         Application shell and navigation
├── errores/        Error rendering, including plain-text 422 responses
├── marca/          Brand mark and favicon handling
└── test/           Test setup and shared API response fixtures
```

Screens, components and variables are named in Spanish, matching the domain vocabulary
used throughout the project.

## Testing

```bash
npm test
```

Tests render screens against mocked API responses from `src/test/respuestas.js`. No
backend instance is required.
