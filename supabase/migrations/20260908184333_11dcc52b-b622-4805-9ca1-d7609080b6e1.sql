CREATE OR REPLACE FUNCTION public.dashboard_stats(_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = _workspace_id AND m.user_id = auth.uid()) THEN
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
      SELECT coalesce(jsonb_agg(jsonb_build_object('day', s.day, 'calls', s.calls) ORDER BY s.day), '[]'::jsonb)
      FROM (
        SELECT to_char(date_trunc('day', called_at), 'YYYY-MM-DD') AS day, count(*) AS calls
        FROM public.dial_call_logs
        WHERE workspace_id = _workspace_id AND called_at >= now() - interval '29 days'
        GROUP BY date_trunc('day', called_at)
      ) s
    )
  ) INTO result FROM public.dial_call_logs WHERE workspace_id = _workspace_id;
  RETURN result;
END; $function$;