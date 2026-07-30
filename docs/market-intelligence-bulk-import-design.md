# Importación masiva de precios por semana, mes y año — diseño técnico

**Estado: propuesta. No implementado.** Este documento es el punto 2.5 de la
Fase 2. Define cómo debería construirse el importador; no hay UI ni backend
productivo de importación asociado a él.

Lo que ya existe hoy en el repositorio es un importador puntual
(`src/lib/actions/import-prices.ts`, `ImportPriceForm.tsx`) pensado para cargas
manuales pequeñas. Este diseño describe lo que hace falta para cargas
periódicas reales.

---

## 0. El modelo con el que hay que trabajar

Antes de proponer nada, lo que hay medido en producción:

| Tabla | Filas | Notas |
|---|---|---|
| `strategic_markets` | 10 | Agrupador superior |
| `market_categories` | 39 | `strategic_market_id` nullable |
| `markets` | 129 (127 activos) | `category_id` obligatorio |
| `products` | 931 | `market_id` obligatorio; `slug` único por mercado |
| `product_price_records` | 608 | `recorded_at` es `date`; rango 2021-01-01 → 2026-07-01 |

Columnas de `product_price_records`: `product_id`, `source_id`, `price`, `unit`,
`currency`, `country`, `region`, `recorded_at`, `min_price`, `max_price`,
`avg_price`, `volume`, `metadata` (jsonb).

**Tres hechos que condicionan todo el diseño:**

1. **La lonja NO es una tabla.** Es `products.lonja`, texto libre: 930 de 931
   productos la tienen, con 102 valores distintos. Un producto tiene *una*
   lonja; la lonja no cuelga del registro de precio.
2. **`source_id` está huérfano.** La columna existe, **no tiene clave foránea**
   y **ninguna de las 608 filas la usa**. No hay tabla de fuentes.
3. **No hay unicidad en `product_price_records`.** No existe ninguna
   restricción que impida dos filas con el mismo producto y la misma fecha. Hoy
   se puede duplicar un precio sin que nada lo impida.

El punto 3 es el que hay que resolver **antes** de construir cualquier
importador: sin clave natural no hay upsert posible, y una reimportación
duplicaría el histórico entero.

---

## 1. Formatos de entrada

### MVP: CSV (UTF-8, separador `,`, comillas dobles)

Se elige CSV y no XLSX para el MVP porque se parsea en streaming sin
dependencias pesadas, es lo que exportan las lonjas y los boletines oficiales, y
no arrastra fórmulas, macros ni hojas múltiples.

**XLSX en la versión escalable**, con `SheetJS` o equivalente, leyendo solo la
primera hoja y convirtiendo a la misma estructura interna que el CSV, de forma
que la validación y la carga sean idénticas para ambos formatos.

### Columnas obligatorias

| Columna | Tipo | Ejemplo | Notas |
|---|---|---|---|
| `market_slug` | texto | `cereales-lleida` | Identifica el mercado |
| `product_slug` | texto | `trigo-blando-panificable` | Único **dentro** del mercado |
| `recorded_at` | fecha | `2026-07-27` | ISO-8601. Ver §4 |
| `price` | decimal | `241.50` | Punto decimal, sin separador de miles |
| `unit` | texto | `ton` | Ver §4 |
| `currency` | texto | `EUR` | ISO-4217 |
| `country` | texto | `ES` | ISO-3166-1 alfa-2 |

### Columnas opcionales

| Columna | Tipo | Notas |
|---|---|---|
| `min_price` | decimal | Debe cumplir `min ≤ price ≤ max` |
| `max_price` | decimal | |
| `avg_price` | decimal | |
| `volume` | decimal | |
| `region` | texto | Provincia o comarca |
| `lonja` | texto | **Solo informativa.** Ver §2 |
| `source` | texto | Nombre del boletín u organismo |
| `notes` | texto | Va a `metadata.notes` |

### Ejemplo

```csv
market_slug,product_slug,recorded_at,price,unit,currency,country,min_price,max_price,lonja,source
cereales-lleida,trigo-blando-panificable,2026-07-27,241.50,ton,EUR,ES,238.00,244.00,Mercolleida,Boletín Mercolleida 30/2026
cereales-lleida,cebada-pienso,2026-07-27,218.00,ton,EUR,ES,215.50,220.00,Mercolleida,Boletín Mercolleida 30/2026
porcino-nacional,cerdo-cebado-selecto,2026-07-27,1.482,kg,EUR,ES,,,Mercolleida,Boletín Mercolleida 30/2026
```

---

## 2. Identificación de entidades

### Mercado y producto: por `slug`, nunca por nombre ni por UUID

- **UUID**: obligaría a quien prepara el fichero a copiar identificadores
  internos. Inviable para un operativo semanal.
- **Nombre**: cambia (`"Trigo blando"` → `"Trigo blando panificable"`) y rompería
  todas las importaciones anteriores.
- **Slug**: estable, legible y ya tiene un índice único
  `products_market_slug_key (market_id, slug)`.

La resolución es en dos pasos: `market_slug` → `markets.id`, y luego
`(market_id, product_slug)` → `products.id`. Un `product_slug` repetido en
mercados distintos es legítimo y se resuelve sin ambigüedad.

### Lonja: informativa en el MVP

**`lonja` en el fichero NO se usa para identificar nada.** Es un atributo del
producto, ya almacenado en `products.lonja`, y la importación de precios no debe
modificarlo: si el CSV trae una lonja distinta a la del producto, se anota como
**aviso** en el resumen y se ignora.

Permitir que el importador reescribiera `products.lonja` significaría que un
error de tipografía en una columna opcional reasigna un producto a otra lonja y
altera retroactivamente cómo se agrupan sus precios.

### Fuente: `metadata`, no `source_id`

`source_id` no tiene FK ni tabla destino, así que en el MVP la fuente se guarda
en `metadata`:

```json
{ "source": "Boletín Mercolleida 30/2026", "import_batch_id": "…", "notes": "…" }
```

La tabla `price_sources` con FK real queda para la versión escalable (§10).

---

## 3. Duplicados

### Clave natural

```
(product_id, recorded_at, currency, unit)
```

Se incluyen `currency` y `unit` porque el mismo producto puede publicarse el
mismo día en `EUR/ton` y en `EUR/kg`, y son dos hechos distintos, no un
duplicado.

**No** se incluye `country` ni `region`: hoy `country` es constante por producto
en la práctica, y meter `region` en la clave permitiría cargar la misma
cotización dos veces con la provincia escrita de dos maneras.

### Requisito previo obligatorio

```sql
-- Migración necesaria ANTES del importador.
create unique index concurrently product_price_records_natural_key
  on public.product_price_records (product_id, recorded_at, currency, unit);
```

Hay que comprobar antes si existen duplicados y decidir con el cliente cuál
conservar. Sobre las 608 filas actuales:

```sql
select product_id, recorded_at, currency, unit, count(*)
from public.product_price_records
group by 1,2,3,4 having count(*) > 1;
```

### Estrategia: **upsert con actualización**

`on conflict (…) do update` sobre precio, min/max/avg, volumen, región y
`metadata`. Es lo que corresponde al caso real: las lonjas publican
rectificaciones, y una corrección debe sustituir al dato erróneo, no convivir
con él.

Alternativas descartadas: **rechazo** (obligaría a borrar a mano antes de
recargar) y **versionado** (una tabla de histórico de cambios es más de lo que
hoy se necesita; se reconsidera en §10).

El resumen debe distinguir **insertadas** de **actualizadas**: no es lo mismo
cargar una semana nueva que reescribir una ya cargada, y quien importa tiene que
verlo antes de confirmar.

---

## 4. Validaciones

### Fechas
- Formato ISO `YYYY-MM-DD` **estricto**. `27/07/2026` se rechaza: es ambiguo
  frente a `07/27/2026`, y adivinar la convención corrompe el histórico en
  silencio.
- Se interpreta como **fecha civil**, sin zona horaria — `recorded_at` es `date`.
  El parseo nunca debe pasar por `new Date(cadena).toISOString()`.
- Rechazo si es anterior a `2000-01-01` o posterior a **hoy + 1 año** (hay datos
  futuros legítimos hasta 2026-07-01, pero un `9999-12-31` es un error).

### Números
- Punto decimal. Una coma se **rechaza** en lugar de convertirse: `1,482` puede
  ser mil cuatrocientos ochenta y dos o uno coma cuatro ocho dos, y equivocarse
  altera el precio por mil.
- Sin separador de miles.
- `price > 0`.
- Si vienen `min_price` y `max_price`: `min ≤ price ≤ max`.
- `volume ≥ 0`.

### Moneda y unidad
- `currency`: allowlist ISO-4217 (`EUR`, `USD`, `GBP` son las que usa la UI hoy).
- `unit`: allowlist obtenida de los valores ya presentes en
  `product_price_records.unit`, más los que el cliente valide. Una unidad nueva
  **no bloquea** la importación pero se marca como aviso, para que no entre
  `Tn`/`TN`/`ton` como tres unidades distintas.

### Entidades desconocidas
- `market_slug` inexistente → **error de fila**.
- `product_slug` inexistente en ese mercado → **error de fila**.
- **El importador nunca crea mercados ni productos.** Un slug mal escrito
  crearía una referencia fantasma con su propio histórico, invisible para quien
  importó. Las altas se hacen desde la administración de mercados.

---

## 5. Flujo

```
1. SUBIDA          Selección de fichero + periodicidad (semana / mes / año)
                   Validación de tamaño, extensión y MIME antes de leer nada
                          ↓
2. PARSEO          CSV → filas tipadas. Cabecera obligatoria
                   Error inmediato si falta una columna obligatoria
                          ↓
3. VALIDACIÓN      Por fila: formato, rangos, resolución de slugs
                   Se resuelven TODOS los slugs en 2 consultas, no 2 por fila
                          ↓
4. PREVISUALIZACIÓN  ← PUNTO DE NO RETORNO. Nada escrito todavía
                   · N filas correctas (X nuevas, Y actualizaciones)
                   · N filas con error, con nº de línea y motivo
                   · N avisos (unidad nueva, lonja discrepante)
                   · Rango de fechas detectado y periodo que cubre
                          ↓
5. CONFIRMACIÓN    Solo si hay al menos una fila válida
                   Se decide qué hacer con las erróneas: omitir o cancelar
                          ↓
6. IMPORTACIÓN     Lotes de 500 filas, upsert por clave natural
                   Todo bajo un mismo `import_batch_id`
                          ↓
7. RESUMEN         Insertadas / actualizadas / omitidas / fallidas
                   CSV descargable con las filas rechazadas y su motivo
```

**El paso 4 no es opcional.** Importar a ciegas un fichero de una lonja es la
forma más fácil de meter 500 precios con la unidad equivocada.

---

## 6. Seguridad

| Riesgo | Mitigación |
|---|---|
| Acceso | Solo `platform_admin`, vía `requirePlatformAdmin('throw')`. Los precios son catálogo global: un cliente nunca importa |
| Tamaño | **5 MB** y **50.000 filas** en el MVP. Se comprueba antes de leer el contenido |
| Tipo | Extensión + MIME + inspección de la primera línea. No basta con la extensión |
| **Inyección de fórmulas** | Ver abajo |
| Ficheros temporales | El CSV se procesa **en memoria** y no se persiste. Si en la versión escalable se sube a Storage, bucket privado y borrado tras el proceso |
| Auditoría | Cada lote registra usuario, fecha, nombre de fichero, hash y recuentos (§9) |

### Inyección de fórmulas (CSV injection)

Una celda que empieza por `=`, `+`, `-`, `@`, tabulador o retorno de carro se
ejecuta como fórmula al abrir el fichero en Excel o LibreOffice. El vector aquí
no es la importación —esos valores fallarían la validación numérica— sino la
**exportación**: el CSV de filas rechazadas devuelve texto que vino del fichero
de entrada.

- **Al importar**: los campos de texto (`region`, `source`, `notes`) se rechazan
  si empiezan por uno de esos caracteres.
- **Al exportar**: toda celda de texto que empiece por uno de ellos se prefija
  con un apóstrofo (`'`).

Aplica igual a XLSX.

---

## 7. Rendimiento

Con 50.000 filas como techo del MVP:

| Estrategia | Veredicto |
|---|---|
| Fila a fila desde el servidor Next | ❌ 50.000 viajes. Inaceptable |
| **Lotes de 500 con `upsert`** | ✅ **MVP.** ~100 peticiones, cada una atómica |
| `COPY` a tabla de staging + `MERGE` | ⚠️ Lo más rápido, pero exige conexión directa a Postgres. La aplicación solo habla PostgREST |
| RPC con `jsonb` y bucle en PL/pgSQL | ✅ Escalable. Un `insert … select` desde `jsonb_to_recordset` con `on conflict` |
| Job asíncrono | Solo si se superan los 5 minutos de ejecución |

**Recomendación MVP:** lotes de 500 vía `upsert` de supabase-js. Simple,
observable y sin infraestructura nueva.

**Recomendación escalable:** una función `import_price_records(jsonb)` con
`security definer` que valide y haga el `on conflict do update` dentro de
PostgreSQL. Una sola llamada, transacción única y rollback real si algo falla —
que es la carencia principal del enfoque por lotes.

### Índices

Los existentes bastan para leer. Para la carga hace falta el índice único de la
clave natural (§3), que además es el que hace posible el `on conflict`.

**Aviso:** ese índice único se crea con `concurrently` para no bloquear la tabla,
y debe crearse **fuera** de una transacción de migración.

---

## 8. Periodicidad

El importador no agrega nada: **una fila del CSV es una fila de
`product_price_records`**. La periodicidad afecta a la validación, no al
almacenamiento.

| Modo | Qué se espera | Validación específica |
|---|---|---|
| **Semanal** | Fichero de un boletín, todas las fechas dentro de una misma semana ISO | Aviso si abarca más de 7 días |
| **Mensual** | Consolidación, una fila por producto y mes | Aviso si abarca más de un mes natural |
| **Anual** | Carga histórica inicial | Sin aviso de rango; se recomienda trocear por año |

**Decisión pendiente de validar con el cliente:** si un precio mensual se guarda
con `recorded_at` = primer día del mes (que es lo que sugieren los datos
actuales, con máximo en `2026-07-01`) o si hace falta una columna
`period_granularity` (`day` / `week` / `month`) para no mezclar en el mismo
gráfico una serie diaria con una mensual. **Recomendación:** añadir esa columna
antes de la primera carga mensual masiva; añadirla después obliga a reinterpretar
el histórico ya cargado.

---

## 9. Trazabilidad

```sql
create table public.price_import_batches (
  id            uuid primary key default gen_random_uuid(),
  imported_by   uuid not null references public.profiles(id) on delete set null,
  imported_at   timestamptz not null default now(),
  file_name     text not null,
  file_hash     text not null,          -- sha256: detecta reimportación idéntica
  granularity   text not null check (granularity in ('week','month','year')),
  rows_total    integer not null,
  rows_inserted integer not null,
  rows_updated  integer not null,
  rows_rejected integer not null,
  status        text not null check (status in ('previewed','completed','failed')),
  error_report  jsonb                   -- filas rechazadas: línea + motivo
);
```

Cada registro importado lleva su lote en `metadata.import_batch_id`, lo que
permite:

- **rollback lógico**: `delete from product_price_records where metadata->>'import_batch_id' = '…'`;
- auditar de dónde salió cualquier precio;
- detectar una reimportación idéntica por `file_hash`.

**Limitación honesta del rollback lógico:** solo revierte limpiamente las filas
**insertadas**. Las **actualizadas** por upsert han perdido su valor anterior, y
recuperarlo exigiría versionado (§10). Hay que decirlo en la interfaz antes de
confirmar una importación con actualizaciones.

RLS de la tabla: `is_platform_admin()` para todo. No es información de cliente.

---

## 10. Recomendación final para MIRA

### MVP (el siguiente bloque de trabajo)

1. **Migración previa** — índice único de la clave natural, tras resolver los
   duplicados existentes. **Es bloqueante: sin esto no hay importador.**
2. **Migración** — tabla `price_import_batches` + RLS.
3. **Parser y validador puros**, sin Next ni Supabase, con tests: es donde vive
   toda la lógica delicada (fechas, decimales, allowlists).
4. **Server Actions** — `previewPriceImport(csv)` y `commitPriceImport(batchId)`.
   Solo `platform_admin`, lotes de 500, cliente normal sujeto a RLS.
5. **UI en `/admin/precios/importar`** — subir, previsualizar, confirmar,
   resumen y descarga de rechazos.

Alcance estimado: un bloque, comparable a 1.4.

### Versión escalable (cuando el volumen lo pida)

- XLSX además de CSV.
- RPC `import_price_records(jsonb)` con transacción única.
- Tabla `price_sources` con FK real, dando por fin sentido a `source_id`.
- **Normalización de lonjas**: tabla `lonjas` + `products.lonja_id`. Los 102
  valores de texto libre actuales deben mapearse **manualmente**: decidir qué
  cadenas son la misma lonja es una decisión de negocio, y una agrupación
  automática fusionaría series de precios de mercados distintos sin vuelta atrás.
- Columna `period_granularity` (§8).
- Versionado de precios si el cliente necesita auditar rectificaciones.
- Job asíncrono si un fichero supera los 5 minutos.

### Decisiones pendientes de validar con el cliente

1. **Granularidad**: ¿un precio mensual es una fila con la fecha del día 1, o
   hace falta `period_granularity`? — *bloqueante antes de la primera carga
   mensual*.
2. **Rectificaciones**: ¿basta con sobrescribir, o hay que conservar el valor
   anterior? — *condiciona si hace falta versionado desde el principio*.
3. **Formato real de origen**: ¿qué exportan de verdad las lonjas con las que
   trabaja MIRA? El diseño del CSV debería partir de un fichero real, no de una
   especificación teórica.
4. **Volumen esperado**: 50.000 filas es una cota razonable, pero conviene
   confirmarla contra la carga histórica que se quiera subir.
5. **Lonjas**: ¿los 102 valores actuales son 102 lonjas reales, o hay variantes
   de escritura de la misma? — *condiciona el esfuerzo de normalización*.
