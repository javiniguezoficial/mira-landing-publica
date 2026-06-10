# Variables de entorno — Plataforma MIRA

> **ADVERTENCIA:** Nunca incluyas valores reales en este documento ni en `.env.example`. Nunca subas `.env.local` a git. Si accidentalmente subes una clave, revócala inmediatamente en Supabase o Stripe.

---

## Cómo preparar el entorno local

```bash
# Copiar la plantilla
cp .env.example .env.local

# Editar con los valores reales (nunca subir a git)
nano .env.local   # o tu editor preferido
```

`.env.local` está en `.gitignore`. No lo elimines de `.gitignore` bajo ninguna circunstancia.

---

## Variables actuales del proyecto

### Variables públicas (`NEXT_PUBLIC_*`)

Estas variables se incrustan en el bundle JavaScript en tiempo de build y son visibles para el navegador. **No incluir secretos.**

| Variable | Descripción | Requerida |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase (ej. `https://abc123.supabase.co`) | Sí |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública de Supabase (anon key). Tiene RLS aplicada. | Sí |
| `NEXT_PUBLIC_APP_URL` | URL base de la aplicación sin trailing slash (ej. `http://localhost:3000`) | Sí |

> Las variables `NEXT_PUBLIC_*` deben estar disponibles **tanto en buildtime como en runtime** en Coolify.

### Variables del servidor (secretas)

Estas variables solo se usan en el servidor (Server Actions, middleware, API routes). Nunca llegan al navegador.

| Variable | Descripción | Requerida |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio de Supabase. Bypassa RLS. **Mantener estrictamente secreta.** | Sí |

### Variables de configuración

| Variable | Descripción | Valor recomendado |
|---|---|---|
| `NEXT_TELEMETRY_DISABLED` | Desactiva la telemetría de Next.js | `1` |
| `NODE_ENV` | Entorno de ejecución | `development` (local) / `production` (deploy) |

---

## Dónde obtener los valores

### Supabase
1. Acceder a [https://app.supabase.com](https://app.supabase.com)
2. Seleccionar el proyecto de MIRA
3. Ir a **Settings → API**
4. Copiar:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY`

---

## Variables para entorno de producción (Coolify)

En Coolify, las variables se configuran en el panel de la app `mirapricing-demo` → **Environment Variables**.

| Variable | Buildtime | Runtime | Notas |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | Necesaria en build para SSG |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | Necesaria en build para SSG |
| `SUPABASE_SERVICE_ROLE_KEY` | — | ✅ | Solo runtime (servidor) |
| `NEXT_PUBLIC_APP_URL` | ✅ | ✅ | `https://demo.mirapricing.com` en la demo |
| `NEXT_TELEMETRY_DISABLED` | ✅ | ✅ | Valor `1` |
| `NODE_ENV` | — | ✅ | `production` |

> Solo el equipo principal gestiona las variables de entorno en Coolify. La empresa externa no debe tener acceso al panel de Coolify ni conocer los valores de producción.

---

## Variables futuras — Módulo de monetización (empresa externa)

La empresa externa necesitará añadir las siguientes variables cuando implemente el módulo de Stripe. Se añadirán a Coolify y a `.env.example` **solo cuando el módulo esté aprobado e integrado**.

```bash
# Stripe — Monetización (empresa externa)
STRIPE_SECRET_KEY=                      # sk_live_* en producción / sk_test_* en desarrollo
STRIPE_WEBHOOK_SECRET=                  # whsec_* — secreto del webhook
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=     # pk_live_* en producción / pk_test_* en desarrollo
```

> Las claves de prueba (`sk_test_*`, `pk_test_*`) se usan en local y staging. Las claves de producción (`sk_live_*`, `pk_live_*`) solo se configuran en Coolify por el equipo principal.

---

## Variables futuras — Gestor documental de facturas (empresa externa)

```bash
# Supabase Storage — Facturas (empresa externa)
SUPABASE_STORAGE_BUCKET_INVOICES=       # Nombre del bucket en Supabase Storage
```

---

## Variables futuras — Emails transaccionales (empresa externa)

Dependiendo del proveedor elegido por la empresa externa:

```bash
# Resend (opción recomendada)
RESEND_API_KEY=

# SendGrid (alternativa)
SENDGRID_API_KEY=
```

---

## Reglas de seguridad

1. **Nunca** hardcodear valores de variables en el código fuente.
2. **Nunca** subir `.env.local` a git (ya está en `.gitignore`, no eliminarlo).
3. **Nunca** loguear variables de entorno en producción.
4. **Nunca** compartir `SUPABASE_SERVICE_ROLE_KEY` fuera del equipo principal.
5. Si una clave se expone accidentalmente, **revocarla inmediatamente** en Supabase/Stripe y generar una nueva.
6. Las variables `NEXT_PUBLIC_*` son públicas por diseño — no incluir nada sensible con ese prefijo.
