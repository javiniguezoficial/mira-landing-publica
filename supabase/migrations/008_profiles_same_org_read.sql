-- 008_profiles_same_org_read.sql
-- Policy aditiva de solo lectura: permite a miembros de una org
-- ver los perfiles de otros miembros de la misma org.
-- No modifica ninguna policy existente de profiles.
CREATE POLICY "profiles_same_org_select"
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om_viewer
      JOIN public.organization_members om_target
        ON om_viewer.organization_id = om_target.organization_id
      WHERE om_viewer.user_id = auth.uid()
        AND om_target.user_id = profiles.id
    )
  );
