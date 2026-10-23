-- REVIEW ONLY: this migration is not executed by the Codex workflow.
-- Reuses legacy tables; this row stores additive configuration and detailed call metadata.
CREATE TABLE IF NOT EXISTS public.callboard_workspace_state (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.callboard_workspace_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members read callboard state" ON public.callboard_workspace_state
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = callboard_workspace_state.workspace_id AND m.user_id = auth.uid()
  ));
GRANT SELECT ON public.callboard_workspace_state TO authenticated;
GRANT ALL ON public.callboard_workspace_state TO service_role;

CREATE OR REPLACE FUNCTION public.save_callboard_workspace(
  p_workspace_id uuid, p_expected_revision bigint, p_document jsonb, p_changes jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_revision bigint;
  v_previous jsonb;
  v_item jsonb;
  v_record jsonb;
  v_patch jsonb;
  v_id uuid;
  v_lead_id uuid;
  v_session_id uuid;
  v_position integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspace_members WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Workspace access denied' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_document) <> 'object' OR jsonb_typeof(p_changes) <> 'object'
    OR octet_length(p_document::text) > 20000000 OR octet_length(p_changes::text) > 20000000
    THEN RAISE EXCEPTION 'Invalid workspace payload' USING ERRCODE = '22023'; END IF;
  SELECT revision,data INTO v_revision,v_previous FROM public.callboard_workspace_state WHERE workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN
    IF p_expected_revision <> 0 THEN RAISE EXCEPTION 'Workspace revision conflict' USING ERRCODE = '40001'; END IF;
    INSERT INTO public.callboard_workspace_state(workspace_id) VALUES(p_workspace_id);
    v_revision := 0;
  END IF;
  IF v_revision <> p_expected_revision THEN RAISE EXCEPTION 'Workspace revision conflict' USING ERRCODE = '40001'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_changes->'leads','[]'::jsonb)) LOOP
    v_id := (v_item->>'id')::uuid; v_record := v_item->'record'; v_patch := v_item->'patch';
    IF EXISTS(SELECT 1 FROM public.leads WHERE id=v_id AND workspace_id<>p_workspace_id)
      THEN RAISE EXCEPTION 'Lead workspace mismatch' USING ERRCODE='42501'; END IF;
    IF coalesce(v_record->>'business_name','') = '' OR coalesce(v_record->>'phone_normalized','') !~ '^\+[1-9][0-9]{7,14}$'
      THEN RAISE EXCEPTION 'Invalid lead identity' USING ERRCODE='22023'; END IF;
    INSERT INTO public.leads(id,workspace_id,business_name,phone,phone_normalized,city,owner_name,email,website,notes,outcome,metadata_json)
      VALUES(v_id,p_workspace_id,v_record->>'business_name',v_record->>'phone',v_record->>'phone_normalized',v_record->>'city',v_record->>'owner_name',v_record->>'email',v_record->>'website',v_record->>'notes',(v_record->>'outcome')::public.lead_outcome,coalesce(v_record->'metadata_json','{}'::jsonb))
      ON CONFLICT(id) DO UPDATE SET
        business_name=CASE WHEN v_patch?'business_name' THEN v_record->>'business_name' ELSE leads.business_name END,
        phone=CASE WHEN v_patch?'phone' THEN v_record->>'phone' ELSE leads.phone END,
        phone_normalized=CASE WHEN v_patch?'phone_normalized' THEN v_record->>'phone_normalized' ELSE leads.phone_normalized END,
        city=CASE WHEN v_patch?'city' THEN v_record->>'city' ELSE leads.city END,
        owner_name=CASE WHEN v_patch?'owner_name' THEN v_record->>'owner_name' ELSE leads.owner_name END,
        email=CASE WHEN v_patch?'email' THEN v_record->>'email' ELSE leads.email END,
        website=CASE WHEN v_patch?'website' THEN v_record->>'website' ELSE leads.website END,
        notes=CASE WHEN v_patch?'notes' THEN v_record->>'notes' ELSE leads.notes END,
        outcome=CASE WHEN v_patch?'outcome' THEN (v_record->>'outcome')::public.lead_outcome ELSE leads.outcome END,
        metadata_json=CASE WHEN v_patch?'metadata_json' THEN coalesce(leads.metadata_json,'{}'::jsonb)||jsonb_build_object('callboard',v_record->'metadata_json'->'callboard') ELSE leads.metadata_json END;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_changes->'sessions','[]'::jsonb)) LOOP
    v_id := (v_item->>'id')::uuid;
    IF EXISTS(SELECT 1 FROM public.calling_sessions WHERE id=v_id AND workspace_id<>p_workspace_id)
      THEN RAISE EXCEPTION 'Session workspace mismatch' USING ERRCODE='42501'; END IF;
    INSERT INTO public.calling_sessions(id,workspace_id,created_by,name,status,total_leads)
      VALUES(v_id,p_workspace_id,auth.uid(),v_item->>'name',(v_item->>'status')::public.session_status,jsonb_array_length(v_item->'leadIds'))
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,status=excluded.status,total_leads=excluded.total_leads;
    DELETE FROM public.session_leads WHERE session_id=v_id AND workspace_id=p_workspace_id
      AND lead_id NOT IN (SELECT (value#>>'{}')::uuid FROM jsonb_array_elements(v_item->'leadIds'));
    v_position := 0;
    FOR v_record IN SELECT value FROM jsonb_array_elements(v_item->'leadIds') LOOP
      v_lead_id := (v_record#>>'{}')::uuid;
      IF NOT EXISTS(SELECT 1 FROM public.leads WHERE id=v_lead_id AND workspace_id=p_workspace_id)
        THEN RAISE EXCEPTION 'Queue lead workspace mismatch' USING ERRCODE='42501'; END IF;
      UPDATE public.session_leads SET queue_position=v_position,phone_normalized=(SELECT phone_normalized FROM public.leads WHERE id=v_lead_id AND workspace_id=p_workspace_id) WHERE session_id=v_id AND lead_id=v_lead_id AND workspace_id=p_workspace_id;
      IF NOT FOUND THEN
        INSERT INTO public.session_leads(session_id,workspace_id,lead_id,phone_normalized,queue_position)
          SELECT v_id,p_workspace_id,id,phone_normalized,v_position FROM public.leads WHERE id=v_lead_id AND workspace_id=p_workspace_id;
      END IF;
      v_position := v_position + 1;
    END LOOP;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_changes->'logs','[]'::jsonb)) LOOP
    v_id := (v_item->>'id')::uuid; v_lead_id := (v_item->>'lead_id')::uuid; v_session_id := (v_item->>'session_id')::uuid;
    IF EXISTS(SELECT 1 FROM public.dial_call_logs WHERE id=v_id AND workspace_id<>p_workspace_id)
      OR (v_lead_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.leads WHERE id=v_lead_id AND workspace_id=p_workspace_id))
      OR (v_session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.calling_sessions WHERE id=v_session_id AND workspace_id=p_workspace_id))
      THEN RAISE EXCEPTION 'Call workspace mismatch' USING ERRCODE='42501'; END IF;
    INSERT INTO public.dial_call_logs(id,workspace_id,user_id,lead_id,session_id,phone,called_at,outcome,notes,duration_seconds,business_name,triage_held,appointment_offered,direction)
      VALUES(v_id,p_workspace_id,auth.uid(),v_lead_id,v_session_id,v_item->>'phone',(v_item->>'called_at')::timestamptz,(v_item->>'outcome')::public.lead_outcome,v_item->>'notes',greatest(0,(v_item->>'duration_seconds')::integer),v_item->>'business_name',coalesce((v_item->>'triage_held')::boolean,false),coalesce((v_item->>'appointment_offered')::boolean,false),'outbound')
      ON CONFLICT(id) DO UPDATE SET outcome=excluded.outcome,notes=excluded.notes,duration_seconds=excluded.duration_seconds,triage_held=excluded.triage_held,appointment_offered=excluded.appointment_offered;
  END LOOP;
  -- The legacy outbound-insert trigger increments lead call_count once; retries only UPDATE.
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_changes->'deletedLeadIds','[]'::jsonb)) LOOP
    DELETE FROM public.leads WHERE id=(v_item#>>'{}')::uuid AND workspace_id=p_workspace_id;
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_changes->'deletedBookingIds','[]'::jsonb)) LOOP
    DELETE FROM public.bookings WHERE id=(v_item#>>'{}')::uuid AND workspace_id=p_workspace_id AND created_by=auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found or not owned by this user' USING ERRCODE='42501'; END IF;
  END LOOP;
  -- Profile and microphone defaults belong to the saving user, not every member.
  p_document := (p_document - 'preferences' - 'recordingEnabled' - 'userSettings') || jsonb_build_object(
    'userSettings', coalesce(v_previous->'userSettings','{}'::jsonb) || jsonb_build_object(
      auth.uid()::text, jsonb_build_object('preferences',p_document->'preferences','recordingEnabled',p_document->'recordingEnabled')
    )
  );
  UPDATE public.callboard_workspace_state SET data=p_document,revision=v_revision+1,updated_at=now() WHERE workspace_id=p_workspace_id;
  RETURN v_revision+1;
END;
$$;
REVOKE ALL ON FUNCTION public.save_callboard_workspace(uuid,bigint,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_callboard_workspace(uuid,bigint,jsonb,jsonb) TO authenticated;

-- Service-only call-leg registry; browser commands must authenticate and own the attempt.
CREATE TABLE IF NOT EXISTS public.callboard_voice_attempts (
  id uuid PRIMARY KEY REFERENCES public.dial_call_logs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  browser_call_sid text NOT NULL,
  legs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(legs) = 'array'),
  ended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.callboard_voice_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.callboard_voice_attempts FROM anon, authenticated;
GRANT ALL ON public.callboard_voice_attempts TO service_role;
