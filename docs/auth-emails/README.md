# Plantillas de correo de Supabase Auth — MIRA Pricing

> **Generado automáticamente. No editar a mano.**
> El contenido se cambia en `src/lib/email/auth-templates.ts` y se regenera con
> `npm run email:auth-templates`. Un test comprueba que estos ficheros y el
> código no se separen.

Logotipo: _sin logotipo — se usa el nombre en texto_
Enlace del pie: https://demo.mirapricing.com

## Cómo se pegan

Panel de Supabase → **Authentication → Emails**. Para cada plantilla:
el asunto va en «Subject heading» y el contenido íntegro del `.html` en
«Message body».

| Plantilla en Supabase | Asunto | Fichero | ¿La usa la app hoy? |
|---|---|---|---|
| Confirm signup | Activa tu acceso a MIRA Pricing | [`confirm-signup.html`](./confirm-signup.html) | **Sí** |
| Reset Password | Restablece tu contraseña de MIRA Pricing | [`reset-password.html`](./reset-password.html) | **Sí** |
| Change Email Address | Confirma tu nueva dirección de correo | [`change-email.html`](./change-email.html) | No — preparada |
| Invite user | Te han invitado a MIRA Pricing | [`invite-user.html`](./invite-user.html) | **Sí** |
| Magic Link | Tu enlace de acceso a MIRA Pricing | [`magic-link.html`](./magic-link.html) | No — preparada |
