# Fase 3.2 — Identificador estable de proveedor: diagnóstico

**Estado: diagnóstico. No se ha cambiado ninguna constraint ni ningún dato.**

Este documento responde a una sola pregunta: cuando llegue la actualización
masiva de proveedores, ¿contra qué campo se empareja una fila de un fichero
externo con un proveedor de MIRA?

Todas las cifras están medidas sobre los **12.288 proveedores** reales.

---

## 1. Cobertura real de cada candidato

| Campo | Informados | Cobertura | Valores distintos | Veredicto |
|---|---:|---:|---:|---|
| `id` (uuid) | 12.288 | **100 %** | 12.288 | ✅ Único y estable |
| `tax_id` (NIF/CIF) | **0** | **0 %** | 0 | ❌ Inservible hoy |
| `email` | **0** | **0 %** | 0 | ❌ Inservible hoy |
| `phone` | **0** | 0 % | 0 | ❌ Inservible |
| `website` | **0** | 0 % | 0 | ❌ Inservible |
| `name` | 12.288 | 100 % | 11.138 | ⚠️ **391 nombres repetidos** |
| `name + city + country` | — | — | — | ⚠️ **250 combinaciones repetidas** |
| `latitude/longitude` | 12.288 | 100 % | — | ⚠️ No es identidad |

**El dato que decide el diagnóstico: `tax_id` y `email` están vacíos en los
12.288 proveedores.** No es que tengan poca cobertura: no hay ni uno solo
informado. Cualquier plan que dependa de ellos hoy empareja cero filas.

---

## 2. Análisis por candidato

### `id` interno (uuid) — **recomendado para ficheros generados por MIRA**

- **Cobertura:** 100 %.
- **Duplicados:** imposibles, es clave primaria.
- **Nulos:** ninguno.
- **Estabilidad:** total. No cambia nunca; no depende de ningún dato de negocio.
- **Riesgo de colisión:** nulo.
- **Idoneidad para ficheros externos:** **baja**. Nadie fuera de MIRA conoce
  estos identificadores. Solo sirve si el fichero salió de una exportación
  nuestra — que es exactamente el caso que ya cubre la exportación de 3.4, cuya
  hoja de administración incluye la columna **ID interno**.

### `tax_id` (NIF/CIF) — **candidato natural, hoy inutilizable**

- **Cobertura: 0 de 12.288.**
- **Duplicados:** no evaluables sin datos.
- **Estabilidad:** alta en teoría — un NIF no cambia.
- **Riesgo de colisión:** bajo si se normaliza (mayúsculas, sin guiones ni
  espacios). Ojo con proveedores extranjeros: hay **112 países** en el catálogo
  y el formato de identificación fiscal no es homogéneo.
- **Idoneidad para ficheros externos:** **la mejor de todas**, en cuanto exista
  cobertura. Es el dato que un proveedor sí conoce de sí mismo.

**Antes de usarlo hay que poblarlo y comprobar su unicidad.** No se puede añadir
un índice único sobre una columna que se va a rellenar por lotes sin verificar
antes los duplicados.

### `email` — **nunca como clave única**

- **Cobertura: 0 de 12.288.**
- **Riesgo estructural:** un mismo correo puede pertenecer a varias sedes o
  filiales (`info@grupo.com`), y una persona de contacto cambia sin que cambie
  el proveedor. Es un dato de contacto, no de identidad.
- **Veredicto:** descartado como clave única, incluso si se poblara. Sirve como
  criterio de apoyo para revisión manual, nada más.

### `name` — **no vale solo**

- **391 nombres repetidos**, y el más repetido aparece **42 veces**.
- Además cambia: razones sociales, rebranding, erratas corregidas.
- Emparejar por nombre actualizaría el proveedor equivocado 391 veces.

### `name + city + country` — **tampoco**

- **250 combinaciones siguen estando repetidas.**
- Y `city` solo está informada en **4.774 de 12.288 (39 %)**: para el 61 %
  restante la clave degenera en `name + country`, que es aún más ambigua.
- Añadido: `country` tiene **112 valores** con variantes de escritura reales en
  los datos (`india` / `India` / `INdia`, `eslovenia` / `Eslovenia`,
  `polonia` / `Polonia`, `suiza` / `Suiza`…). Sin normalizar el país, la clave
  ni siquiera es estable consigo misma.

### Identificador externo real

**No existe ninguno hoy.** No hay columna de código de proveedor, ni referencia
de ERP, ni identificador de la fuente de importación.

---

## 3. Recomendación

**Estrategia de dos vías, según de dónde venga el fichero:**

1. **Fichero generado por MIRA** → emparejar por **`id` interno**.
   Ya funciona: la exportación de administración incluye la columna. Es el flujo
   que hay que ofrecer primero, porque es el único seguro hoy.

2. **Fichero de origen externo** → emparejar por **`tax_id` normalizado**,
   *cuando exista cobertura*. Normalización propuesta:
   `upper(regexp_replace(tax_id, '[^A-Za-z0-9]', '', 'g'))`.

3. **Sin `id` ni `tax_id`** → **no emparejar automáticamente.** La fila se marca
   como «sin correspondencia» y se resuelve a mano. Es preferible a actualizar
   el proveedor equivocado.

### Trabajo previo, en este orden

1. **Poblar `tax_id`.** Sin esto no hay segunda vía. Es una tarea de datos, no
   de código.
2. **Medir duplicados** del `tax_id` normalizado antes de imponer nada.
3. **Normalizar `country`** — las variantes de mayúsculas ya ensucian filtros y
   ordenaciones, no solo el emparejamiento.
4. **Solo entonces**, valorar un índice único parcial:
   `create unique index … on suppliers (upper(regexp_replace(tax_id,'[^A-Za-z0-9]','','g'))) where tax_id is not null;`

### Lo que NO se debe hacer

- Emparejar por nombre, ni siquiera «si es único»: hoy lo es para 10.747 de
  11.138, y esa proporción cambia con cada importación.
- Emparejar por correo.
- Crear proveedores automáticamente cuando no hay correspondencia. Es la misma
  regla que ya aplica la importación de precios y por el mismo motivo: un slug
  mal escrito generaría una entidad fantasma con su propio histórico.

---

## 4. Decisiones que debe validar el cliente

1. **¿Se va a poblar `tax_id`?** Sin esa decisión, la actualización masiva solo
   puede funcionar con ficheros exportados desde MIRA.
2. **¿Existe un código de proveedor en el ERP del cliente?** Si lo hay, añadir
   una columna `external_ref` sería mejor que forzar el NIF.
3. **¿Qué se hace con las filas sin correspondencia?** ¿Se ignoran, se listan
   para revisión, o se permite crear tras confirmación explícita?
4. **Proveedores extranjeros:** ¿se exige identificación fiscal para los 112
   países, o solo para España?
