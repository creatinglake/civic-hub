-- Close the RLS gap (audit #8). Five tables added after the initial schema
-- never had Row-Level Security enabled, unlike the project convention
-- (ENABLE + FORCE, zero policies = deny-all). The backend uses the service-role
-- key, which BYPASSES RLS, so it is unaffected — this restores uniform
-- default-deny so a leaked/misused anon key can't read these tables. Two hold
-- PII: feedback_submissions (name/email), deliberation_votes (who voted on
-- which statement).
--
-- Guarded per-table so it runs cleanly on any environment even if some tables
-- haven't been created yet (dev/prod migration drift). Apply via Supabase →
-- SQL Editor (dev, then prod). Safe on a running system: service-role access is
-- unchanged; there is no client-side anon path to these tables today.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'link_previews','feedback_submissions','wordcloud_submissions',
    'deliberation_submissions','deliberation_votes'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE  ROW LEVEL SECURITY', t);
      RAISE NOTICE 'RLS enabled on %', t;
    ELSE
      RAISE NOTICE 'skipped (table missing): %', t;
    END IF;
  END LOOP;
END $$;
