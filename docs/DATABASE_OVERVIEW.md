# Base de datos — Plataforma MIRA

> **ADVERTENCIA CRÍTICA:** No modificar el esquema, las políticas RLS ni los triggers existentes sin revisión y aprobación explícita del equipo principal. Un error en RLS puede exponer datos de un cliente a otro cliente. Las migraciones aplicadas en producción son difíciles de revertir.

> **Estado de este documento:** verificado contra el esquema real de producción el **2026-07-27**. Todas las tablas, columnas, restricciones y políticas descritas se han contrastado con `information_schema`, `pg_constraint`, `pg_indexes`, `pg_policies` y `pg_trigger`. Si modificas el esquema, actualiza también este documento en el mismo Pull Request.

---

## Motor y plataforma

- **Motor:** PostgreSQL 17.6 (gestionado por Supabase)
- **Proyecto:** `mira-pricing` — ref `wjyhssyeyytjgmqioqtf` (región `eu-central-2`)
- **Seguridad:** Row Level Security (RLS) **activa en las 20 tablas** del esquema `public`
- **Autenticación:** Supabase Auth (tabla `auth.users`, gestionada por Supabase)
- **Storage:** un único bucket, `news-images` (público), usado por el CMS de noticias

---

## Historial de migraciones y reconciliación

### Cómo se han aplicado las migraciones

Este proyecto **no está inicializado como proyecto de Supabase CLI**: no existe `supabase/config.toml` ni ningún artefacto de la CLI en el repositorio. Las migraciones se han aplicado desde herramientas que registran cada una en `supabase_migrations.schema_migrations` con:

- una **`version`** = marca de tiempo de 14 dígitos generada automáticamente (p. ej. `20260605144203`),
- un **`name`** = etiqueta legible elegida a mano (p. ej. `009_platform_settings`),
- el **SQL completo** en la columna `statements`.

Los archivos de `supabase/migrations/` son, por tanto, un **archivo histórico mantenido a mano**, no un directorio gestionado por la CLI.

### El problema detectado (2026-07-27)

1. **Tres migraciones aplicadas en producción no estaban en el repositorio:** `009_platform_settings`, `010_profile_preferences` y `011_support_tickets`. Sus objetos (`platform_settings`, `support_tickets`, las columnas de preferencias de `profiles`) sí se usan en el código de la aplicación. Un entorno creado únicamente a partir del repositorio habría arrancado roto.

2. **Colisión histórica de numeración.** Las tres migraciones anteriores se aplicaron el **2026-06-05**. Diez días después, el **2026-06-15**, se aplicaron otras tres reutilizando los mismos prefijos `009`, `010` y `011`:

   | Prefijo | Aplicada 2026-06-05 (faltaba en repo) | Aplicada 2026-06-15 (sí estaba en repo) |
   |---|---|---|
   | `009` | `009_platform_settings` | `009_strategic_markets` |
   | `010` | `010_profile_preferences` | `010_products_extra_fields` |
   | `011` | `011_support_tickets` | `011_suppliers_extra_fields` |

   La causa es que el prefijo numérico se elegía manualmente mirando el contenido del repositorio; como los tres primeros nunca se versionaron, los números parecían libres. **El orden real de aplicación lo determina la `version` (timestamp), no el prefijo.**

### Cómo se ha reconciliado

Las tres migraciones ausentes se han recuperado **literalmente** desde `supabase_migrations.schema_migrations.statements` (el SQL exacto que se ejecutó, no una reconstrucción a partir del esquema) y se han añadido al repositorio con el nombre:

```
<version_real_del_historial_remoto>_<name_real_del_historial_remoto>.sql
```

| Archivo añadido | Version remota | Name remoto |
|---|---|---|
| `20260605144203_009_platform_settings.sql` | `20260605144203` | `009_platform_settings` |
| `20260605145422_010_profile_preferences.sql` | `20260605145422` | `010_profile_preferences` |
| `20260605153316_011_support_tickets.sql` | `20260605153316` | `011_support_tickets` |

**Por qué este nombre y no `018_…` o `009b_…`:** el prefijo es la versión real ya presente en el historial remoto. Si algún día el repositorio se enlaza con la Supabase CLI, la CLI leerá ese prefijo como versión, la encontrará ya registrada en `schema_migrations` y **marcará la migración como aplicada sin volver a ejecutarla**. Cualquier prefijo nuevo (`018`, `009b`, un timestamp inventado) habría creado una versión inexistente en remoto y la CLI habría intentado **reejecutar contra producción** un `create table` de una tabla que ya existe.

No se ha renombrado, editado ni reordenado **ningún** archivo de migración preexistente.

### ⚠️ Riesgo pendiente: los 17 archivos con prefijo secuencial

Los archivos `001_…` a `017_…` usan prefijos de 3 dígitos que **no se corresponden con ninguna `version` del historial remoto** (que son timestamps de 14 dígitos). Consecuencia: si alguien ejecutase `supabase link` + `supabase db push` sobre este repositorio, esos 17 archivos **no serían reconocidos como aplicados**.

Este riesgo **es anterior a la reconciliación y no se ha corregido en este bloque**, porque resolverlo exige renombrar migraciones ya aplicadas en producción, algo que está expresamente prohibido sin aprobación. Mitigación operativa vigente: **no usar `supabase db push` en este proyecto**. La reconciliación completa (renombrar los 17 archivos a su timestamp real, o usar `supabase migration repair`) debe planificarse como tarea propia y aprobarse antes de ejecutarse.

### Regla para futuras migraciones

1. **Nombrar siempre** `<timestamp UTC de 14 dígitos>_<descripcion_en_snake_case>.sql` (p. ej. `20260728093000_organization_settings.sql`). No reutilizar nunca prefijos secuenciales.
2. **Un número/timestamp jamás se reutiliza**, aunque el prefijo "parezca libre" en el repositorio.
3. **El archivo se versiona en el mismo Pull Request** en que se aplica la migración. Aplicar sin versionar es lo que provocó este incidente.
4. **Las migraciones ya aplicadas no se renombran ni se editan.** Si algo está mal, se corrige con una migración nueva encima.
5. Toda migración nueva requiere revisión y aprobación previa del equipo principal (ver plantilla al final de este documento).
6. Actualizar este documento en el mismo PR.

### Migraciones aplicadas (orden real de ejecución)

| # | Version | Name | Archivo en el repo |
|---|---|---|---|
| 1 | `20260604171040` | `001_initial_identity_auth_roles` | `001_initial_identity_auth_roles.sql` |
| 2 | `20260604202223` | `002_markets_categories_products` | `002_markets_categories_products.sql` |
| 3 | `20260605064432` | `003_product_price_records` | `003_product_price_records.sql` |
| 4 | `20260605074830` | `004_rfqs` | `004_rfqs.sql` |
| 5 | `20260605103305` | `005_rfq_responses` | `005_rfq_responses.sql` |
| 6 | `20260605104806` | `006_suppliers` | `006_suppliers.sql` |
| 7 | `20260605113111` | `007_news` | `007_news.sql` |
| 8 | `20260605123322` | `008_profiles_same_org_read` | `008_profiles_same_org_read.sql` |
| 9 | `20260605144203` | `009_platform_settings` | `20260605144203_009_platform_settings.sql` *(recuperada)* |
| 10 | `20260605145422` | `010_profile_preferences` | `20260605145422_010_profile_preferences.sql` *(recuperada)* |
| 11 | `20260605153316` | `011_support_tickets` | `20260605153316_011_support_tickets.sql` *(recuperada)* |
| 12 | `20260615210840` | `009_strategic_markets` | `009_strategic_markets.sql` |
| 13 | `20260615210846` | `010_products_extra_fields` | `010_products_extra_fields.sql` |
| 14 | `20260615210854` | `011_suppliers_extra_fields` | `011_suppliers_extra_fields.sql` |
| 15 | `20260616100225` | `012_unaccent_supplier_search` | `012_unaccent_supplier_search.sql` |
| 16 | `20260616104838` | `013_rfqs_extended_fields` | `013_rfqs_extended_fields.sql` |
| 17 | `20260703160536` | `014_rfq_request_text_fields` | `014_rfq_request_text_fields.sql` |
| 18 | `20260703183918` | `015_supplier_taxonomy` | `015_supplier_taxonomy.sql` |
| 19 | `20260704095902` | `016_search_suppliers_supplier_taxonomy` | `016_search_suppliers_supplier_taxonomy.sql` |
| 20 | `20260704144304` | `017_suppliers_production_range` | `017_suppliers_production_range.sql` |

> Al listar el directorio, los tres archivos recuperados aparecen **al final** (empiezan por `2`, no por `0`). Es cosmético: el orden real de ejecución es el de esta tabla.

---

## Funciones helper de seguridad

Tres funciones `SECURITY DEFINER` con `search_path = public` sobre las que se apoyan **todas** las políticas RLS. Al ser `SECURITY DEFINER` bypassan RLS y evitan la recursión infinita que provocaría una subconsulta sobre una tabla con RLS activa.

| Función | Devuelve |
|---|---|
| `is_platform_admin()` | ¿El usuario actual tiene `profiles.role = 'platform_admin'`? |
| `is_org_member(org_id uuid)` | ¿El usuario actual figura en `organization_members` de esa organización? |
| `is_org_owner(org_id uuid)` | ¿Y además con `role = 'client_owner'`? |

Funciones de trigger: `set_updated_at()` (refresca `updated_at`), `prevent_role_change()` (bloquea el cambio de `profiles.role` salvo a `platform_admin`, `postgres` o `service_role`), `handle_new_user()` (crea el `profile` tras cada alta en `auth.users`), `handle_ticket_resolved_at()` (gestiona `support_tickets.resolved_at`).

Función RPC: `search_suppliers(...)` — `SECURITY INVOKER`, respeta la RLS de `suppliers`.

---

# Identidad y organizaciones

### `plans`
**Propósito:** catálogo de planes de suscripción. **PK:** `id`.
**Relaciones:** referenciada por `organizations.plan_id` y `subscriptions.plan_id`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `name` | text NOT NULL | Nombre comercial |
| `slug` | text NOT NULL UNIQUE | **CHECK:** `starter` · `business` · `enterprise` |
| `price_monthly` / `price_annual` | numeric(10,2) | CHECK `>= 0`. Nulos en Enterprise |
| `max_users` | int | CHECK `> 0`. Nulo = ilimitado |
| `max_rfqs_month` | int | CHECK `> 0`. Nulo = ilimitado |
| `has_ai` / `has_api` / `has_history` | boolean NOT NULL | Flags de funcionalidad |
| `is_active` | boolean NOT NULL | |
| `created_at` | timestamptz NOT NULL | |

**RLS:** lectura **pública sin autenticar** de los planes activos (`plans_public_read`, necesaria para la sección Pricing de la landing); control total para `platform_admin`.

> ⚠️ Los campos `max_users`, `max_rfqs_month` y `has_*` **no se consultan en ningún punto del código**. Hoy son declarativos: no imponen ningún límite real.

---

### `organizations`
**Propósito:** empresas cliente. **PK:** `id`.
**Relaciones:** `plan_id` → `plans.id` (ON DELETE SET NULL). Referenciada por `organization_members`, `subscriptions`, `rfqs`, `support_tickets`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `name` | text NOT NULL | |
| `cif_nif` | text | |
| `type` | text | **CHECK:** `fisica` · `juridica`. **Es la forma jurídica, no un rol comprador/vendedor** |
| `sector`, `annual_revenue_range`, `employee_count_range` | text | |
| `address`, `city`, `phone`, `email`, `website` | text | |
| `country` | text NOT NULL | Default `'ES'` |
| `plan_id` | uuid | FK → `plans` |
| `subscription_status` | text NOT NULL | **CHECK:** `trial` · `active` · `past_due` · `cancelled` · `expired`. Default `trial` |
| `subscription_start` / `subscription_end` | timestamptz | |
| `created_at` / `updated_at` | timestamptz NOT NULL | `updated_at` por trigger |

**RLS:** un miembro ve su organización (`is_org_member(id)`); solo `client_owner` puede actualizarla; `platform_admin` control total.

---

### `profiles`
**Propósito:** perfil de aplicación de cada usuario de `auth.users`. **PK:** `id` = `auth.users.id` (ON DELETE CASCADE).

> ❗ **Corrección respecto a versiones anteriores de este documento:** `profiles` **NO tiene columna `organization_id`**. La relación usuario ↔ organización vive **exclusivamente** en `organization_members`. Un usuario puede pertenecer a varias organizaciones, y un usuario recién registrado no pertenece a ninguna.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK, FK → `auth.users.id` CASCADE |
| `role` | text NOT NULL | **CHECK:** `platform_admin` · `client_owner` · `client_member`. Default `client_member` |
| `first_name`, `last_name`, `phone`, `avatar_url` | text | |
| `created_at` / `updated_at` | timestamptz NOT NULL | |
| `preferred_locale` | text NOT NULL | Default `'es'` — añadida en `010_profile_preferences` |
| `preferred_currency` | text NOT NULL | Default `'EUR'` — añadida en `010_profile_preferences` |
| `preferred_country` | text NOT NULL | Default `'ES'` — añadida en `010_profile_preferences` |

**Triggers:** `profiles_updated_at` (`set_updated_at`) y `profiles_prevent_role_change` (impide auto-promoción de rol).
**Alta automática:** el trigger `on_auth_user_created` sobre `auth.users` ejecuta `handle_new_user()`, que inserta el perfil con `role = 'client_member'` y copia `first_name` / `last_name` desde los metadatos del registro.

**RLS:** cada usuario lee y actualiza **su** perfil; los miembros de una misma organización se leen entre sí (`profiles_same_org_select`); `platform_admin` control total.

> ⚠️ `role` distingue el **rol global** (acceso a `/admin` vs `/app`). El **rol dentro de una organización** es un campo distinto, en `organization_members`. No confundirlos. El valor global `client_owner` existe en el CHECK pero la aplicación nunca lo asigna.

---

### `organization_members`
**Propósito:** pertenencia de un usuario a una organización, con su rol en ella. **PK:** `id`. **UNIQUE:** `(organization_id, user_id)`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid NOT NULL | FK → `organizations` CASCADE |
| `user_id` | uuid NOT NULL | FK → `profiles` CASCADE |
| `role` | text NOT NULL | **CHECK:** `client_owner` · `client_member`. Default `client_member` |
| `invited_by` | uuid | FK → `profiles` SET NULL |
| `joined_at` | timestamptz NOT NULL | |

**RLS:** los miembros de una organización se ven entre sí; solo `client_owner` inserta y elimina miembros (y **no puede eliminarse a sí mismo**, evitando organizaciones sin propietario); `platform_admin` control total.

---

### `subscriptions`
**Propósito:** histórico de suscripciones de una organización a un plan. **PK:** `id`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid NOT NULL | FK → `organizations` CASCADE |
| `plan_id` | uuid NOT NULL | FK → `plans` RESTRICT |
| `status` | text NOT NULL | **CHECK:** `trial` · `active` · `past_due` · `cancelled` · `expired` |
| `billing_cycle` | text | **CHECK:** `monthly` · `annual` |
| `started_at` / `ended_at` | timestamptz | |
| `notes` | text | |
| `created_by` | uuid | FK → `profiles` SET NULL |
| `created_at` | timestamptz NOT NULL | |

**RLS:** `client_owner` puede leer el histórico de su organización; solo `platform_admin` escribe.

> ⚠️ Tabla **vacía y sin uso en el código**. El estado de suscripción real se lee de forma desnormalizada desde `organizations.subscription_status`.

---

# Pricing

Jerarquía de cuatro niveles: `strategic_markets` → `market_categories` → `markets` → `products`, y sobre ella el histórico `product_price_records`.

### `strategic_markets`
**Propósito:** nivel superior de segmentación comercial. **PK:** `id`. **UNIQUE:** `slug`.
Campos: `name`, `slug`, `description`, `icon`, `sort_order` (NOT NULL, default 0), `is_active`, `created_at`, `updated_at`.
**RLS:** `platform_admin` control total; cualquier usuario autenticado lee los activos.

### `market_categories`
**Propósito:** categorías de mercado. **PK:** `id`. **UNIQUE:** `slug`.
**Relaciones:** `strategic_market_id` → `strategic_markets.id` (**nullable**, ON DELETE SET NULL). Una categoría sin mercado estratégico se agrupa en la UI bajo "Otros mercados".
Campos: `name`, `slug`, `description`, `icon`, `sort_order`, `is_active`, `created_at`, `updated_at`.
**RLS:** admin total; autenticado lee las activas.

### `markets`
**Propósito:** mercados concretos dentro de una categoría. **PK:** `id`. **UNIQUE:** `(category_id, slug)`.
**Relaciones:** `category_id` → `market_categories.id` (NOT NULL, ON DELETE RESTRICT).
Campos: `name`, `slug`, `description`, `country_scope` (NOT NULL, default `'ES'`), `is_active`, `created_at`, `updated_at`.
**RLS:** admin total; autenticado lee los activos **cuya categoría también esté activa**.

### `products`
**Propósito:** referencias concretas dentro de un mercado. **PK:** `id`. **UNIQUE:** `(market_id, slug)`.
**Relaciones:** `market_id` → `markets.id` (NOT NULL, ON DELETE RESTRICT).

| Campo | Tipo | Notas |
|---|---|---|
| `name`, `slug` | text NOT NULL | |
| `unit` | text NOT NULL | Default `'kg'` |
| `description` | text | |
| `is_active` | boolean NOT NULL | |
| `lonja` | text | Lonja/mercado de referencia — **texto libre, no hay tabla `lonjas`** |
| `variedad`, `calibre`, `incoterm`, `tipo` | text | Atributos añadidos en `010_products_extra_fields` |

**RLS:** admin total; autenticado lee los activos **con toda la cadena superior activa** (mercado y categoría).

> Los cinco campos anteriores alimentan los filtros por facetas de la pantalla de precios. Al ser texto libre, valores con distinta tipografía generan entradas de filtro duplicadas.

### `product_price_records`
**Propósito:** histórico de precios por referencia. **Tabla de alto volumen.** **PK:** `id`.
**Relaciones:** `product_id` → `products.id` (NOT NULL, ON DELETE CASCADE).

| Campo | Tipo | Notas |
|---|---|---|
| `product_id` | uuid NOT NULL | FK → `products` CASCADE |
| `source_id` | uuid | **Sin FK y sin tabla destino.** Columna reservada, hoy sin uso |
| `price` | numeric(12,4) NOT NULL | |
| `unit` | text NOT NULL | Unidad del registro (`kg`, `ton`, `MWh`…) |
| `currency` | text NOT NULL | Default `'EUR'` |
| `country` | text NOT NULL | Default `'ES'` |
| `region` | text | |
| `recorded_at` | **date** NOT NULL | Fecha del dato. **No hay campo de granularidad** (diaria/semanal/mensual/anual) |
| `min_price` / `max_price` / `avg_price` | numeric(12,4) | ❗ Nombres reales — **no** son `price_min`/`price_max` |
| `volume` | numeric(16,4) | |
| `metadata` | jsonb | Usado para `source_name` y `notes` de la importación |
| `created_at` / `updated_at` | timestamptz NOT NULL | |

**Índices:** `(product_id)`, `(product_id, recorded_at DESC)`, `(recorded_at DESC)`, `(country)`, `(product_id, country, recorded_at DESC)`.
**RLS:** admin total; autenticado lee los precios cuya cadena producto → mercado → categoría esté activa.

> ⚠️ **No existe ninguna restricción UNIQUE.** La prevención de duplicados en la importación se hace únicamente en la aplicación, comparando `product_id | recorded_at | country | region | unit`.

---

# Proveedores

`suppliers` mantiene en paralelo **dos clasificaciones**: una *legacy* de texto libre ligada a Pricing, y la **taxonomía propia** de cuatro niveles introducida en `015_supplier_taxonomy`, independiente de Pricing.

### `suppliers`
**Propósito:** catálogo de proveedores. **PK:** `id`.

| Grupo | Campos | Notas |
|---|---|---|
| Identidad | `name` (NOT NULL), `email`, `phone`, `website`, `tax_id` | **Ninguno es UNIQUE.** El único identificador único es `id` |
| Ubicación | `country` (NOT NULL, default `'ES'`), `region`, `city`, `postal_code`, `address`, `latitude`, `longitude` | ❗ Se llaman **`latitude` / `longitude`**, no `lat`/`lng`. En la UI `city` se muestra como "Localidad" y `region` como "Provincia" |
| Clasificación *legacy* | `category`, `family`, `subfamily` (texto libre), `market_id` → `markets.id` (SET NULL) | Se conservan sin backfill; la UI los marca como `legacy` |
| Taxonomía propia | `supplier_market_id`, `supplier_category_id`, `supplier_family_id`, `supplier_subfamily_id` | Todas nullable, ON DELETE SET NULL |
| Producción | `produccion` (texto libre), `produccion_value` (numeric), `produccion_unit` (`kg` / `TN`) | `produccion_value` se normalizó best-effort en `017`; alimenta el filtro de rango |
| Otros | `medida`, `notes`, `is_active` (NOT NULL), `created_at`, `updated_at` | |

**Índices:** `name`, `country`, `is_active`, `category`, `region`, `city`, `market_id`, los cuatro FK de taxonomía y `produccion_value`.
**RLS:** `platform_admin` control total; cualquier usuario **autenticado** lee los proveedores con `is_active = true` (no hay aislamiento por organización: el catálogo es común a toda la plataforma).

**Función de búsqueda:** `search_suppliers(...)` — `SECURITY INVOKER` (respeta la RLS anterior), normaliza con `unaccent(lower(...))` en ambos lados de la comparación, devuelve `total_count` vía `count(*) OVER()` y acepta `limit`/`offset`. El `ORDER BY s.name` está fijado dentro de la función. `EXECUTE` concedido solo al rol `authenticated`.

### `supplier_markets` → `supplier_categories` → `supplier_families` → `supplier_subfamilies`
**Propósito:** taxonomía de proveedores **independiente de Pricing**. Cada nivel tiene `id` (PK), `name`, `slug`, `sort_order` (NOT NULL, default 0), `is_active`, `created_at`, `updated_at`.

| Tabla | FK al nivel superior | UNIQUE |
|---|---|---|
| `supplier_markets` | — | `slug` |
| `supplier_categories` | `supplier_market_id` NOT NULL → `supplier_markets` RESTRICT | `(supplier_market_id, slug)` |
| `supplier_families` | `supplier_category_id` NOT NULL → `supplier_categories` RESTRICT | `(supplier_category_id, slug)` |
| `supplier_subfamilies` | `supplier_family_id` NOT NULL → `supplier_families` RESTRICT | `(supplier_family_id, slug)` |

**RLS:** admin total en los cuatro niveles; el usuario autenticado lee los nodos activos **con toda la cadena superior activa**.

---

# RFQs

### `rfqs`
**Propósito:** solicitudes de cotización. **PK:** `id`.
**Relaciones:** `organization_id` → `organizations` CASCADE (NOT NULL) · `created_by` → `profiles` (NOT NULL) · `product_id` → `products` (**nullable** desde `013`).

**Modelo producto/servicio (migraciones `013` y `014`):** una RFQ describe lo solicitado en **texto libre**, sin depender del catálogo de Pricing.

| Campo | Tipo | Notas |
|---|---|---|
| `rfq_kind` | text NOT NULL | **CHECK:** `product` · `service`. Default `product` |
| `request_name` | text | **Único contenido realmente obligatorio.** Lo exige el CHECK `rfqs_request_name_check` |
| `request_description` | text | |
| `product_id`, `service_name`, `service_description`, `quantity`, `unit` | — | **Legacy/compatibilidad.** Todos nullable; ya no se validan contra el catálogo |
| `opening_date`, `deadline` (NOT NULL), `award_date`, `supply_start_date` | date | El orden cronológico se valida en la Server Action, no en la BD |
| `country` (NOT NULL), `region`, `delivery_location`, `incoterm` | text | |
| `estimated_volume`, `target_price`, `min_order` | numeric | |
| `purchase_frequency`, `unit_format`, `lead_time`, `payment_method`, `internal_code` | text | |
| `certifications` | text[] | |
| `sustainability_policy`, `technical_sheet_notes` | text | |
| `technical_sheet_url` | text | **URL escrita a mano.** No hay subida de adjuntos ni bucket de Storage asociado |
| `criticality` | text | **CHECK:** nulo · `alto` · `medio` · `bajo` |
| `sale_currency` | text NOT NULL | Default `'EUR'` |
| `custom_conditions` | jsonb NOT NULL | Default `'[]'`. Array de `{label, value, type}`. **Se trata siempre como dato, nunca se interpreta ni ejecuta** |
| `status` | text NOT NULL | **CHECK:** `draft` · `open` · `closed` · `awarded` · `cancelled`. Default `draft` |
| `notes`, `conditions` | text | |

**Restricción activa:** `rfqs_request_name_check` — exige `rfq_kind` válido y `request_name` no vacío. Sustituyó en `014` a `rfqs_kind_target_check`, que obligaba a informar `product_id` o `service_name`.

**RLS:** `platform_admin` puede SELECT/INSERT/UPDATE. El miembro de la organización lee las RFQ de su organización, inserta solo siendo el creador y con `request_name` no vacío, y actualiza **únicamente** las que estén en `draft` y haya creado él. **No existe política DELETE para clientes.**

### `rfq_responses`
**Propósito:** ofertas recibidas para una RFQ, introducidas manualmente por el administrador. **PK:** `id`.
**Relaciones:** `rfq_id` → `rfqs` CASCADE (NOT NULL) · `supplier_id` → `suppliers` (**ON DELETE SET NULL**, enlace opcional al catálogo).

| Campo | Tipo | Notas |
|---|---|---|
| `supplier_name` | text NOT NULL | **Snapshot**: se conserva aunque se borre el proveedor del catálogo |
| `supplier_email`, `supplier_phone` | text | Snapshot |
| `price` | numeric NOT NULL | CHECK `> 0` |
| `unit` | text NOT NULL | |
| `currency` | text NOT NULL | Default `'EUR'` |
| `delivery_date` | date | |
| `payment_terms`, `notes` | text | |
| `status` | text NOT NULL | **CHECK:** `received` · `shortlisted` · `rejected` · `accepted`. Default `received` |

**Índice único parcial:** `rfq_responses_one_accepted_per_rfq_idx` — como máximo **una** respuesta con `status = 'accepted'` por RFQ.
**RLS:** `platform_admin` control total; el miembro de la organización tiene **solo lectura** de las respuestas de sus propias RFQ. No existe portal de proveedor.

---

# Contenido, soporte y configuración

### `news`
**Propósito:** noticias del sector publicadas por el administrador. **PK:** `id`. **UNIQUE:** `slug`.
**Relaciones:** `market_id` → `markets` SET NULL · `product_id` → `products` SET NULL · `created_by` → `profiles` SET NULL.

| Campo | Tipo | Notas |
|---|---|---|
| `title` | text NOT NULL | |
| `slug` | text NOT NULL UNIQUE | |
| `excerpt` | text | |
| `content` | text NOT NULL | HTML del editor Tiptap |
| `status` | text NOT NULL | **CHECK:** `draft` · `published` · `archived`. Default `draft` |
| `category` | text | |
| `image_url` | text | Apunta al bucket público `news-images` |
| `published_at` | timestamptz | |

**RLS:** admin control total; el usuario autenticado lee **solo** las noticias con `status = 'published'` **y** `published_at` informado **y** no futuro.

### `support_tickets`
*(Recuperada en `20260605153316_011_support_tickets.sql`.)*
**Propósito:** tickets de soporte creados por los clientes. **PK:** `id`.
**Relaciones:** `organization_id` → `organizations` **SET NULL** (nullable: un usuario sin organización puede abrir ticket) · `user_id` → `profiles` **CASCADE** (NOT NULL).

| Campo | Tipo | Notas |
|---|---|---|
| `subject` | text NOT NULL | |
| `category` | text NOT NULL | **CHECK:** `account` · `data` · `prices` · `rfq` · `suppliers` · `billing` · `other` |
| `priority` | text NOT NULL | **CHECK:** `low` · `normal` · `high`. Default `normal` |
| `message` | text NOT NULL | |
| `status` | text NOT NULL | **CHECK:** `open` · `in_progress` · `resolved` · `closed`. Default `open` |
| `admin_response` | text | |
| `resolved_at` | timestamptz | Gestionado por trigger, no por la aplicación |
| `created_at` / `updated_at` | timestamptz NOT NULL | |

**Índices:** `status`, `user_id`, `organization_id`, `created_at DESC`.
**Triggers:** `set_updated_at_support_tickets` y `support_tickets_resolved_at` → `handle_ticket_resolved_at()`, que rellena `resolved_at` al pasar a `resolved`/`closed` y lo limpia al volver a `open`/`in_progress`.
**RLS:** admin control total; el cliente **inserta** solo tickets propios (`auth.uid() = user_id`, y si informa `organization_id` debe pertenecer a ella) y **lee** los suyos o los de su organización. **Sin UPDATE ni DELETE para clientes.**

### `platform_settings`
*(Recuperada en `20260605144203_009_platform_settings.sql`.)*
**Propósito:** ajustes generales de la plataforma. **PK:** `id`.

| Campo | Tipo | Notas |
|---|---|---|
| `platform_name` | text NOT NULL | Default `'MIRA'` |
| `support_email` | text | Mostrado en `/app/ayuda` |
| `default_country` | text NOT NULL | Default `'ES'` |
| `default_currency` | text NOT NULL | Default `'EUR'` |
| `maintenance_mode` | boolean NOT NULL | Default `false` |
| `created_at` / `updated_at` | timestamptz NOT NULL | |

**Patrón singleton:** el índice único `platform_settings_singleton ON platform_settings ((true))` garantiza **una sola fila** en toda la tabla. La migración inserta esa fila inicial.
**RLS:** cuatro políticas separadas (SELECT / INSERT / UPDATE / DELETE), todas restringidas a `is_platform_admin()`.

> ⚠️ **Ámbito global, no por organización.** No existe ninguna tabla de configuración por cliente ni de feature flags. Cualquier trabajo de "configuración modular por cliente" requiere una tabla nueva.

---

## Resumen de RLS

Las 20 tablas tienen RLS habilitada. Los patrones son tres:

| Patrón | Tablas | Regla |
|---|---|---|
| **Catálogo global** | `strategic_markets`, `market_categories`, `markets`, `products`, `product_price_records`, `suppliers`, `supplier_markets`, `supplier_categories`, `supplier_families`, `supplier_subfamilies`, `news` | `platform_admin` escribe; cualquier usuario **autenticado** lee lo activo/publicado, exigiendo que toda la cadena superior esté activa. **No hay aislamiento por organización.** |
| **Aislado por organización** | `organizations`, `organization_members`, `subscriptions`, `rfqs`, `rfq_responses`, `support_tickets` | El acceso pasa por `is_org_member()` / `is_org_owner()`. `platform_admin` control total. |
| **Solo administrador** | `platform_settings` | Únicamente `is_platform_admin()`. |

Excepciones a tener presentes:
- `plans` es la **única** tabla legible **sin autenticación** (solo los planes activos), porque la landing pública muestra los precios.
- `profiles` combina reglas: perfil propio + perfiles de la misma organización + acceso total del administrador.

---

## Riesgos conocidos y no corregidos

Detectados durante la reconciliación. **No se corrigen aquí** — este documento es de trazabilidad. Requieren su propia tarea y aprobación previa.

| Riesgo | Detalle |
|---|---|
| `bootstrap_first_platform_admin(uuid)` expuesta | Función `SECURITY DEFINER` ejecutable por los roles `anon` y `authenticated` vía `/rest/v1/rpc/`. Mitigada mientras exista al menos un `platform_admin` (aborta con excepción), pero es una vía de escalada de privilegios si alguna vez no queda ninguno. |
| Bucket `news-images` público con listado | Política SELECT amplia sobre `storage.objects` que permite **listar** todos los ficheros del bucket, no solo acceder a una URL conocida. |
| Funciones sin `search_path` | `set_updated_at()` y `handle_ticket_resolved_at()` se crearon sin `set search_path`. Ambas son `SECURITY INVOKER`, lo que reduce el impacto. |
| Protección de contraseñas filtradas desactivada | La comprobación contra HaveIBeenPwned está deshabilitada en Supabase Auth. Se activa desde el panel, sin cambio de esquema. |
| Sin UNIQUE en `product_price_records` | La prevención de duplicados es solo de aplicación. |
| Sin identificador de negocio en `suppliers` | `tax_id` y `email` están vacíos en todo el catálogo y `name` no es único. Bloquea cualquier actualización masiva por clave estable. |
| Los 17 archivos con prefijo secuencial | Ver "⚠️ Riesgo pendiente" en la sección de reconciliación. |

---

## Cómo proponer nuevas tablas

Antes de abrir el PR, documentar:

```markdown
### Propuesta de tabla: [nombre_tabla]

**Propósito:** [qué almacena y para qué se usa]

**Campos:**
| Campo | Tipo | Descripción | Requerido |
|---|---|---|---|
| id | uuid | PK | Sí |

**Relaciones:**
- FK con `organizations.id` (para aislar por organización)
- FK con `profiles.id` (si aplica)

**Políticas RLS propuestas:**
- SELECT / INSERT / UPDATE / DELETE: [quién y con qué condición]

**Impacto en UI:** [páginas nuevas y páginas afectadas]

**Migración propuesta:** [SQL completo, nombrado `<timestamp>_<descripcion>.sql`]

**Rollback:** [SQL para revertir]
```

El equipo principal revisará la propuesta y dará aprobación antes de que se aplique. Recuerda la regla 3: **el archivo se versiona en el mismo PR en que se aplica la migración.**
