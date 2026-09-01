ALTER TABLE public.workspace_settings ADD COLUMN IF NOT EXISTS fallback_phone_number text;
ALTER TABLE public.dial_call_logs ALTER COLUMN direction SET DEFAULT 'outbound';
UPDATE public.dial_call_logs SET direction = 'outbound' WHERE direction IS NULL OR direction = '';