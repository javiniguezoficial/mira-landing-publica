# GAP Analysis — Estado vs. Requerimientos del Cliente

> Basado en el análisis de requerimientos del cliente (MIRA_GAP_Analysis). Documento de referencia para seguimiento del estado real del proyecto.

**Leyenda:**
- ✅ **Hecho** — implementado y funcional
- 🟡 **Parcial** — implementado en parte, falta completar
- ⬜ **Pendiente** — no implementado, en roadmap del equipo principal
- 🔵 **Empresa externa** — excluido de nuestra implementación, delegado a empresa externa
- 🔮 **Futuro** — identificado pero no planificado en el corto plazo

---

## Módulo: Autenticación y Acceso

| Requerimiento | Estado | Notas |
|---|---|---|
| Login con email y contraseña | ✅ Hecho | Supabase Auth |
| Recuperación de contraseña | ✅ Hecho | Flujo email + link |
| Cambio de contraseña | ✅ Hecho | `/actualizar-password` |
| Registro de nuevas organizaciones | ✅ Hecho | `/registro` |
| Rol `platform_admin` con acceso completo | ✅ Hecho | Panel `/admin` |
| Rol `member` con acceso solo a su org | ✅ Hecho | Portal `/app` + RLS |
| Timeout de sesión tras inactividad | ⬜ Pendiente | Fase 4 |
| 2FA / TOTP | 🔮 Futuro | Supabase MFA |
| Roles finos (superadmin / admin estándar) | ⬜ Pendiente | Fase 4 |

---

## Módulo: Market Intelligence (Core)

| Requerimiento | Estado | Notas |
|---|---|---|
| Listado de mercados por categoría | ✅ Hecho | `/app/market-intelligent` |
| Detalle de producto con tabla de precios | ✅ Hecho | `/app/market-intelligent/[market]/[product]` |
| Histórico de precios en base de datos | ✅ Hecho | Tabla `product_price_records` |
| Importación masiva de precios (CSV/XLSX) | ✅ Hecho | `/admin/precios/importar` |
| Gráfico de línea temporal de precios | ⬜ Pendiente | **Impacto crítico** — Fase 2 |
| Filtros de período (semana / mes / año) | ⬜ Pendiente | **Impacto crítico** — Fase 2 |
| Comparativa multi-producto en gráfico | ⬜ Pendiente | Impacto alto — Fase 2 |
| Favoritos de mercados / productos | ⬜ Pendiente | Fase 3 |
| Alertas de variación de precio | 🔮 Futuro | Fase futura |
| Integración automática con APIs oficiales | 🔮 Futuro | Lonjas, MAPA, etc. |

---

## Módulo: Administración de Mercados y Precios

| Requerimiento | Estado | Notas |
|---|---|---|
| Gestión de categorías de mercado | ✅ Hecho | `/admin/mercados/categorias` |
| Gestión de mercados (CRUD) | ✅ Hecho | `/admin/mercados` |
| Gestión de productos por mercado (CRUD) | ✅ Hecho | `/admin/mercados/[id]/productos` |
| Gestión de precios históricos por producto | ✅ Hecho | `/admin/mercados/[id]/productos/[pid]/precios` |
| Importación CSV/XLSX con validación | ✅ Hecho | `/admin/precios/importar` |
| Plantilla descargable para importación | ✅ Hecho | API `/api/admin/price-template` |
| Índices de rendimiento en `price_records` | ⬜ Pendiente | Fase 7 — cuando el volumen lo requiera |

---

## Módulo: Gestión de Clientes / Organizaciones

| Requerimiento | Estado | Notas |
|---|---|---|
| Listado y detalle de organizaciones | ✅ Hecho | `/admin/clientes` |
| Alta de nuevas organizaciones | ✅ Hecho | `/admin/clientes/nuevo` |
| Edición de datos de organización | ✅ Hecho | `/admin/clientes/[id]/editar` |
| Gestión de miembros por organización | ✅ Hecho | `/admin/clientes/[id]` |
| Vista de plan/suscripción de la org | 🟡 Parcial | Estructura DB existe, sin gestión real de Stripe |
| Bloqueo de acceso por estado de suscripción | 🔵 Empresa externa | Requiere Stripe activo |

---

## Módulo: Proveedores

| Requerimiento | Estado | Notas |
|---|---|---|
| Catálogo de proveedores (admin) | ✅ Hecho | `/admin/proveedores` |
| Toggle activo/inactivo de proveedor | ✅ Hecho | `ToggleActiveSupplier` |
| Directorio de proveedores (cliente) | ✅ Hecho | `/app/proveedores` |
| Mapa de proveedores con Leaflet | ✅ Hecho | Coordenadas en tabla `suppliers` |
| Filtros en directorio de proveedores | ✅ Hecho | Por ciudad, sector, etc. |

---

## Módulo: RFQs (Solicitudes de Cotización)

| Requerimiento | Estado | Notas |
|---|---|---|
| Creación de RFQs por el cliente | ✅ Hecho | `/app/rfqs/nueva` |
| Listado y seguimiento de RFQs | ✅ Hecho | `/app/rfqs` |
| Gestión de RFQs por admin | ✅ Hecho | `/admin/rfqs` |
| Respuestas de proveedores a RFQs | ✅ Hecho | `rfq_responses` + UI admin |

---

## Módulo: Noticias y Contenido

| Requerimiento | Estado | Notas |
|---|---|---|
| CMS de noticias (admin) | ✅ Hecho | `/admin/noticias` + editor Tiptap |
| Feed de noticias (cliente) | ✅ Hecho | `/app/noticias` |
| Detalle de noticia | ✅ Hecho | `/app/noticias/[slug]` |

---

## Módulo: Soporte

| Requerimiento | Estado | Notas |
|---|---|---|
| Formulario de creación de tickets | ✅ Hecho | `/app/ayuda` |
| Listado de tickets (admin) | ✅ Hecho | `/admin/soporte` |
| Detalle y respuesta de ticket (admin) | ✅ Hecho | `/admin/soporte/[id]` |
| FAQs | ✅ Hecho | `/app/ayuda` |

---

## Módulo: Mi Organización

| Requerimiento | Estado | Notas |
|---|---|---|
| Vista de datos de la organización | ✅ Hecho | `/app/mi-organizacion` |
| Edición de datos de la organización | ✅ Hecho | `/app/mi-organizacion/editar` |
| Vista de plan y suscripción | 🟡 Parcial | Estructura existe, sin Stripe real |
| Gestión de miembros del equipo | 🟡 Parcial | Vista básica implementada |

---

## Módulo: Dashboard

| Requerimiento | Estado | Notas |
|---|---|---|
| Dashboard admin con métricas globales | ✅ Hecho | `/admin/dashboard` |
| Dashboard cliente con resumen de org | ✅ Hecho | `/app/dashboard` |
| Dashboard personalizado con favoritos | ⬜ Pendiente | Fase 3 |

---

## Módulo: Landing y Conversión

| Requerimiento | Estado | Notas |
|---|---|---|
| Landing principal con propuesta de valor | ✅ Hecho | `/` |
| Páginas legales (aviso, privacidad, cookies) | ✅ Hecho | Existen, pendiente revisión legal |
| Página Enterprise | ✅ Hecho | `/enterprise` |
| Página sobre nosotros | ✅ Hecho | `/sobre-nosotros` |
| WhatsApp CTA visible | ⬜ Pendiente | Fase 5 |
| Teléfono visible en landing/footer | ⬜ Pendiente | Fase 5 |
| LinkedIn visible | ⬜ Pendiente | Fase 5 |
| Logos animados de fuentes oficiales | ⬜ Pendiente | Fase 5 |
| Gráfica demo pública (sin login) | ⬜ Pendiente | Fase 5 |
| Banner sticky CTA | ⬜ Pendiente | Fase 5 |
| Sección "Nuestros Mercados" mejorada | ⬜ Pendiente | Fase 5 |
| Página de precios comercial | 🔵 Empresa externa | Con Stripe — fuera de nuestro alcance |

---

## Módulo: Monetización / Planes (EMPRESA EXTERNA)

| Requerimiento | Estado | Notas |
|---|---|---|
| Integración Stripe | 🔵 Empresa externa | — |
| Checkout de suscripción | 🔵 Empresa externa | — |
| Trial 30 días | 🔵 Empresa externa | — |
| Planes Free / Business / Enterprise | 🔵 Empresa externa | DB estructura existe |
| Portal de suscripción (Stripe Customer Portal) | 🔵 Empresa externa | — |
| Webhooks Stripe | 🔵 Empresa externa | — |
| Emails transaccionales de pago | 🔵 Empresa externa | — |
| Bloqueo de acceso por estado de suscripción | 🔵 Empresa externa | — |

---

## Módulo: Gestor Documental de Facturas (EMPRESA EXTERNA)

| Requerimiento | Estado | Notas |
|---|---|---|
| Subida de PDFs | 🔵 Empresa externa | — |
| Supabase Storage para facturas | 🔵 Empresa externa | — |
| Visualización de PDF | 🔵 Empresa externa | — |
| Descarga de PDF | 🔵 Empresa externa | — |
| Facturas por cliente | 🔵 Empresa externa | — |
| Aislamiento por organización | 🔵 Empresa externa | — |

---

## Módulo: Compliance / RGPD

| Requerimiento | Estado | Notas |
|---|---|---|
| Páginas legales existentes | ✅ Hecho | Pendiente revisión legal real |
| Banner de cookies funcional | ⬜ Pendiente | Fase 6 — requerimiento legal |
| Derecho al olvido (borrado de cuenta) | ⬜ Pendiente | Fase 6 — requiere análisis |
| Revisión legal de textos | ⬜ Pendiente | Requiere asesor legal externo |

---

## Módulo: Registro de Auditoría y Seguridad

| Requerimiento | Estado | Notas |
|---|---|---|
| Timeout de sesión | ⬜ Pendiente | Fase 4 |
| Log de auditoría de acciones admin | ⬜ Pendiente | Fase 4 |
| 2FA | 🔮 Futuro | — |

---

## Resumen ejecutivo

| Categoría | Total requerimientos | Hecho | Parcial | Pendiente (nuestro) | Empresa externa | Futuro |
|---|---|---|---|---|---|---|
| Autenticación | 9 | 6 | 0 | 2 | 0 | 1 |
| Market Intelligence | 10 | 5 | 0 | 3 | 0 | 2 |
| Administración mercados | 7 | 6 | 0 | 1 | 0 | 0 |
| Clientes / Orgs | 6 | 4 | 1 | 0 | 1 | 0 |
| Proveedores | 5 | 5 | 0 | 0 | 0 | 0 |
| RFQs | 4 | 4 | 0 | 0 | 0 | 0 |
| Noticias | 3 | 3 | 0 | 0 | 0 | 0 |
| Soporte | 4 | 4 | 0 | 0 | 0 | 0 |
| Mi Organización | 4 | 2 | 2 | 0 | 0 | 0 |
| Dashboard | 3 | 2 | 0 | 1 | 0 | 0 |
| Landing y conversión | 12 | 5 | 0 | 6 | 1 | 0 |
| Monetización | 8 | 0 | 0 | 0 | 8 | 0 |
| Gestor facturas | 6 | 0 | 0 | 0 | 6 | 0 |
| Compliance RGPD | 4 | 1 | 0 | 3 | 0 | 0 |
| Auditoría y seguridad | 3 | 0 | 0 | 2 | 0 | 1 |

---

## Bloqueantes antes de continuar

Los siguientes puntos están bloqueados hasta que se resuelva la dependencia indicada:

| Bloqueante | Quién desbloquea |
|---|---|
| Monetización / Stripe | Empresa externa — no iniciar hasta onboarding |
| Gestor documental de facturas | Empresa externa — no iniciar hasta onboarding |
| Bloqueo de acceso por suscripción | Empresa externa — depende de Stripe activo |
| Nuevas migraciones (billing, facturas) | Empresa externa — requieren aprobación previa |
| Índices de rendimiento `price_records` | Equipo principal — activar cuando el volumen lo justifique |
| Revisión textos legales | Asesor legal externo |
| 2FA | Fase posterior — base de seguridad consolidada primero |
