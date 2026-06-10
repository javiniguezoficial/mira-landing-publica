# MIRA — Plataforma de Inteligencia de Mercado

MIRA es un SaaS de monitorización de precios para mercados alimentarios y sectores anexos (embalajes, energía, materias primas). Permite a responsables de compras, *category managers*, CEOs y auditores consultar tendencias de precios, gestionar cotizaciones con proveedores y controlar el cumplimiento de compras en tiempo real.

---

## Índice

- [Stack tecnológico](#stack-tecnológico)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Módulos implementados](#módulos-implementados)
- [Requisitos previos](#requisitos-previos)
- [Variables de entorno](#variables-de-entorno)
- [Desarrollo local](#desarrollo-local)
- [Build de producción](#build-de-producción)
- [Deploy en Coolify](#deploy-en-coolify)
- [Roles y accesos](#roles-y-accesos)
- [Rama de trabajo](#rama-de-trabajo)

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | [Next.js 15](https://nextjs.org/) (App Router, Server Actions) |
| Lenguaje | TypeScript ~5.8 |
| Estilos | Tailwind CSS 4 + MIRA Design System (tokens CSS custom) |
| Base de datos / Auth | [Supabase](https://supabase.com/) (PostgreSQL + RLS + Auth) |
| Gráficos | [Recharts](https://recharts.org/) |
| Iconos | [Lucide React](https://lucide.dev/) |
| Editor de texto enriquecido | [Tiptap](https://tiptap.dev/) |
| Importación Excel/CSV | [xlsx](https://sheetjs.com/) |
| Mapa de proveedores | [Leaflet](https://leafletjs.com/) + [react-leaflet](https://react-leaflet.js.org/) |
| Deploy | [Coolify](https://coolify.io/) (self-hosted, Docker) |

---

## Estructura del proyecto

```
src/
├── app/
│   ├── (landing)/          # Páginas públicas (landing, login, registro…)
│   ├── admin/              # Panel de administración (platform_admin)
│   │   ├── clientes/
│   │   ├── usuarios/
│   │   ├── mercados/
│   │   ├── proveedores/
│   │   ├── rfqs/
│   │   ├── noticias/
│   │   ├── soporte/
│   │   ├── configuracion/
│   │   └── precios/importar/
│   └── app/                # Portal cliente (member)
│       ├── dashboard/
│       ├── market-intelligent/
│       ├── proveedores/
│       ├── rfqs/
│       ├── noticias/
│       ├── mi-organizacion/
│       ├── configuracion/
│       └── ayuda/
├── components/
│   ├── mira/               # MIRA Design System (MiraPageHeader, MiraTable, MiraStatusBadge…)
│   ├── admin/              # Componentes del panel admin
│   ├── app/                # Componentes del portal cliente
│   └── landing/            # Componentes de la landing pública
├── lib/
│   ├── actions/            # Server Actions (Next.js)
│   ├── queries/            # Queries Supabase reutilizables
│   ├── supabase/           # Cliente Supabase (server/client/middleware)
│   ├── miraButtons.ts      # Helpers de clases CSS del Design System
│   └── types/              # Tipos TypeScript compartidos
public/                     # Assets estáticos (requerido por Dockerfile)
```

---

## Módulos implementados

### Portal Administrador (`/admin`)
- **Dashboard** — métricas globales de la plataforma (clientes, RFQs, tickets, precios)
- **Clientes** — gestión de organizaciones, miembros y suscripciones
- **Usuarios** — listado y detalle de todos los perfiles de la plataforma
- **Mercados** — gestión de categorías, mercados y productos con precios históricos
- **Importar precios** — carga masiva de registros desde CSV/XLSX con validación y previsualización
- **Proveedores** — catálogo de proveedores con toggle de activación
- **RFQs** — gestión de solicitudes de cotización con respuestas por proveedor
- **Noticias** — CMS con editor Tiptap, imágenes y control de publicación
- **Soporte** — gestión de tickets con cambio de estado y respuesta al usuario
- **Configuración** — perfil del administrador y ajustes generales de la plataforma

### Portal Cliente (`/app`)
- **Dashboard** — resumen de organización, precios recientes y RFQs activas
- **Market Intelligence** — navegación por mercados y productos con tabla de precios históricos
- **Proveedores** — directorio de proveedores activos con mapa Leaflet y filtros
- **Cotizaciones (RFQs)** — creación y seguimiento de solicitudes de cotización
- **Noticias** — feed de noticias del sector publicadas por el admin
- **Mi organización** — datos de empresa, plan y miembros
- **Configuración** — perfil personal y preferencias
- **Ayuda y soporte** — FAQs y formulario de creación de tickets

### Landing pública
- Página de inicio con propuesta de valor
- Sección de mercados, planes, sobre nosotros
- Páginas legales (aviso legal, política de privacidad, política de cookies, términos)
- Flujo de registro, login, recuperación y cambio de contraseña

---

## Requisitos previos

- **Node.js** >= 20
- **npm** >= 10.8
- Proyecto [Supabase](https://supabase.com/) activo con el esquema de la plataforma aplicado
- Archivo `.env.local` configurado (ver sección siguiente)

---

## Variables de entorno

Crea un archivo `.env.local` en la raíz del proyecto con las siguientes variables:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# URL pública de la aplicación
NEXT_PUBLIC_APP_URL=http://localhost:3000   # En producción: https://tudominio.com
```

> **Nota:** Las variables `NEXT_PUBLIC_*` se incrustan en el bundle en tiempo de build. En Coolify, deben estar disponibles **tanto en buildtime como en runtime**. `SUPABASE_SERVICE_ROLE_KEY` solo se usa en el servidor y es suficiente con runtime, pero se recomienda incluirla también en build para evitar warnings.

---

## Desarrollo local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.local.example .env.local   # editar con tus valores

# 3. Arrancar el servidor de desarrollo
npm run dev
```

La aplicación estará disponible en [http://localhost:3000](http://localhost:3000).

**Cuentas demo (entorno de desarrollo):**

| Rol | Email | Contraseña |
|---|---|---|
| Administrador | `demo@mira.com` | `Demo1234!` |
| Cliente | `cliente@mira.com` | `Cliente1234!` |

---

## Build de producción

```bash
npm run build   # Compila y genera 30 rutas estáticas/dinámicas
npm start       # Sirve la build de producción en :3000
```

El build debe completarse con **0 errores** y **30/30 páginas** generadas.

---

## Deploy en Coolify

La aplicación se despliega con Docker en Coolify. El `Dockerfile` utiliza un build multistage:

1. **Builder** — instala dependencias con `npm ci` y ejecuta `npm run build`
2. **Runner** — imagen Node.js Alpine ligera que sirve la aplicación

**Variables de entorno en Coolify:**

| Variable | Buildtime | Runtime |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | — | ✅ |
| `NEXT_PUBLIC_APP_URL` | ✅ | ✅ |

**Demo:** [https://demo.mirapricing.com](https://demo.mirapricing.com)

---

## Roles y accesos

| Rol | Identificador | Acceso |
|---|---|---|
| Administrador de plataforma | `platform_admin` | Panel `/admin/*` completo |
| Cliente / Miembro | `member` | Portal `/app/*` — solo datos de su organización |

El aislamiento de datos se gestiona mediante **Row Level Security (RLS)** en Supabase. Cada organización solo puede acceder a sus propios datos.

---

## Rama de trabajo

| Rama | Descripción |
|---|---|
| `feat/saas-architecture` | Rama principal de desarrollo activo |
| `main` | Producción — no recibe push directo |
