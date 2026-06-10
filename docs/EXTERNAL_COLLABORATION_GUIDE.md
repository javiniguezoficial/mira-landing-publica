# Guía de Colaboración Externa — Plataforma MIRA

> Este documento está dirigido a la empresa externa contratada para implementar los módulos de **monetización/planes** y **gestor documental de facturas**.

---

## Contexto del proyecto

MIRA es un SaaS de inteligencia de mercado para la monitorización de precios alimentarios. El núcleo técnico ya está implementado y en producción en [https://demo.mirapricing.com](https://demo.mirapricing.com).

La empresa externa tiene un alcance acotado y definido. Cualquier trabajo fuera de ese alcance requiere aprobación explícita del equipo principal antes de comenzar.

---

## Lo que puede hacer la empresa externa

### Módulo 1 — Monetización / Planes / Stripe

- Integración de Stripe (checkout, webhooks, gestión de suscripciones)
- Trial de 30 días
- Planes Free / Business / Enterprise
- Página de precios comercial (si se acuerda en el alcance)
- Portal de suscripción (Stripe Customer Portal)
- Webhooks de Stripe con validación de firma
- Emails transaccionales relacionados con pagos
- Lógica de estado de suscripción (active, trialing, past_due, canceled)
- Tablas nuevas en Supabase relacionadas con billing (siempre vía PR y con documentación completa)

### Módulo 2 — Gestor Documental de Facturas

- Subida de PDFs a Supabase Storage
- Visualización y descarga de PDFs desde la UI
- Listado de facturas por cliente / organización
- Aislamiento de facturas por organización (RLS propia del módulo)
- Tablas nuevas en Supabase para facturas (siempre vía PR y con documentación completa)

---

## Lo que NO puede tocar sin aprobación explícita

Los siguientes elementos son **núcleo protegido** de MIRA. Cualquier modificación requiere revisión y aprobación del equipo principal antes de abrir el PR:

| Área | Motivo |
|---|---|
| `middleware.ts` | Controla la autenticación de toda la app |
| `src/lib/supabase/` | Clientes y helpers de Supabase compartidos |
| Migraciones existentes (`001`–`008`) | Esquema y RLS activos en producción |
| RLS existente | Aislamiento de datos crítico por organización |
| `src/app/app/*` (portal cliente core) | Dashboard, Market Intelligence, RFQs, Proveedores, Noticias, Soporte |
| `src/app/admin/*` (panel admin core) | Toda la gestión de mercados, precios, clientes |
| `src/components/mira/*` | Design System MIRA — no alterar tokens ni componentes base |
| `src/lib/actions/*` (acciones existentes) | Lógica de negocio del core ya en producción |
| `src/lib/queries/*` (queries existentes) | Queries del core |
| Landing pública (`src/app/(public)/*`) | Solo si se acuerda explícitamente |
| `Dockerfile` | Build y deploy de producción |
| Variables de entorno de producción en Coolify | Solo el equipo principal |
| `package.json` / `package-lock.json` | Gestión de dependencias del proyecto |
| `.env.local` | Nunca tocar, nunca subir a git |

---

## Flujo de trabajo obligatorio

### Ramas

La empresa externa trabajará exclusivamente en ramas propias:

```
feat/external-billing       → Stripe, planes, suscripciones
feat/external-invoices      → Gestor documental de facturas
feat/external-[descriptor]  → Cualquier otra tarea acordada
```

**Prohibido** hacer push directo a `main` o `feat/saas-architecture`.

### Pull Requests

Todo el trabajo se entrega mediante Pull Request:

1. Crear la PR contra `feat/saas-architecture` (nunca contra `main`)
2. La PR debe incluir una descripción clara con:
   - Qué se ha implementado
   - Qué archivos se han creado o modificado
   - Qué tablas o migraciones se proponen (si aplica)
   - Cómo probarlo localmente
3. El equipo principal revisará y aprobará antes del merge
4. No hacer merge sin aprobación

---

## Reglas para migraciones Supabase

Las migraciones son **cambios irreversibles en producción**. Se aplican con suma precaución.

### Reglas

1. **Nunca** modificar migraciones existentes (`001` a `008`).
2. Las nuevas migraciones se crean con el siguiente número en la secuencia (ej. `009_billing.sql`).
3. Cada nueva migración debe documentarse en el PR con:
   - Nombre de la tabla nueva
   - Campos y tipos
   - Relaciones con tablas existentes
   - Políticas RLS propuestas
   - Impacto esperado en la UI
   - Script de rollback si es posible
4. Las migraciones **no se aplican en producción** hasta ser revisadas y aprobadas por el equipo principal.
5. Probar siempre en un entorno local o rama de Supabase antes de proponer la migración.

### Tablas que puede proponer la empresa externa

- Tablas de billing (suscripciones Stripe, estados de pago, etc.)
- Tablas de facturas/documentos
- Tablas auxiliares de su módulo

### Tablas que no puede crear

- Tablas que extiendan o modifiquen `profiles`, `organizations`, `organization_members` o `plans` sin aprobación.

---

## Reglas para variables de entorno

1. Nunca tocar `.env.local` del entorno principal.
2. Las variables nuevas que necesite el módulo externo se documentan en el PR y se añaden a `.env.example` como comentario (sin valores reales).
3. Las variables de producción en Coolify las gestiona exclusivamente el equipo principal.
4. Las variables de Stripe se documentan en [`docs/ENVIRONMENT.md`](ENVIRONMENT.md) antes de usarlas.

Variables que necesitará la empresa externa:

```bash
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
SUPABASE_STORAGE_BUCKET_INVOICES=
RESEND_API_KEY=          # o SENDGRID_API_KEY= para emails transaccionales
```

---

## Reglas específicas para Stripe

1. Usar siempre `stripe.webhooks.constructEvent()` para validar webhooks — nunca procesar eventos sin verificar la firma.
2. Los precios y productos de Stripe deben crearse desde el dashboard de Stripe, no hardcodeados en el código.
3. El `STRIPE_SECRET_KEY` nunca debe aparecer en código del lado cliente ni en bundles públicos.
4. Las claves de prueba (`sk_test_*`) y producción (`sk_live_*`) son variables de entorno separadas.
5. Documentar todos los eventos de webhook que se manejan y qué hacen.

---

## Reglas específicas para el gestor documental de facturas

1. Los PDFs se almacenan en Supabase Storage, nunca en la base de datos (no usar columnas `bytea`).
2. El bucket de Storage debe tener RLS activada — cada organización solo accede a sus facturas.
3. Las URLs de descarga deben ser URLs firmadas con tiempo de expiración, nunca URLs públicas permanentes.
4. La UI de facturas debe ser un módulo nuevo, nunca modificar las páginas existentes del portal cliente.

---

## Checklist antes de entregar un PR

Antes de abrir un Pull Request, verificar que:

- [ ] El código compila sin errores TypeScript (`npm run build`)
- [ ] No se han modificado archivos fuera del alcance acordado
- [ ] No se han modificado migraciones existentes (`001`–`008`)
- [ ] Las nuevas migraciones están documentadas (tabla, campos, RLS, rollback)
- [ ] Las nuevas variables de entorno están añadidas en `.env.example` como comentario
- [ ] No hay claves API, secretos ni tokens hardcodeados en el código
- [ ] No se ha tocado `.env.local`
- [ ] No se ha hecho push directo a `main` o `feat/saas-architecture`
- [ ] El PR incluye instrucciones para probar el módulo localmente
- [ ] El PR describe claramente qué archivos se crean/modifican

---

## Qué debe entregar la empresa externa antes de empezar

Antes de escribir una sola línea de código, la empresa externa debe entregar al equipo principal:

1. **Alcance exacto** — lista de funcionalidades a implementar
2. **Rutas nuevas** — rutas de Next.js que van a crear
3. **Tablas nuevas propuestas** — nombre, campos, relaciones, RLS
4. **Variables de entorno necesarias** — lista completa
5. **Servicios externos** — Stripe, Resend, SendGrid, u otros
6. **Cambios previstos en Supabase** — migraciones, Storage, funciones
7. **Cambios previstos en Stripe** — productos, precios, webhooks
8. **Plan de pruebas** — cómo verificarán que el módulo funciona
9. **Entregables finales** — qué entregan y cuándo
10. **Accesos necesarios**:
    - ¿Necesitan acceso de lectura a Supabase? ¿Con qué rol?
    - ¿Necesitan acceso a Coolify?
    - ¿Necesitan acceso al repositorio de GitHub?
    - ¿Trabajarán por Pull Request? (obligatorio)

El equipo principal revisará este documento y dará aprobación por escrito antes de que la empresa externa empiece a trabajar.

---

## Contacto y revisión

Cualquier duda sobre el alcance o sobre si algo está permitido se consulta antes de implementarlo. El coste de preguntar es cero. El coste de implementar algo que rompe el core y hay que revertir es alto.

> En caso de duda: **preguntar primero, implementar después**.
