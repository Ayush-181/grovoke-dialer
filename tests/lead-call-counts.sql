-- Run only against an empty disposable PostgreSQL database:
-- psql -v ON_ERROR_STOP=1 -f tests/lead-call-counts.sql
BEGIN;
CREATE TABLE public.leads (
  id text PRIMARY KEY, workspace_id text NOT NULL, call_count integer NOT NULL DEFAULT 0
);
CREATE TABLE public.dial_call_logs (
  id text PRIMARY KEY, lead_id text REFERENCES public.leads(id), workspace_id text NOT NULL,
  direction text NOT NULL DEFAULT 'outbound', outcome text, duration_seconds integer
);
INSERT INTO public.leads VALUES
  ('called', 'workspace', 0), ('untouched', 'workspace', 0),
  ('preserved', 'workspace', 7), ('other', 'other-workspace', 0);
INSERT INTO public.dial_call_logs VALUES
  ('old-1', 'called', 'workspace', 'outbound', 'no_answer', 0),
  ('old-2', 'called', 'workspace', 'outbound', 'connected_dm', 42),
  ('old-inbound', 'called', 'workspace', 'inbound', 'connected_dm', 5),
  ('old-preserved', 'preserved', 'workspace', 'outbound', 'dialed', 0);

\ir ../drizzle/migrations/0005_lead_call_counts.sql

DO $$ BEGIN
  ASSERT (SELECT call_count FROM public.leads WHERE id = 'called') = 2, 'backfill';
  ASSERT (SELECT call_count FROM public.leads WHERE id = 'preserved') = 7, 'preserve history';
  ASSERT (SELECT call_count FROM public.leads WHERE id = 'untouched') = 0, 'untouched';
END $$;

INSERT INTO public.dial_call_logs VALUES ('new-1', 'called', 'workspace', 'outbound', 'dialed', 0);
UPDATE public.dial_call_logs SET outcome = 'no_answer', duration_seconds = 5 WHERE id = 'new-1';
INSERT INTO public.dial_call_logs VALUES
  ('new-inbound', 'called', 'workspace', 'inbound', 'connected_dm', 10),
  ('unlinked', NULL, 'workspace', 'outbound', 'dialed', 0),
  ('mismatched', 'other', 'workspace', 'outbound', 'dialed', 0);
DO $$ BEGIN
  ASSERT (SELECT call_count FROM public.leads WHERE id = 'called') = 3, 'count once';
  ASSERT (SELECT call_count FROM public.leads WHERE id = 'other') = 0, 'workspace isolation';
END $$;

SAVEPOINT call_rollback;
INSERT INTO public.dial_call_logs VALUES ('rolled-back', 'called', 'workspace', 'outbound', 'dialed', 0);
ROLLBACK TO SAVEPOINT call_rollback;
\ir ../drizzle/migrations/0005_lead_call_counts.sql
DO $$ BEGIN
  ASSERT (SELECT call_count FROM public.leads WHERE id = 'called') = 3, 'rollback and rerun';
END $$;

INSERT INTO public.dial_call_logs VALUES ('new-2', 'called', 'workspace', 'outbound', 'busy', 0);
DELETE FROM public.dial_call_logs WHERE id = 'new-2';
DO $$ BEGIN
  ASSERT (SELECT call_count FROM public.leads WHERE id = 'called') = 4, 'cumulative count';
END $$;
ROLLBACK;
