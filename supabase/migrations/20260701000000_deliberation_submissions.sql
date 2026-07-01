-- Track one-statement-per-user constraint for Polis deliberations.
-- The unique constraint on (process_id, user_id) enforces the limit at the DB level.
create table if not exists deliberation_submissions (
  process_id text not null,
  user_id    text not null,
  created_at timestamptz not null default now(),
  primary key (process_id, user_id)
);
