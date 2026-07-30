# Fase 3.5 — Restricciones de proveedores por membresía: diagnóstico y propuesta

**Estado: propuesta. No se ha aplicado ninguna restricción, no se ha ocultado
ningún campo y no se ha limitado ninguna acción.**

---

## 1. Lo que existe hoy

### Planes

| Plan | `max_users` | `max_rfqs_month` | `has_ai` | `has_api` | `has_history` |
|---|---:|---:|:--:|:--:|:--:|
| Starter | 3 | — | ❌ | ❌ | ❌ |
| Business | 10 | — | ❌ | ❌ | ✅ |
| Enterprise | ∞ | — | ✅ | ✅ | ✅ |

### La cadena real organización → plan → permisos

```
organizations.plan_id → plans
organizations.modules  → {markets, quotes}        (1.4, migración 027)
organization_disabled_markets                      (2.2, migración 028)
organization_members.can_buy / can_sell            (1.2)
```

**Hallazgo importante: los campos de `plans` NO están conectados a ninguna
comprobación.** `has_api`, `has_history` y `max_users` existen en la tabla y se
muestran en la landing, pero **ninguna policy, guard ni query los consulta**. Lo
único que hoy restringe de verdad es `organizations.modules` (1.4) y
`organization_disabled_markets` (2.2), que son ejes independientes del plan.

Es decir: **el plan es hoy informativo**. Un cliente Starter y uno Enterprise ven
exactamente lo mismo en proveedores.

### RLS actual de `suppliers`

| Policy | Regla |
|---|---|
| `admin_all_suppliers` | `is_platform_admin()` — todo |
| `client_select_active_suppliers` | `auth.uid() is not null AND is_active = true` |

**Cualquier usuario autenticado ve los 12.288 proveedores activos, con todas sus
columnas.** No hay noción de organización ni de plan en el catálogo de
proveedores.

---

## 2. Un hallazgo que conviene conocer antes de decidir

Comprobado en producción, suplantando a Ana (owner de Acme, no administradora):

```
Ana lee suppliers.notes de un proveedor  →  "QA nota interna"
```

**Las notas internas son legibles por cualquier cliente vía PostgREST directo.**
No es algo que introduzca este bloque: es el comportamiento actual de
`client_select_active_suppliers`, que devuelve la fila entera.

La exportación de 3.4 **sí excluye `notes`** para la audiencia de cliente, así
que el XLSX no las contiene. Pero esa exclusión vive en la aplicación, no en
RLS. Si el objetivo es que un cliente no pueda leerlas de ninguna forma, hace
falta una vista o una policy por columnas — y eso es precisamente lo que 3.5
debería resolver.

---

## 3. Campos potencialmente sensibles

| Campo | Cobertura | Sensibilidad | Comentario |
|---|---:|---|---|
| `notes` | 169 | **Alta** | Nota interna. Hoy legible por cliente vía API |
| `email` | 0 | **Alta** | Contacto directo: es el valor comercial del directorio |
| `phone` | 0 | **Alta** | Ídem |
| `tax_id` | 0 | Media | Dato de empresa, no personal |
| `address` | 0 | Media | Ubicación exacta |
| `latitude`/`longitude` | 12.288 | Media | Permite localizar con precisión |
| `produccion_value` | 4.118 | **Media-alta** | Dato competitivo del proveedor |
| `website` | 0 | Baja | Público por definición |
| `name`, `country`, `region`, `city` | 100 % / 39 % | Baja | Base del directorio |

El patrón es claro: **lo que da valor a un directorio de proveedores es el
contacto directo** (`email`, `phone`) y el **volumen de producción**. Son los
candidatos naturales a reservarse para planes superiores.

---

## 4. Acciones restringibles

| Acción | Existe hoy | Restringible por plan |
|---|---|---|
| Ver listado y mapa | ✅ todos | Poco recomendable: es el producto |
| Ver contacto (`email`, `phone`) | ✅ todos | ✅ Candidato principal |
| Ver producción | ✅ todos | ✅ Candidato |
| Buscar y filtrar | ✅ todos | ⚠️ Limitar filtros irrita sin aportar |
| **Exportar XLSX** (3.4) | ✅ todos | ✅ Candidato claro |
| Nº de resultados visibles | 200/página | ✅ Candidato (tope de exportación) |
| Selección múltiple (3.3) | ✅ todos | Sin sentido restringirla por sí sola |
| Eliminar | solo `platform_admin` | Ya restringido, no depende del plan |

---

## 5. Matriz propuesta — **PROPUESTA, PENDIENTE DE VALIDACIÓN DEL CLIENTE**

> Nada de esto está implementado. Es un punto de partida para decidir, no una
> descripción del sistema.

| Capacidad | Starter | Business | Enterprise |
|---|:--:|:--:|:--:|
| Ver listado y mapa | ✅ | ✅ | ✅ |
| Buscar y filtrar (3.1) | ✅ | ✅ | ✅ |
| Ordenar (3.1) | ✅ | ✅ | ✅ |
| Ver ubicación (país, provincia, localidad) | ✅ | ✅ | ✅ |
| Ver clasificación | ✅ | ✅ | ✅ |
| **Ver correo y teléfono** | ❌ | ✅ | ✅ |
| **Ver producción** | ❌ | ✅ | ✅ |
| Ver coordenadas exactas | ❌ | ✅ | ✅ |
| **Exportar XLSX** | ❌ | ✅ (máx. 1.000) | ✅ (máx. 15.000) |
| Selección múltiple (3.3) | ✅ | ✅ | ✅ |
| Ver notas internas | ❌ | ❌ | ❌ |

**`notes` no debería verlo ningún cliente, con ningún plan.** Es un campo de
gestión interna, y hoy es legible por API. Eso no es una restricción de plan: es
una corrección pendiente.

---

## 6. Dónde debería aplicarse cada cosa

El orden importa: de dentro hacia fuera, y **nunca solo en la interfaz**.

| Capa | Qué correspondería hacer | Coste |
|---|---|---|
| **RLS / vista** | Que `client_select_active_suppliers` no devuelva `notes`. La vía limpia es una **vista** `suppliers_public` con las columnas permitidas y conceder el `select` sobre ella, en lugar de sobre la tabla. Postgres no tiene RLS por columna | Medio |
| **Query** | `search_suppliers` devolvería solo las columnas permitidas según el plan. Requiere pasarle el contexto o crear una variante | Medio |
| **Serialización** | Filtrar campos en `listSuppliersFiltered` antes de que salgan del servidor. Es la capa más barata y la que evita que un campo llegue al navegador aunque la consulta lo traiga | **Bajo** |
| **Exportación** | Ya está preparada: `exportColumnsFor(audience)` decide las columnas. Bastaría con ampliar la audiencia de `'admin' \| 'client'` a incluir el plan | **Muy bajo** |
| **Interfaz** | Mostrar el campo como bloqueado con la razón, en vez de ocultarlo. Igual que se hizo con los módulos en 1.4: el enlace se ve, y explica | Bajo |

**Recomendación de secuencia:**

1. **Primero, sin esperar a 3.5:** sacar `notes` del alcance del cliente. Es una
   fuga real, no una decisión comercial.
2. **Después:** serialización + exportación, que es donde está el 80 % del efecto
   con el 20 % del riesgo.
3. **Solo si hace falta de verdad:** la vista y el cambio de RLS.

---

## 7. Decisiones que debe validar el cliente

1. **¿El plan debe restringir el directorio de proveedores, o es un producto
   plano?** Hoy es plano y funciona. Restringirlo es una decisión comercial que
   afecta a clientes ya activos.
2. **¿Qué campos son «premium»?** La propuesta apunta a contacto y producción,
   pero es una hipótesis sobre lo que da valor.
3. **¿Qué pasa con Acme, que hoy ve todo?** Aplicar la matriz le quitaría
   acceso a lo que ya usa. ¿Se respeta lo contratado, o hay migración?
4. **¿La restricción es por plan o por módulo?** Existe ya el mecanismo de 1.4
   (`organizations.modules`), que es por organización y no por plan. Podría
   añadirse un módulo `suppliers_contact` en lugar de atar esto a `plans`, y
   sería más flexible comercialmente.
5. **Límite de exportación por plan:** ¿1.000 filas para Business es razonable,
   o el valor está justo en poder exportar todo?

**Mi recomendación sobre la 4:** reutilizar el mecanismo de módulos de 1.4 en
lugar de leer `plans`. Ya está implementado, probado y tiene su interfaz de
administración; atar capacidades a `plans` obligaría a conectar por primera vez
unos campos que hoy no gobiernan nada.
