# Deploy — Plataforma MIRA

## Resumen

| Parámetro | Valor |
|---|---|
| Plataforma | [Coolify](https://coolify.io/) (self-hosted) |
| App | `mirapricing-demo` |
| Rama desplegada | `feat/saas-architecture` |
| URL demo | [https://demo.mirapricing.com](https://demo.mirapricing.com) |
| Método | Docker (build multistage) |
| Trigger | Manual desde el panel de Coolify |

---

## Proceso de deploy

### 1. Preparar el código

Asegurarse de que:
- El build local pasa sin errores (`npm run build`)
- No hay errores TypeScript
- Los cambios están en la rama `feat/saas-architecture`

### 2. Push a la rama

```bash
git push origin feat/saas-architecture
```

> El push **no lanza el deploy automáticamente**. Es manual.

### 3. Lanzar deploy en Coolify

1. Acceder al panel de Coolify
2. Seleccionar la app `mirapricing-demo`
3. Hacer clic en **Deploy** (o **Redeploy**)
4. Esperar a que el proceso termine (aprox. 3–5 minutos)
5. Verificar que la demo funciona en [https://demo.mirapricing.com](https://demo.mirapricing.com)

### 4. Verificar el deploy

Comprobar:
- [ ] La página principal carga correctamente
- [ ] El login funciona con las cuentas demo
- [ ] El panel admin es accesible
- [ ] El portal cliente carga el dashboard

---

## Dockerfile (build multistage)

El `Dockerfile` en la raíz del proyecto usa dos stages:

```
Stage 1 — Builder
  - Imagen base: node:20-alpine
  - npm ci (instala dependencias desde package-lock.json)
  - npm run build (genera la build de Next.js)

Stage 2 — Runner
  - Imagen base: node:20-alpine (ligera)
  - Copia solo los artefactos necesarios del stage Builder
  - Expone el puerto 3000
  - CMD: node server.js
```

> **No modificar el Dockerfile** sin consultar al equipo principal. Cambios incorrectos pueden romper el deploy.

---

## Variables de entorno en Coolify

Las variables se configuran en el panel de Coolify → app `mirapricing-demo` → **Environment Variables**.

| Variable | Buildtime | Runtime |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | — | ✅ |
| `NEXT_PUBLIC_APP_URL` | ✅ | ✅ |
| `NEXT_TELEMETRY_DISABLED` | ✅ | ✅ |
| `NODE_ENV` | — | ✅ |

> Las variables `NEXT_PUBLIC_*` deben marcarse como buildtime en Coolify, no solo runtime. Si no están en buildtime, Next.js no las incluye en el bundle y la app falla silenciosamente.

---

## Problemas conocidos y soluciones

### 1. `package-lock.json` desincronizado

**Síntoma:** El stage Builder falla con `npm ci` por diferencias entre `package.json` y `package-lock.json`.

**Causa:** `npm install` local actualiza `package-lock.json` pero el commit no lo incluye, o hay diferencias de versión entre entornos.

**Solución:**
```bash
# En local, regenerar el lock file limpio
rm -rf node_modules package-lock.json
npm install
git add package-lock.json
git commit -m "fix: regenerate package-lock.json"
```

> `npm ci` requiere que `package-lock.json` esté sincronizado con `package.json`. Siempre hacer commit de ambos juntos.

### 2. Falta la carpeta `public/`

**Síntoma:** El Dockerfile falla al intentar copiar la carpeta `public/` porque no existe en el repositorio.

**Causa:** Next.js require la carpeta `public/` para assets estáticos. Si no hay assets, la carpeta no se crea y git no la trackea.

**Solución:** La carpeta `public/` ya existe en el repositorio con un archivo `.gitkeep` o similar. No eliminarla aunque esté vacía.

### 3. Servidor justo de recursos (RAM/CPU)

**Síntoma:** El deploy es lento o el contenedor se reinicia por OOM (Out Of Memory).

**Causa:** El servidor de Coolify tiene recursos limitados. El build de Next.js es intensivo en memoria.

**Solución aplicada:** Se añadió swap al servidor para aliviar la presión de memoria durante el build.

**Monitorizar:** Si el build falla por timeout o OOM, revisar los recursos del servidor en el panel de Coolify.

### 4. Variables de entorno no disponibles en buildtime

**Síntoma:** Las páginas que usan `NEXT_PUBLIC_*` renderizan vacías o con errores en producción, aunque en local funcionan.

**Causa:** Coolify no tenía las variables marcadas como disponibles en buildtime (solo runtime).

**Solución:** En el panel de variables de entorno de Coolify, marcar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_APP_URL` como variables de **buildtime y runtime**.

---

## Logs de deploy

Para ver los logs del último deploy:

1. Panel de Coolify → app `mirapricing-demo`
2. Sección **Deployments** → seleccionar el deploy más reciente
3. Ver los logs del build y del runtime

---

## Rollback

Si un deploy rompe la demo:

1. Ir a **Deployments** en Coolify
2. Seleccionar el deploy anterior (el que funcionaba)
3. Hacer clic en **Redeploy** sobre ese deploy anterior

Coolify conserva los últimos deploys para permitir rollback rápido.

---

## Notas para la empresa externa

- La empresa externa **no tiene acceso** al panel de Coolify.
- Las variables de entorno en Coolify las gestiona exclusivamente el equipo principal.
- Si el módulo externo necesita variables nuevas, documentarlas en el PR y el equipo principal las añade.
- El deploy de módulos externos se realiza siempre después del merge a `feat/saas-architecture` y revisión del equipo principal.
