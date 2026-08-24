DROP POLICY IF EXISTS "members read workspaces" ON public.workspaces;
CREATE POLICY "members read workspaces" ON public.workspaces FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR public.is_workspace_member(id, auth.uid()));