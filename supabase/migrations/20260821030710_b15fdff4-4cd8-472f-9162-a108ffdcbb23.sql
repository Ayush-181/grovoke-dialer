CREATE OR REPLACE FUNCTION public.dashboard_stats(_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
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
      SELECT coalesce(jsonb_agg(d ORDER BY d->>'day'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('day', to_char(date_trunc('day', called_at), 'YYYY-MM-DD'), 'calls', count(*)) AS d
        FROM public.dial_call_logs
        WHERE workspace_id = _workspace_id AND called_at >= now() - interval '29 days'
        GROUP BY 1
      ) s
    )
  ) INTO result FROM public.dial_call_logs WHERE workspace_id = _workspace_id;
  RETURN result;
END; $function$;

REVOKE ALL ON FUNCTION public.dashboard_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_stats(uuid) TO authenticated;