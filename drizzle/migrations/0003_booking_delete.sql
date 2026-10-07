GRANT DELETE ON public.bookings TO authenticated;
CREATE POLICY "creator deletes booking" ON public.bookings FOR DELETE TO authenticated
  USING (created_by = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()));
