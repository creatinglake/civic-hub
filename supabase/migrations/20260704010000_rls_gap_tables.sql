-- Close the RLS gap (audit #8). Five tables added after the initial schema
-- never had Row-Level Security enabled, unlike the project convention
-- (ENABLE + FORCE, zero policies = deny-all). The backend uses the service-role
-- key, which BYPASSES RLS, so it is unaffected — this restores uniform
-- default-deny so a leaked/misused anon key can't read these tables. Two hold
-- PII: feedback_submissions (name/email), deliberation_votes (who voted on
-- which statement).
--
-- Apply via Supabase → SQL Editor (dev, then prod). Safe on a running system:
-- service-role access is unchanged; there is no client-side anon path to these
-- tables today.

ALTER TABLE link_previews            ENABLE ROW LEVEL SECURITY;
ALTER TABLE link_previews            FORCE  ROW LEVEL SECURITY;

ALTER TABLE feedback_submissions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_submissions     FORCE  ROW LEVEL SECURITY;

ALTER TABLE wordcloud_submissions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE wordcloud_submissions    FORCE  ROW LEVEL SECURITY;

ALTER TABLE deliberation_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliberation_submissions FORCE  ROW LEVEL SECURITY;

ALTER TABLE deliberation_votes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliberation_votes       FORCE  ROW LEVEL SECURITY;
