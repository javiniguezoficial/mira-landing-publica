-- ═════════════════════════════════════════════════════════════════════════════
-- 050 · `market_existing_price_keys` deja de pagar la RLS fila a fila
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ── La incidencia ───────────────────────────────────────────────────────────
--
-- 28-08-2026, ~13:28. La validación de la importación de precios devuelve
-- «No se ha podido procesar el archivo» para CUALQUIER fichero, incluidos los
-- ya importados antes. Cero batches creados en esa franja: el fallo es
-- anterior a persistir nada. Los logs de Postgres lo dicen en claro — seis
-- «canceling statement due to statement timeout» entre las 11:21 y las 11:32
-- UTC, y NI UNO en las 23 horas anteriores.
--
-- La sentencia cancelada es esta RPC. Medida con su llamada real, mismos
-- datos, mismo periodo (año 2025, 37.280 precios en rango):
--
--   como postgres (sin RLS)        1.043 ms
--   como authenticated (con RLS)   6.467 ms   ← a un suspiro del techo de 8 s
--
-- El coste es LINEAL con los precios del periodo (~54 µs/fila de policy):
-- año 2023 (4.165 filas) → 210 ms; año 2025 (37.280) → 2.016 ms en frío, 6,5 s
-- en caliente. Con la instancia cargada, cruza los 8 s del rol authenticated y
-- statement_timeout la mata: la Server Action recibe el error, lo registra
-- como «[import] claves existentes: 57014» en el log del contenedor y devuelve
-- el mensaje genérico.
--
-- ── Por qué se rompió AHORA y no antes ──────────────────────────────────────
--
-- No fue el despliegue de a230621: `validateImportFile` no cambió en ese
-- commit (solo textos), y las importaciones de esta misma mañana —posteriores
-- a las migraciones 048/049— funcionaron. Lo que cambió fue el VOLUMEN: el
-- propio cliente, importando su histórico con el flujo ya arreglado, llevó los
-- años 2025 y 2026 de unas decenas de filas a 37.280 y 19.119. Los ficheros de
-- la mañana eran de 2023 (4.165 filas en rango: 210 ms, pasaban); los de
-- mediodía eran de 2025. Cada importación con éxito hacía más lenta la
-- siguiente validación del mismo periodo. La avería estaba latente desde el
-- diseño de la RPC; el arreglo del transporte simplemente permitió por fin
-- meter datos suficientes para pisarla.
--
-- ── El arreglo ──────────────────────────────────────────────────────────────
--
-- La RPC corre ahora como SECURITY DEFINER con comprobación interna de
-- `is_platform_admin()`, el MISMO patrón que `commit_market_import` (030) y
-- con la misma justificación: la llama únicamente el importador, que es
-- terreno exclusivo de administradores de plataforma, y un admin ve todos los
-- precios por definición — la policy `admin_all_price_records` es literalmente
-- `using (is_platform_admin())`. Evaluar esa policy 37.280 veces por llamada
-- no protegía nada: solo cobraba. La comprobación pasa de una-por-fila a
-- una-por-llamada, y queda EN LA BASE, no en la interfaz: un authenticated sin
-- rol de admin recibe 42501, llame desde donde llame.
--
-- `language plpgsql` en lugar de `sql` porque el guard necesita `raise`.
-- STABLE se conserva: sigue siendo una lectura pura.

create or replace function public.market_existing_price_keys(
  p_product_ids uuid[],
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Autorización dentro de la función. Sin esta línea, `security definer`
  -- dejaría leer la tabla entera de precios a cualquier `authenticated`.
  if not public.is_platform_admin() then
    raise exception 'Solo un administrador de plataforma puede consultar las claves de importación.'
      using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_array(
             r.product_id::text,
             to_char(r.recorded_at, 'YYYY-MM-DD'),
             coalesce(r.currency, ''),
             r.unit,
             coalesce(btrim(r.lonja), '')
           )), '[]'::jsonb)
      from public.product_price_records r
     where r.product_id = any(p_product_ids)
       and r.recorded_at >= p_from
       and r.recorded_at <= p_to
  );
end;
$$;

comment on function public.market_existing_price_keys(uuid[], date, date) is
  '050 — claves naturales ya guardadas para el periodo de una importación. '
  'SECURITY DEFINER con comprobación interna de platform_admin: la policy de '
  'admin es is_platform_admin() y evaluarla fila a fila sobre decenas de miles '
  'de precios rozaba el statement_timeout de 8 s. Una comprobación por llamada '
  'protege lo mismo y cuesta lo mismo con 100 filas que con 100.000.';

-- La lección de la 029, una vez más: el esquema concede EXECUTE a `anon` de
-- forma DIRECTA vía default privileges, y revocar de PUBLIC no lo toca.
revoke all on function public.market_existing_price_keys(uuid[], date, date) from public;
revoke all on function public.market_existing_price_keys(uuid[], date, date) from anon;
grant execute on function public.market_existing_price_keys(uuid[], date, date) to authenticated, service_role;
