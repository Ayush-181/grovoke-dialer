CREATE OR REPLACE FUNCTION public.dashboard_stats(_workspace_id uuid, _month_start date DEFAULT date_trunc('month', now())::date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE result jsonb; _from timestamptz; _to timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = _workspace_id AND m.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not a member';
  END IF;

  _from := date_trunc('month', _month_start::timestamptz);
  _to := _from + interval '1 month';

  SELECT jsonb_build_object(
    'calls_today', count(*) FILTER (WHERE called_at >= date_trunc('day', now())),
    'calls_total', count(*),
    'unique_leads', count(DISTINCT lead_id),
    'dials', count(*) FILTER (WHERE direction = 'outbound'),
    'pickups', count(*) FILTER (WHERE direction = 'outbound' AND outcome IN
      ('connected_dm','connected_gk','connected_other','appointment_set','callback_requested','not_interested','do_not_call')),
    'connected', count(*) FILTER (WHERE outcome IN
      ('connected_dm','connected_gk','connected_other','appointment_set','callback_requested')),
    'dm_reached', count(*) FILTER (WHERE outcome = 'connected_dm'),
    'gatekeeper', count(*) FILTER (WHERE outcome = 'connected_gk'),
    'connected_other', count(*) FILTER (WHERE outcome = 'connected_other'),
    'voicemail', count(*) FILTER (WHERE outcome = 'voicemail'),
    'no_answer', count(*) FILTER (WHERE outcome = 'no_answer'),
    'busy', count(*) FILTER (WHERE outcome = 'busy'),
    'not_interested', count(*) FILTER (WHERE outcome = 'not_interested'),
    'callback_requested', count(*) FILTER (WHERE outcome = 'callback_requested'),
    'do_not_call', count(*) FILTER (WHERE outcome = 'do_not_call'),
    'bad_number', count(*) FILTER (WHERE outcome = 'bad_number'),
    'dialed', count(*) FILTER (WHERE outcome = 'dialed'),
    'triage_held', count(*) FILTER (WHERE triage_held),
    'appointments_offered', count(*) FILTER (WHERE appointment_offered),
    'appointments_booked', count(*) FILTER (WHERE outcome = 'appointment_set'),
    'total_talk_seconds', coalesce(sum(duration_seconds), 0),
    'avg_duration_seconds', coalesce(round(avg(duration_seconds) FILTER (WHERE duration_seconds > 0))::int, 0),
    'month_start', to_char(_from, 'YYYY-MM-DD'),
    'daily', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'day', s.day, 'calls', s.calls, 'dials', s.dials, 'pickups', s.pickups,
        'connect_rate', CASE WHEN s.dials > 0 THEN round((s.pickups::numeric / s.dials) * 100, 1) ELSE 0 END
      ) ORDER BY s.day), '[]'::jsonb)
      FROM (
        SELECT to_char(date_trunc('day', called_at), 'YYYY-MM-DD') AS day,
               count(*) AS calls,
               count(*) FILTER (WHERE direction = 'outbound') AS dials,
               count(*) FILTER (WHERE direction = 'outbound' AND outcome IN
                 ('connected_dm','connected_gk','connected_other','appointment_set','callback_requested','not_interested','do_not_call')) AS pickups
        FROM public.dial_call_logs
        WHERE workspace_id = _workspace_id AND called_at >= _from AND called_at < _to
        GROUP BY date_trunc('day', called_at)
      ) s
    )
  ) INTO result FROM public.dial_call_logs
  WHERE workspace_id = _workspace_id AND called_at >= _from AND called_at < _to;
  RETURN result;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.dashboard_stats(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_stats(uuid, date) TO authenticated;