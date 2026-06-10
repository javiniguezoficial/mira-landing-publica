# Project Roadmap — Plataforma MIRA

## Estado general

- Núcleo técnico implementado y desplegado en demo
- Demo activa: [https://demo.mirapricing.com](https://demo.mirapricing.com)
- Funcionalidades principales admin/cliente operativas
- Pendientes críticos identificados según documentación del cliente (GAP Analysis)

---

## Fase 1 — Preparación para colaboración externa

**Responsable:** Equipo principal (Javi)
**Estado:** ✅ En curso / completando

**Objetivo:** Dejar el proyecto documentado, ordenado y con límites técnicos claros para que una empresa externa pueda trabajar de forma segura en las partes externalizadas.

**Tareas:**

- [x] Actualizar `README.md` con stack, entornos, comandos y reglas
- [x] Crear `docs/ARCHITECTURE.md` — arquitectura, estructura de carpetas, rutas
- [x] Crear `docs/EXTERNAL_COLLABORATION_GUIDE.md` — guía completa para empresa externa
- [x] Crear `docs/ENVIRONMENT.md` — variables de entorno, públicas vs secretas
- [x] Crear `docs/DEPLOYMENT.md` — proceso de deploy y problemas conocidos
- [x] Crear `docs/DATABASE_OVERVIEW.md` — tablas, RLS, cómo proponer cambios
- [x] Crear `docs/PROJECT_ROADMAP.md` — este documento
- [x] Crear `docs/CLIENT_GAP_BACKLOG.md` — estado vs requerimientos del cliente
- [x] Revisar y limpiar `.env.example` con variables sin valores reales

---

## Fase 2 — Core Market Intelligence

**Responsable:** Equipo principal (Javi)
**Estado:** 🟡 Parcial — tabla de datos implementada, gráfico pendiente

**Objetivo:** Completar el módulo estrella de MIRA: la visualización de tendencias de precios con gráficos, filtros temporales y comparativa de productos.

**Ruta afectada:** `/app/market-intelligent/[marketSlug]/[productSlug]`

**Pendientes:**

1. **Gráfico de línea temporal** *(impacto crítico)*
   - Librería: Recharts (`LineChart` o `AreaChart`)
   - Eje X: fechas (`recorded_at`)
   - Eje Y: precio medio
   - Agrupación por semana / mes (configurable)
   - Usar `MiraAreaChart` del Design System o crear `MiraLineChart` equivalente
   - Query en `src/lib/queries/prices.ts`

2. **Filtros de período** *(impacto crítico)*
   - Opciones: Última semana / Último mes / Últimos 3 meses / Último año
   - Afectan tanto al gráfico como a la tabla de datos
   - Estado local en el componente (no requiere nueva tabla)

3. **Comparativa multi-producto** *(impacto alto)*
   - Selección de 2–3 productos del mismo mercado
   - Overlay de líneas en el mismo gráfico Recharts
   - Leyenda con colores del `palette.ts` del Design System
   - No requiere nueva tabla

---

## Fase 3 — Personalización cliente

**Responsable:** Equipo principal (Javi)
**Estado:** ⬜ Pendiente

**Objetivo:** Permitir al cliente personalizar su experiencia marcando mercados y productos como favoritos y viendo un dashboard adaptado a sus intereses.

**Pendientes:**

1. **Favoritos de mercados / productos** *(impacto medio)*
   - Botón de estrella en la UI de mercados y productos
   - Puede requerir tabla `user_favorites` (proponer migración antes de implementar)
   - No crear la migración sin aprobación del equipo principal

2. **Dashboard principal personalizado** *(impacto medio)*
   - Mostrar los mercados y productos favoritos del usuario al entrar
   - Mostrar alertas de variación de precio relevantes
   - Mejorar la experiencia general del dashboard en `/app/dashboard`

---

## Fase 4 — Seguridad, sesión y roles

**Responsable:** Equipo principal (Javi), con revisión cuidadosa
**Estado:** ⬜ Pendiente

**Objetivo:** Reforzar la seguridad de acceso y añadir visibilidad de auditoría.

> **Aviso:** Cualquier cambio en autenticación, sesión o roles afecta a todo el sistema. Cada punto de esta fase requiere análisis previo y testing exhaustivo antes de desplegar.

**Pendientes:**

1. **Timeout de sesión** *(impacto alto)*
   - Logout automático tras 1 hora de inactividad
   - Detectar inactividad mediante eventos DOM (mousemove, keydown, scroll)
   - No romper el flujo de Supabase Auth ni los tokens de sesión
   - Mostrar aviso al usuario antes del logout

2. **Roles finos** *(impacto alto)*
   - Diferenciar: `superadmin` / `admin` estándar / `member`
   - `superadmin`: acceso total incluido configuración crítica
   - `admin` estándar: acceso al panel sin configuración crítica
   - No tocar políticas RLS existentes sin revisión

3. **2FA / TOTP** *(fase posterior)*
   - Supabase MFA está disponible en el plan Pro
   - Implementar en una fase posterior cuando la base de seguridad esté consolidada

4. **Registro de auditoría** *(impacto medio)*
   - Log de acciones admin (quién cambió qué precio, quién editó un cliente, etc.)
   - Puede implementarse como tabla `audit_logs` nueva
   - Proponer migración antes de implementar

---

## Fase 5 — Landing y conversión (sin monetización)

**Responsable:** Equipo principal (Javi)
**Estado:** ⬜ Parcial — landing base implementada, mejoras pendientes

**Objetivo:** Optimizar la landing para captar leads y mejorar la conversión sin implementar Stripe ni precios comerciales.

**Pendientes:**

1. **WhatsApp CTA** *(impacto alto)*
   - Número: 634 317 421
   - Botón flotante o visible en la landing
   - Link: `https://wa.me/34634317421`

2. **Teléfono visible en landing/footer**
   - Revisar footer y hero — añadir número de teléfono

3. **LinkedIn visible**
   - Añadir enlace a: `https://linkedin.com/company/mira-pricing`
   - En footer y sección sobre nosotros

4. **Logos animados de fuentes oficiales** *(impacto medio)*
   - Marquee/carousel con logos de lonjas, MAPA y fuentes oficiales de datos
   - Aumenta credibilidad de los datos de precios

5. **Gráfica demo pública** *(impacto alto)*
   - Gráfico de tendencia con datos de muestra visible antes del login
   - No requiere registro para verla
   - Muestra el valor de MIRA antes de pedir credenciales

6. **Banner sticky CTA** *(impacto medio)*
   - Barra fija en la parte superior con CTA de contacto/prueba
   - Sin Stripe — el CTA dirige a contacto por WhatsApp o formulario

7. **Sección "Nuestros Mercados" mejorada** *(impacto medio)*
   - Navegación por familia de mercados
   - Diseño tipo cards con imagen/icono por categoría
   - Inspiración visual: Stripe / Vesper

---

## Fase 6 — Compliance / RGPD

**Responsable:** Equipo principal (Javi) + revisión legal externa
**Estado:** ⬜ Parcial — páginas legales existen, funcionalidad pendiente

**Pendientes:**

1. **Banner de cookies funcional** *(requerimiento legal)*
   - Consentimiento granular: esenciales / analíticas / marketing
   - Guardar preferencias en `localStorage` o cookie propia
   - Las páginas legales ya existen (`/politica-cookies`)

2. **Derecho al olvido** *(requerimiento legal)*
   - Flujo para que el usuario pueda borrar su cuenta y datos
   - Análisis previo: qué datos pertenecen a la organización vs. al usuario
   - Requiere análisis de relaciones en base de datos antes de implementar

3. **Revisión de textos legales** *(requerimiento legal)*
   - Las páginas legales existen pero requieren revisión por un asesor legal real
   - No son texto genérico — deben adaptarse al negocio real de MIRA

---

## Fase 7 — Rendimiento y escalabilidad

**Responsable:** Equipo principal (Javi)
**Estado:** ⬜ Pendiente — a activar cuando el volumen de datos lo requiera

**Pendientes:**

1. **Índices en `product_price_records`**
   - Tabla diseñada para 300.000+ registros
   - Índices necesarios: `(product_id, recorded_at)`, `recorded_at DESC`
   - No aplicar sin aprobación — los índices tienen coste en escritura
   - Proponer como migración nueva

2. **Optimizaciones futuras** (cuando el volumen lo justifique)
   - Particionado de `product_price_records` por fecha
   - Caché de queries frecuentes (Redis o Supabase Edge Functions)
   - CDN para assets estáticos
   - Paginación eficiente con cursores en lugar de OFFSET

---

## Fase Externa — Monetización y Facturas

**Responsable:** Empresa externa
**Estado:** ⬜ No iniciado — pendiente de contratación y onboarding

> **IMPORTANTE:** El equipo principal NO implementará este módulo. Está reservado íntegramente para la empresa externa.

### Módulo A — Monetización / Planes / Stripe

1. Integración de Stripe (API, SDK)
2. Checkout de suscripción
3. Trial de 30 días
4. Planes: Free / Business / Enterprise
5. Página de precios comercial
6. Portal de suscripción (Stripe Customer Portal)
7. Webhooks Stripe con validación de firma
8. Emails transaccionales de pago (confirmación, renovación, cancelación, fallo de pago)
9. Lógica de estados: `active`, `trialing`, `past_due`, `canceled`, `paused`
10. Bloqueo de acceso según estado de suscripción

### Módulo B — Gestor Documental de Facturas

1. Subida de PDFs a Supabase Storage
2. Listado de facturas por cliente / organización
3. Visualización de PDF en el navegador
4. Descarga de PDF
5. Aislamiento de facturas por organización (RLS)
6. Generación automática de facturas al renovar suscripción (si aplica)

### Reglas para la empresa externa

- Trabajar en ramas propias: `feat/external-billing`, `feat/external-invoices`
- Entregar todo mediante Pull Request
- No hacer push directo a `main` ni `feat/saas-architecture`
- No tocar el core sin aprobación
- Ver `docs/EXTERNAL_COLLABORATION_GUIDE.md` para el detalle completo

---

## Fase Futura — Innovación

**Estado:** ⬜ No planificado — ideas para el largo plazo

1. **IA / predicciones de precio**
   - Modelos de predicción de tendencias basados en histórico
   - Alertas de anomalías (precio fuera de rango esperado)

2. **Alertas de precio configurables**
   - El cliente define umbrales: "alértame si el precio del tomate sube más de un 10%"
   - Entrega por email o push notification

3. **Informes PDF exportables**
   - Generación de informes de tendencia en PDF desde el panel admin
   - Solo para admins en primera fase

4. **Integración automática con APIs oficiales**
   - Lonjas, MAPA, Mercabarna, etc.
   - Eliminación de la carga manual de precios

5. **PWA / App móvil**
   - Progressive Web App para acceso desde móvil
   - Notificaciones push para alertas de precio

---

*Última actualización: 2026-06-10*
