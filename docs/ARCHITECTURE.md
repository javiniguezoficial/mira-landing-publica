# Arquitectura — Plataforma MIRA

## Visión general

MIRA es una aplicación web full-stack construida con Next.js 15 (App Router). No existe un backend separado: toda la lógica de servidor se ejecuta mediante **Server Actions** y **Route Handlers** de Next.js, con Supabase como base de datos, autenticación y (en el futuro) almacenamiento.

```
Browser
  │
  ▼
Next.js 15 (App Router)
  ├── Server Components  ──► Supabase (PostgreSQL + RLS)
  ├── Server Actions     ──► Supabase (mutaciones)
  └── Client Components  ──► Supabase Realtime (futuro)

Infraestructura: Coolify (Docker, self-hosted)
```

---

## Stack tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| Framework | Next.js (App Router) | 15.x |
| Lenguaje | TypeScript | ~5.8 |
| Estilos | Tailwind CSS | v4 |
| Design System | MIRA Design System (tokens CSS custom) | interno |
| Base de datos | Supabase / PostgreSQL | — |
| Autenticación | Supabase Auth (email + password) | — |
| Gráficos | Recharts | — |
| Iconos | Lucide React | — |
| Editor de texto | Tiptap | — |
| Importación | xlsx (SheetJS) | — |
| Mapas | Leaflet + react-leaflet | — |
| Deploy | Coolify (Docker, multistage) | self-hosted |

---

## Estructura de carpetas

```
/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (public)/           # Grupo de rutas públicas (sin autenticación)
│   │   │   ├── page.tsx        # Landing principal
│   │   │   ├── login/
│   │   │   ├── registro/
│   │   │   ├── recuperar-password/
│   │   │   ├── actualizar-password/
│   │   │   ├── enterprise/
│   │   │   ├── sobre-nosotros/
│   │   │   └── [legales]/      # aviso-legal, politica-privacidad, etc.
│   │   ├── admin/              # Panel de administración (role: platform_admin)
│   │   │   ├── layout.tsx      # Layout admin con sidebar
│   │   │   ├── dashboard/
│   │   │   ├── clientes/
│   │   │   ├── usuarios/
│   │   │   ├── mercados/
│   │   │   ├── proveedores/
│   │   │   ├── rfqs/
│   │   │   ├── noticias/
│   │   │   ├── soporte/
│   │   │   ├── configuracion/
│   │   │   └── precios/importar/
│   │   ├── app/                # Portal cliente (role: member)
│   │   │   ├── layout.tsx      # Layout cliente con sidebar
│   │   │   ├── dashboard/
│   │   │   ├── market-intelligent/
│   │   │   │   └── [marketSlug]/[productSlug]/  # Detalle de producto
│   │   │   ├── proveedores/
│   │   │   ├── rfqs/
│   │   │   ├── noticias/
│   │   │   ├── mi-organizacion/
│   │   │   ├── configuracion/
│   │   │   └── ayuda/
│   │   └── api/
│   │       └── admin/price-template/  # Descarga plantilla CSV/XLSX
│   ├── components/
│   │   ├── mira/               # MIRA Design System
│   │   │   ├── MiraPageHeader.tsx
│   │   │   ├── MiraPageShell.tsx
│   │   │   ├── MiraSidebar.tsx
│   │   │   ├── MiraTable.tsx
│   │   │   ├── MiraKpiCard.tsx
│   │   │   ├── MiraStatusBadge.tsx
│   │   │   ├── MiraFilterBar.tsx
│   │   │   ├── MiraFormCard.tsx
│   │   │   ├── MiraSearchInput.tsx
│   │   │   ├── MiraSectionCard.tsx
│   │   │   ├── MiraQuickAction.tsx
│   │   │   ├── MiraViewToggle.tsx
│   │   │   └── charts/
│   │   │       ├── MiraAreaChart.tsx
│   │   │       ├── MiraDonut.tsx
│   │   │       ├── MiraRankBars.tsx
│   │   │       ├── MiraVerticalBars.tsx
│   │   │       ├── MiraTooltip.tsx
│   │   │       └── palette.ts
│   │   ├── admin/              # Componentes exclusivos del panel admin
│   │   ├── app/                # Componentes exclusivos del portal cliente
│   │   └── shared/             # Componentes compartidos (EmptyState, etc.)
│   ├── lib/
│   │   ├── actions/            # Server Actions (mutaciones)
│   │   │   ├── admin-settings.ts
│   │   │   ├── client-settings.ts
│   │   │   ├── import-prices.ts
│   │   │   ├── markets.ts
│   │   │   ├── my-organization.ts
│   │   │   ├── news.ts
│   │   │   ├── organizations.ts
│   │   │   ├── prices.ts
│   │   │   ├── rfq-responses.ts
│   │   │   ├── rfqs.ts
│   │   │   ├── suppliers.ts
│   │   │   ├── support.ts
│   │   │   └── users.ts
│   │   ├── queries/            # Queries de lectura reutilizables
│   │   │   ├── admin-dashboard.ts
│   │   │   ├── client-dashboard.ts
│   │   │   ├── markets.ts
│   │   │   ├── my-organization.ts
│   │   │   ├── news.ts
│   │   │   ├── prices.ts
│   │   │   ├── support.ts
│   │   │   └── user-org.ts
│   │   ├── supabase/
│   │   │   ├── server.ts       # Cliente Supabase para Server Components
│   │   │   ├── client.ts       # Cliente Supabase para Client Components
│   │   │   └── middleware.ts   # Refresco de sesión en middleware
│   │   ├── constants.ts
│   │   ├── miraButtons.ts      # Helpers de clases del Design System
│   │   ├── types/
│   │   │   └── import-prices.ts
│   │   └── utils.ts
│   └── types/
│       └── app.types.ts        # Tipos globales de la aplicación
├── supabase/
│   └── migrations/             # Migraciones SQL numeradas
├── public/                     # Assets estáticos (requerido por Dockerfile)
├── docs/                       # Documentación técnica
├── middleware.ts               # Middleware Next.js (refresco sesión)
├── Dockerfile                  # Build multistage para Coolify
└── .env.example                # Plantilla de variables de entorno
```

---

## Rutas principales

### Rutas públicas (sin autenticación)

| Ruta | Descripción |
|---|---|
| `/` | Landing principal |
| `/login` | Inicio de sesión |
| `/registro` | Registro de nuevas organizaciones |
| `/recuperar-password` | Solicitud de reset de contraseña |
| `/actualizar-password` | Cambio de contraseña (desde email) |
| `/enterprise` | Página Enterprise |
| `/sobre-nosotros` | Página corporativa |
| `/aviso-legal` | Aviso legal |
| `/politica-privacidad` | Política de privacidad |
| `/politica-cookies` | Política de cookies |
| `/terminos-condiciones` | Términos y condiciones |

### Panel Administrador (requiere role `platform_admin`)

| Ruta | Descripción |
|---|---|
| `/admin/dashboard` | Métricas globales |
| `/admin/clientes` | Gestión de organizaciones |
| `/admin/usuarios` | Listado de perfiles |
| `/admin/mercados` | Mercados, categorías y productos |
| `/admin/mercados/[id]/productos/[pid]/precios` | Precios históricos de un producto |
| `/admin/precios/importar` | Importación masiva CSV/XLSX |
| `/admin/proveedores` | Catálogo de proveedores |
| `/admin/rfqs` | Solicitudes de cotización |
| `/admin/noticias` | CMS de noticias |
| `/admin/soporte` | Tickets de soporte |
| `/admin/configuracion` | Ajustes y perfil admin |

### Portal Cliente (requiere role `member`)

| Ruta | Descripción |
|---|---|
| `/app/dashboard` | Dashboard del cliente |
| `/app/market-intelligent` | Listado de mercados |
| `/app/market-intelligent/[marketSlug]/[productSlug]` | Detalle de producto con precios |
| `/app/proveedores` | Directorio con mapa Leaflet |
| `/app/rfqs` | Solicitudes de cotización del cliente |
| `/app/noticias` | Feed de noticias |
| `/app/mi-organizacion` | Datos de la organización |
| `/app/configuracion` | Perfil personal |
| `/app/ayuda` | FAQs y soporte |

---

## Separación landing pública / panel MIRA

La landing pública (`(public)`) y los paneles (`admin`, `app`) están completamente separados mediante grupos de rutas de Next.js. Cada uno tiene su propio `layout.tsx` con navegación, estilos y contexto de autenticación independientes.

El middleware (`middleware.ts`) gestiona el refresco de sesión en todas las rutas y redirige al login si el usuario no está autenticado al intentar acceder a rutas protegidas.

---

## Design System MIRA

El Design System MIRA está implementado en `src/components/mira/` como componentes React reutilizables. Usa tokens CSS custom definidos en Tailwind CSS v4.

### Componentes principales

| Componente | Uso |
|---|---|
| `MiraPageShell` | Contenedor de página con sidebar y header |
| `MiraPageHeader` | Cabecera de página con título y acciones |
| `MiraSidebar` | Navegación lateral |
| `MiraTable` | Tabla de datos con paginación |
| `MiraKpiCard` | Tarjeta de métrica / KPI |
| `MiraStatusBadge` | Badge de estado con colores semánticos |
| `MiraFilterBar` | Barra de filtros |
| `MiraFormCard` | Contenedor de formulario |
| `MiraSearchInput` | Input de búsqueda |
| `MiraSectionCard` | Sección con título |
| `MiraAreaChart` | Gráfico de área (Recharts) |
| `MiraDonut` | Gráfico donut (Recharts) |
| `MiraRankBars` | Barras horizontales de ranking |
| `MiraVerticalBars` | Barras verticales |

> No crear componentes con estilos ad-hoc fuera del Design System. Siempre reutilizar o extender los componentes `Mira*` existentes.

---

## Supabase como backend

Supabase actúa como backend completo:

- **PostgreSQL** — base de datos principal con 13 tablas y relaciones
- **Auth** — autenticación email+password con gestión de sesiones
- **Row Level Security (RLS)** — aislamiento de datos por organización
- **Server Actions** — toda la comunicación con Supabase se hace desde el servidor (nunca exponer `SUPABASE_SERVICE_ROLE_KEY` al cliente)

Ver [`DATABASE_OVERVIEW.md`](DATABASE_OVERVIEW.md) para el detalle del esquema.

---

## Coolify como plataforma de deploy

Coolify es la plataforma self-hosted que gestiona el despliegue containerizado de MIRA. El `Dockerfile` en la raíz del proyecto usa un build multistage optimizado para producción.

Ver [`DEPLOYMENT.md`](DEPLOYMENT.md) para el proceso completo de deploy.
