---
name: feedback-approval-workflow
description: El usuario requiere aprobación explícita antes de SQL, commits o cambios destructivos
metadata:
  type: feedback
---

Mostrar SQL de migraciones antes de aplicar en Supabase. No hacer commits hasta que el usuario los revise. No modificar producción directamente. No inventar keys/secrets.

**Why:** El usuario quiere control total sobre cada paso antes de que toque producción o base de datos.
**How to apply:** Antes de cualquier migración SQL, listar el contenido y esperar confirmación. Antes de commit, mostrar el diff resumido y pedir OK.
