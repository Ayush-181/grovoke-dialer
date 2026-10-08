-- Count recorded outbound attempts atomically, including unanswered calls.
-- Updating an outcome/duration/recording must not count the same call again.
CREATE OR REPLACE FUNCTION public.increment_lead_call_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL AND NEW.direction = 'outbound' THEN
    UPDATE public.leads
    SET call_count = call_count + 1
    WHERE id = NEW.lead_id AND workspace_id = NEW.workspace_id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.increment_lead_call_count() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS t_outbound_lead_call_count ON public.dial_call_logs;
CREATE TRIGGER t_outbound_lead_call_count
AFTER INSERT ON public.dial_call_logs
FOR EACH ROW EXECUTE FUNCTION public.increment_lead_call_count();
--> statement-breakpoint
-- Preserve cumulative counts if historical logs were deleted; fill missing counts.
UPDATE public.leads AS lead
SET call_count = GREATEST(lead.call_count, history.total)
FROM (
  SELECT workspace_id, lead_id, count(*)::integer AS total
  FROM public.dial_call_logs
  WHERE lead_id IS NOT NULL AND direction = 'outbound'
  GROUP BY workspace_id, lead_id
) AS history
WHERE lead.id = history.lead_id AND lead.workspace_id = history.workspace_id;
