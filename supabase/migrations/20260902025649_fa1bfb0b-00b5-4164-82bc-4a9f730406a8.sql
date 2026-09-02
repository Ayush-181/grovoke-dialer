ALTER TABLE public.dial_call_logs
  ADD COLUMN IF NOT EXISTS missed_call_acknowledged boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_dial_call_logs_missed
  ON public.dial_call_logs (workspace_id)
  WHERE direction = 'inbound' AND missed_call_acknowledged = false;