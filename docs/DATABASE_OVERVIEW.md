# Base de datos — Plataforma MIRA

> **ADVERTENCIA CRÍTICA:** No modificar el esquema, las políticas RLS ni los triggers existentes sin revisión y aprobación explícita del equipo principal. Un error en RLS puede exponer datos de un cliente a otro cliente. Las migraciones aplicadas en producción son difíciles de revertir.

---

## Motor y plataforma

- **Motor:** PostgreSQL (gestionado por Supabase)
- **Plataforma:** [Supabase](https://supabase.com/)
- **Seguridad:** Row Level Security (RLS) activa en todas las tablas de datos de usuario
- **Autenticación:** Supabase Auth (tabla `auth.users` gestionada por Supabase)

---

## Migraciones aplicadas

| Archivo | Contenido |
|---|---|
| `001_initial_identity_auth_roles.sql` | Plans, Organizations, Profiles, Organization Members, Subscriptions, RLS base |
| `002_markets_categories_products.sql` | Market Categories, Markets, Products |
| `003_product_price_records.sql` | Price Records (histórico de precios) |
| `004_rfqs.sql` | RFQs (solicitudes de cotización) |
| `005_rfq_responses.sql` | RFQ Responses (respuestas de proveedores) |
| `006_suppliers.sql` | Suppliers (proveedores) |
| `007_news.sql` | News (noticias del sector) |
| `008_profiles_same_org_read.sql` | Políticas de lectura de perfiles dentro de la misma organización |

---

## Tablas principales

### `plans`
Planes de suscripción disponibles en la plataforma.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | Nombre del plan |
| `slug` | text | `starter`, `business`, `enterprise` |
| `price_monthly` | numeric | Precio mensual |
| `price_annual` | numeric | Precio anual |
| `max_users` | int | Máximo de usuarios por organización |
| `max_rfqs_month` | int | Máximo de RFQs al mes |
| `has_ai` | boolean | Acceso a funcionalidades de IA |
| `has_api` | boolean | Acceso a la API |
| `has_history` | boolean | Acceso al histórico de precios |
| `is_active` | boolean | Plan activo/inactivo |

> Esta tabla existe pero los precios comerciales no están implementados en la UI. La empresa externa gestionará los estados de suscripción reales mediante Stripe.

---

### `organizations`
Empresas cliente de la plataforma.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | Nombre de la organización |
| `cif_nif` | text | CIF/NIF |
| `type` | text | `fisica` / `juridica` |
| `sector` | text | Sector de actividad |
| `country` | text | País (default `ES`) |
| `phone` | text | Teléfono |
| `plan_id` | uuid | FK → `plans.id` |
| `is_active` | boolean | Organización activa |
| `created_at` | timestamptz | Fecha de creación |

---

### `profiles`
Perfiles de usuario vinculados a `auth.users` de Supabase.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid | PK = `auth.users.id` |
| `full_name` | text | Nombre completo |
| `avatar_url` | text | URL del avatar |
| `role` | text | `platform_admin` / `member` |
| `organization_id` | uuid | FK → `organizations.id` |
| `created_at` | timestamptz | Fecha de creación |

> El campo `role` determina el acceso a `/admin` (platform_admin) o `/app` (member). No modificar la lógica de roles sin revisión.

---

### `organization_members`
Relación entre usuarios y organizaciones (permite múltiples miembros por organización).

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | FK → `organizations.id` |
| `user_id` | uuid | FK → `auth.users.id` |
| `role` | text | Rol dentro de la organización |
| `created_at` | timestamptz | Fecha de alta |

---

### `subscriptions`
Suscripciones activas de organizaciones a planes.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | FK → `organizations.id` |
| `plan_id` | uuid | FK → `plans.id` |
| `status` | text | Estado de la suscripción |
| `current_period_start` | timestamptz | Inicio del período actual |
| `current_period_end` | timestamptz | Fin del período actual |
| `created_at` | timestamptz | Fecha de creación |

> La empresa externa extenderá esta tabla o creará tablas nuevas para integrar los estados reales de Stripe.

---

### `market_categories`
Categorías de mercado (ej. Frutas, Verduras, Proteínas).

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | Nombre de la categoría |
| `slug` | text | Slug URL-friendly |
| `description` | text | Descripción |
| `created_at` | timestamptz | Fecha de creación |

---

### `markets`
Mercados específicos dentro de una categoría (ej. Mercado de Frutas de Valencia).

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid | PK |
| `category_id` | uuid | FK → `market_categories.id` |
| `name` | text | Nombre del mercado |
| `slug` | text | Slug URL-friendly |
| `description` | text | Descripción |
| `is_active` | boolean | Mercado activo |
| `created_at` | timestamptz | Fecha de creación |

---

### `products`
Productos dentro de un mercado (ej. Manzana Golden, Naranja Valencia).

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid | PK |
| `market_id` | uuid | FK → `markets.id` |
| `name` | text | Nombre del producto |
| `slug` | text | Slug URL-friendly |
| `unit` | text | Unidad de medida (kg, t, etc.) |
| `description` | text | Descripción |
| `is_active` | boolean | Producto activo |
| `created_at` | timestamptz | Fecha de creación |

---

### `product_price_records`
Histórico de precios por producto. **Tabla de alto volumen** — diseñada para 300.000+ registros.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid | PK |
| `product_id` | uuid | FK → `products.id` |
| `price` | numeric | Precio en la unidad del producto |
| `price_min` | numeric | Precio mínimo del período |
| `price_max` | numeric | Precio máximo del período |
| `recorded_at` | timestamptz | Fecha del registro de precio |
| `source` | text | Fuente del dato (lonja, MAPA, etc.) |
| `notes` | text | Notas adicionales |
| `created_at` | timestamptz | Fecha de inserción |

> **Importante:** Esta tabla necesitará índices en `product_id` y `recorded_at` cuando el volumen crezca. No añadir índices sin revisión — tienen coste en escritura.

---

### `rfqs`
Solicitudes de cotización (Request For Quotation) creadas por clientes.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | FK → `organizations.id` |
| `created_by` | uuid | FK → `auth.users.id` |
| `title` | text | Título de la RFQ |
| `description` | text | Descripción detallada |
| `status` | text | Estado (open, in_progress, closed, etc.) |
| `deadline` | date | Fecha límite de respuesta |
| `created_at` | timestamptz | Fecha de creación |

---

### `rfq_responses`
Respuestas de proveedores a las RFQs.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid | PK |
| `rfq_id` | uuid | FK → `rfqs.id` |
| `supplier_id` | uuid | FK → `suppliers.id` |
| `price` | numeric | Precio ofertado |
| `notes` | text | Notas de la oferta |
| `status` | text | Estado de la respuesta |
| `created_at` | timestamptz | Fecha de respuesta |

---

### `suppliers`
Proveedores registrados en la plataforma.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | Nombre del proveedor |
| `description` | text | Descripción |
| `sector` | text | Sector de actividad |
| `city` | text | Ciudad |
| `country` | text | País |
| `lat` | numeric | Latitud (para mapa Leaflet) |
| `lng` | numeric | Longitud (para mapa Leaflet) |
| `website` | text | Web del proveedor |
| `is_active` | boolean | Proveedor activo |
| `created_at` | timestamptz | Fecha de creación |

---

### `news`
Noticias del sector publicadas por el administrador.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid | PK |
| `title` | text | Título |
| `slug` | text | Slug URL-friendly |
| `content` | text | Contenido HTML (editor Tiptap) |
| `excerpt` | text | Resumen breve |
| `cover_image_url` | text | URL imagen de portada |
| `published` | boolean | Publicado / borrador |
| `published_at` | timestamptz | Fecha de publicación |
| `created_at` | timestamptz | Fecha de creación |

---

### Tickets de soporte

Gestionados en la interfaz de soporte del admin y cliente. Estructura interna — consultar el código en `src/lib/queries/support.ts` para el esquema actual.

---

## Row Level Security (RLS)

Todas las tablas con datos de usuario tienen RLS activada. Las políticas garantizan que:

- Los clientes (`member`) solo ven datos de su propia organización
- Los administradores (`platform_admin`) tienen acceso completo
- Los usuarios anónimos no tienen acceso a ningún dato

**Regla fundamental:** No modificar, desactivar ni añadir políticas RLS sin revisión del equipo principal. Un error puede exponer datos de un cliente a otro.

---

## Cómo proponer nuevas tablas (empresa externa)

Para proponer una tabla nueva relacionada con el módulo de billing o facturas, documentar lo siguiente antes de abrir el PR:

```markdown
### Propuesta de tabla: [nombre_tabla]

**Propósito:** [qué almacena y para qué se usa]

**Campos:**
| Campo | Tipo | Descripción | Requerido |
|---|---|---|---|
| id | uuid | PK | Sí |
| ... | ... | ... | ... |

**Relaciones:**
- FK con `organizations.id` (para aislar por organización)
- FK con `auth.users.id` (si aplica)

**Políticas RLS propuestas:**
- SELECT: [quién puede leer y con qué condición]
- INSERT: [quién puede insertar]
- UPDATE: [quién puede actualizar]
- DELETE: [quién puede borrar]

**Impacto en UI:**
- Páginas nuevas que usarán esta tabla
- Páginas existentes que se verán afectadas

**Migración propuesta:**
[SQL de la migración completa]

**Rollback:**
[SQL para revertir la migración si es necesario]
```

El equipo principal revisará la propuesta y dará aprobación antes de que se aplique.
