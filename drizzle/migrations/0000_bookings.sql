CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  lead_timezone text NOT NULL,
  attendees text[] NOT NULL DEFAULT '{}',
  notes text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  add_meet boolean NOT NULL DEFAULT true,
  google_account_email text NOT NULL,
  google_event_id text NOT NULL,
  google_event_url text,
  meet_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (google_account_email, google_event_id)
);
CREATE INDEX bookings_workspace_start_idx ON public.bookings(workspace_id, starts_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members read bookings" ON public.bookings FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "members create own bookings" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid())
    AND (lead_id IS NULL OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.workspace_id = bookings.workspace_id)));
CREATE POLICY "creator updates booking" ON public.bookings FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (created_by = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid())
    AND (lead_id IS NULL OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.workspace_id = bookings.workspace_id)));