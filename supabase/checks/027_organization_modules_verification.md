# Verificación de la migración 027 — Fase 1.4, configuración modular por cliente

**Este documento NO es un script ejecutable.** Es el registro de lo que se
verificó contra la base de datos al aplicar 027, con el SQL que se usó y el
resultado obtenido.

## Por qué esto es un `.md` y no un `.sql`

Los otros ficheros de `supabase/checks/` son `.sql` ejecutables. Este no, y la
razón es concreta.

Las pruebas de comportamiento necesitan **apagar los módulos de una organización
real** para comprobar que RLS deniega. En un fichero `.sql` eso quedaría
protegido únicamente por `begin;` … `rollback;` textuales, y esa protección
**no se sostiene** en las herramientas con las que realmente se ejecuta esto:

- el editor SQL de Supabase y el conector MCP envían las sentencias **una a
  una, en autocommit**. Los `begin;` / `rollback;` no llegan a agrupar nada, y
  cada `UPDATE` queda aplicado;
- un bloque `DO` con subtransacciones **tampoco revierte** por sí solo: sus
  `exception` capturan el error, pero lo que el bloque escribió fuera de esas
  subtransacciones se confirma igual.

Esto no es una hipótesis. Ocurrió durante la verificación de 027: el bloque que
valida el CHECK dejó **Acme con los dos módulos apagados** hasta que se
restauró. Ningún dato de negocio se alteró —RFQs, respuestas, perfiles y
pertenencias quedaron intactos—, pero un cliente real estuvo unos minutos sin
Cotizaciones ni Market Intelligence.

Un fichero que puede dejar a un cliente sin producto si alguien lo ejecuta sin
leerlo entero no debe estar en el repositorio con extensión `.sql`. La cobertura
automatizada de este bloque vive en
[`src/lib/auth/modules.test.ts`](../../src/lib/auth/modules.test.ts) y
[`src/lib/auth/modules-authorization.test.ts`](../../src/lib/auth/modules-authorization.test.ts),
que se ejecutan en cada `npm run test:run` sin tocar nada.

### Si necesitas volver a ejecutar estas pruebas

1. Hazlo contra una **rama de base de datos** o un entorno de pruebas, nunca
   contra producción.
2. Ejecuta cada bloque **completo, en una sola sentencia**, no línea a línea.
3. Al terminar, comprueba y restaura el estado con el bloque G.

## Identidades

Se reutilizan los registros reales; no se crea ningún usuario en Auth. Los
identificadores ya figuran en el repositorio (`src/lib/auth/access.test.ts` y
`6B5_profile_status_capability_check.sql`) y son necesarios para reproducir.

| | UUID | Papel |
|---|---|---|
| ANA | `ef9f8075-f79f-4cde-8d4c-5e48df0b88e6` | owner de Acme, `can_buy=true` |
| JAVIER | `867e813e-4ec3-4759-be0e-e861d9e90df0` | `platform_admin` |
| ACME | `35fe4e45-f546-415e-b2e1-01017c200f7f` | `active`, `buyer` |

Las 3 RFQs reales están en `open` y no se modifican en ningún momento. No se usa
`service_role` en ninguna prueba de comportamiento.

---

## A. Estructura — solo lecturas, sin riesgo

### A.1 La columna existe, es NOT NULL y trae el default con ambos módulos activos

```sql
select column_name, data_type, is_nullable, column_default,
       (data_type = 'jsonb'
        and is_nullable = 'NO'
        and column_default like '%markets%true%quotes%true%') as ok
from information_schema.columns
where table_schema = 'public' and table_name = 'organizations' and column_name = 'modules';
```

**Resultado:** `jsonb`, `NO`, default `'{"markets": true, "quotes": true}'::jsonb` → **ok**.

### A.2 `org_module_enabled` cumple la forma del resto de funciones de autorización

```sql
select p.proname,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ', '), '(NINGUNO)') as search_path,
       case p.provolatile when 's' then 'stable' else 'OTRA' end as volatilidad,
       has_function_privilege('anon',          p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'org_module_enabled';
```

**Resultado:** `security definer`, `search_path=public`, `stable`, `anon=false`,
`authenticated=true` → **ok**.

### A.3 Las cuatro policies de organización comprueban el módulo; las administrativas no

```sql
select tablename, policyname, cmd,
       (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%org_module_enabled%' as comprueba_modulo
from pg_policies
where schemaname = 'public' and tablename in ('rfqs', 'rfq_responses')
order by tablename, policyname;
```

**Resultado:**

| Policy | Comprueba módulo |
|---|---|
| `rfqs.org_member_select_rfqs` | ✅ |
| `rfqs.org_member_insert_rfqs` | ✅ |
| `rfqs.org_member_update_rfqs` | ✅ |
| `rfq_responses.org_member_select_rfq_responses` | ✅ |
| `rfqs.admin_select_rfqs` / `admin_insert_rfqs` / `admin_update_rfqs` | ❌ (bypass intencional) |
| `rfq_responses.admin_all_rfq_responses` | ❌ (bypass intencional) |

### A.4 El trigger protege ahora también `modules`

```sql
select (pg_get_functiondef(p.oid) like '%new.modules%is not distinct from%old.modules%') as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'protect_organization_columns';
```

**Resultado:** **true**.

### A.5 El total de policies no cambia: 027 reemplaza, no añade

```sql
select count(*) as policies, (count(*) = 53) as ok
from pg_policies where schemaname = 'public';
```

**Resultado:** 53 → **ok**.

---

## B. El CHECK rechaza toda forma inválida

> ⚠️ **Este bloque escribe.** Es el que dejó Acme con ambos módulos apagados.
> Los tres primeros casos son los que dejaba pasar la versión inicial del CHECK:
> un CHECK que evalúa a `NULL` **se acepta**, y `jsonb_typeof` de una clave
> ausente devuelve `NULL`. De ahí los `coalesce` de la restricción definitiva.
> Para repetirlo sin riesgo, usa una tabla temporal con el mismo constraint en
> lugar de `public.organizations`.

```sql
-- Se probaron 11 formas inválidas y las 4 combinaciones válidas, cada una con
-- un UPDATE sobre organizations dentro de una subtransacción que captura el
-- error y anota si fue rechazada.
```

**Resultado — 11/11 formas inválidas rechazadas:**

| Valor | Rechazado |
|---|---|
| `{"markets": true}` (falta `quotes`) | ✅ |
| `{"quotes": true}` (falta `markets`) | ✅ |
| `{}` | ✅ |
| `{"markets": "true", "quotes": true}` (string) | ✅ |
| `{"markets": 1, "quotes": true}` (número) | ✅ |
| `{"markets": null, "quotes": true}` (null JSON) | ✅ |
| `{"markets": true, "quotes": true, "suppliers": true}` (clave extra) | ✅ |
| `[]`, `"markets"`, `5`, `null` (no es objeto) | ✅ |

**Y 4/4 combinaciones válidas aceptadas:** las cuatro permutaciones de
`{markets, quotes}` con booleanos.

---

## C. Comportamiento con `quotes = false` — lectura

> ⚠️ Este bloque escribe. Ejecutar completo, en una sola sentencia.

```sql
begin;
  update public.organizations
     set modules = '{"markets": true, "quotes": false}'::jsonb
   where id = '35fe4e45-f546-415e-b2e1-01017c200f7f';

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';

  select org_module_enabled('35fe4e45-f546-415e-b2e1-01017c200f7f', 'quotes')     as fn_quotes,
         org_module_enabled('35fe4e45-f546-415e-b2e1-01017c200f7f', 'markets')    as fn_markets,
         org_module_enabled('35fe4e45-f546-415e-b2e1-01017c200f7f', 'suppliers')  as fn_desconocido,
         org_module_enabled('00000000-0000-0000-0000-000000000000', 'quotes')     as fn_org_inexistente,
         can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f')                   as can_buy_intacto,
         is_org_member('35fe4e45-f546-415e-b2e1-01017c200f7f')                    as sigue_miembro,
         (select count(*) from public.rfqs)                                       as rfqs_visibles,
         (select count(*) from public.rfq_responses)                              as respuestas;
rollback;
```

**Resultado:**

| Campo | Valor | Lectura |
|---|---|---|
| `fn_quotes` | `false` | módulo apagado |
| `fn_markets` | `true` | el otro eje no se ve afectado |
| `fn_desconocido` | `false` | módulo desconocido → fail-closed |
| `fn_org_inexistente` | `false` | organización inexistente → fail-closed |
| `can_buy_intacto` | `true` | **la capacidad personal no se toca** |
| `sigue_miembro` | `true` | la pertenencia no se toca |
| `rfqs_visibles` | **0** (eran 3) | RLS vacía el histórico |
| `respuestas` | **0** (eran 2) | y las ofertas de proveedores |

---

## D. Comportamiento con `quotes = false` — escritura por PostgREST directo

> ⚠️ Este bloque escribe. Ejecutar completo, en una sola sentencia.

Se intentaron, suplantando a Ana con sus claims reales y sin pasar por la
aplicación: insertar una RFQ, cancelar en masa las cotizaciones abiertas (el
vector que cerró la migración 025) y que la propia persona **owner** se
reactivara los módulos.

**Resultado:**

| Prueba | Bloqueado | Detalle |
|---|---|---|
| `INSERT` de RFQ | ✅ | `42501` — RLS (`org_member_insert_rfqs`) |
| `UPDATE rfqs open → cancelled` | ✅ | 0 filas: RLS ni siquiera las hace visibles |
| **OWNER se reactiva `modules`** | ✅ | `42501` — trigger `protect_organization_columns` |

La tercera es la que cierra el vector real: `org_owner_update` da a la persona
propietaria UPDATE sobre su propia organización, así que sin el trigger habría
podido reactivarse el módulo con un PATCH directo.

---

## E. El bypass administrativo se preserva (intencional)

> ⚠️ Este bloque escribe. Ejecutar completo, en una sola sentencia.

Con **ambos** módulos apagados, suplantando al `platform_admin`:

**Resultado:** `es_admin=true`, **3 RFQs** y **2 respuestas** visibles.

Es deliberado y necesario: quien apaga el módulo es el administrador, y tiene
que poder seguir dando soporte, auditar y reactivarlo. Está documentado en la
propia migración 027.

---

## F. Los dos ejes son independientes

> ⚠️ Este bloque escribe. Ejecutar completo, en una sola sentencia.

Un `platform_admin` cambia los módulos a `{"markets": false, "quotes": true}`
por la misma vía que usa la Server Action `setOrganizationModules` (cliente
normal, sujeto a RLS, sin `service_role`); después se consulta como Ana.

**Resultado:**

| Campo | Valor |
|---|---|
| `fn_markets` | `false` |
| `fn_quotes` | `true` |
| `rfqs` | **3** — vuelven, intactas |
| `respuestas` | **2** — intactas |
| `mercados` | 124 |
| `precios` | 608 |

### Limitación conocida y deliberada

`mercados` y `precios` **siguen siendo legibles** con `markets = false`. Las
tablas de catálogo (`markets`, `products`, `product_price_records`,
`market_categories`, `strategic_markets`) son **globales**: sus policies
`client_read_*` no dependen de la organización, así que no hay un
`organization_id` sobre el que aplicar el módulo.

Market Intelligence se apaga en la **capa de aplicación** (guard por página),
que es exactamente lo que pide 1.4 para ese módulo —enlace visible, pantalla
informativa—, mientras que Cotizaciones sí exigía bloqueo en SQL, que es lo que
verifican C y D. Llevar el módulo a RLS en el catálogo global sería otro bloque,
con su propio modelo de datos.

---

## G. Estado final esperado

```sql
select id, name, status, modules from public.organizations;
```

**Debe devolver:** Acme `status=active`,
`modules={"markets": true, "quotes": true}`.

Si no es así, alguien ha ejecutado los bloques B–F sin que revirtieran.
Restaurar con:

```sql
update public.organizations
   set modules = '{"markets": true, "quotes": true}'::jsonb
 where id = '35fe4e45-f546-415e-b2e1-01017c200f7f';
```
