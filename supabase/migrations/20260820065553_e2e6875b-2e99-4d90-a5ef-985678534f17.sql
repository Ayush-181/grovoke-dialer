
CREATE TYPE public.lead_status AS ENUM ('new','in_progress','completed','disqualified');
CREATE TYPE public.lead_outcome AS ENUM ('connected_dm','connected_gk','connected_other','voicemail','busy','no_answer','bad_number','not_interested','do_not_call','callback_requested','appointment_set','dialed');
CREATE TYPE public.session_status AS ENUM ('pending','active','paused','completed');
CREATE TYPE public.session_lead_status AS ENUM ('queued','dialing','done','skipped');

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- workspaces
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = _workspace_id AND m.user_id = _user_id);
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  default_anchor_zone text NOT NULL DEFAULT 'Asia/Kolkata',
  mic_device_id text,
  last_workspace_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workspace_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces ON DELETE CASCADE,
  twilio_account_sid text,
  twilio_auth_token text,
  twilio_api_key_sid text,
  twilio_api_key_secret text,
  twilio_twiml_app_sid text,
  twilio_phone_number text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  business_name text NOT NULL,
  phone text NOT NULL,
  phone_normalized text NOT NULL,
  address text, city text, state text, zip text,
  website text, email text, notes text,
  status public.lead_status NOT NULL DEFAULT 'new',
  outcome public.lead_outcome,
  last_called_at timestamptz,
  call_count integer NOT NULL DEFAULT 0,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, phone_normalized)
);
CREATE INDEX leads_ws_status_idx ON public.leads (workspace_id, status);
CREATE INDEX leads_ws_outcome_idx ON public.leads (workspace_id, outcome);
CREATE INDEX leads_ws_city_idx ON public.leads (workspace_id, city);
CREATE INDEX leads_ws_state_idx ON public.leads (workspace_id, state);
CREATE INDEX leads_ws_created_idx ON public.leads (workspace_id, created_at DESC);
CREATE INDEX leads_search_idx ON public.leads USING gin (to_tsvector('simple', coalesce(business_name,'') || ' ' || coalesce(city,'') || ' ' || coalesce(address,'') || ' ' || coalesce(phone,'')));

CREATE TABLE public.calling_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  name text NOT NULL,
  status public.session_status NOT NULL DEFAULT 'pending',
  filters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_leads integer NOT NULL DEFAULT 0,
  completed_leads integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calling_sessions_ws_idx ON public.calling_sessions (workspace_id, created_at DESC);

CREATE TABLE public.session_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.calling_sessions ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads ON DELETE CASCADE,
  phone_normalized text NOT NULL,
  queue_position integer NOT NULL,
  status public.session_lead_status NOT NULL DEFAULT 'queued',
  outcome public.lead_outcome,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, phone_normalized)
);
CREATE INDEX session_leads_queue_idx ON public.session_leads (session_id, status, queue_position);

CREATE TABLE public.dial_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads ON DELETE SET NULL,
  session_id uuid REFERENCES public.calling_sessions ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  call_sid text,
  phone text NOT NULL,
  business_name text,
  direction text NOT NULL DEFAULT 'outbound',
  duration_seconds integer NOT NULL DEFAULT 0,
  outcome public.lead_outcome,
  notes text,
  recording_url text,
  transcript text,
  called_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dial_call_logs_ws_called_idx ON public.dial_call_logs (workspace_id, called_at DESC);
CREATE INDEX dial_call_logs_lead_idx ON public.dial_call_logs (lead_id, called_at DESC);

CREATE TABLE public.saved_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name text NOT NULL,
  filters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces, public.workspace_members, public.profiles,
  public.user_preferences, public.workspace_settings, public.leads, public.calling_sessions,
  public.session_leads, public.dial_call_logs, public.saved_filters TO authenticated;
GRANT ALL ON public.workspaces, public.workspace_members, public.profiles, public.user_preferences,
  public.workspace_settings, public.leads, public.calling_sessions, public.session_leads,
  public.dial_call_logs, public.saved_filters TO service_role;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calling_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dial_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read workspaces" ON public.workspaces FOR SELECT TO authenticated
  USING (public.is_workspace_member(id, auth.uid()));
CREATE POLICY "users create workspaces" ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "owner updates workspace" ON public.workspaces FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "owner deletes workspace" ON public.workspaces FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "members read membership" ON public.workspace_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "self or owner insert membership" ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid()));
CREATE POLICY "owner deletes membership" ON public.workspace_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid()));

CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "own prefs" ON public.user_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "members read settings" ON public.workspace_settings FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "owner writes settings" ON public.workspace_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid()));

CREATE POLICY "members manage leads" ON public.leads FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "members manage sessions" ON public.calling_sessions FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "members manage session leads" ON public.session_leads FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "members manage call logs" ON public.dial_call_logs FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "own saved filters" ON public.saved_filters FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER t_leads_upd BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_sessions_upd BEFORE UPDATE ON public.calling_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_calls_upd BEFORE UPDATE ON public.dial_call_logs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_ws_upd BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_prof_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_prefs_upd BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- dashboard stats RPC
CREATE OR REPLACE FUNCTION public.dashboard_stats(_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'not a member';
  END IF;
  SELECT jsonb_build_object(
    'calls_today', count(*) FILTER (WHERE called_at >= date_trunc('day', now())),
    'calls_week', count(*) FILTER (WHERE called_at >= date_trunc('week', now())),
    'calls_month', count(*) FILTER (WHERE called_at >= date_trunc('month', now())),
    'calls_total', count(*),
    'unique_leads', count(DISTINCT lead_id),
    'connected', count(*) FILTER (WHERE outcome IN ('connected_dm','connected_gk','connected_other','appointment_set','callback_requested')),
    'daily', (
      SELECT coalesce(jsonb_agg(d ORDER BY d->>'day'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('day', to_char(date_trunc('day', called_at), 'YYYY-MM-DD'), 'calls', count(*)) AS d
        FROM public.dial_call_logs
        WHERE workspace_id = _workspace_id AND called_at >= now() - interval '29 days'
        GROUP BY 1
      ) s
    )
  ) INTO result FROM public.dial_call_logs WHERE workspace_id = _workspace_id;
  RETURN result;
END; $$;
GRANT EXECUTE ON FUNCTION public.dashboard_stats(uuid) TO authenticated;
