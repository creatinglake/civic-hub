-- Track which statements each user has voted on, so the server can
-- distinguish new participants (Polis returns null because they're
-- unregistered) from users who voted on everything (legitimately done).
create table if not exists deliberation_votes (
  process_id   text not null,
  user_id      text not null,
  statement_id integer not null,
  created_at   timestamptz not null default now(),
  primary key (process_id, user_id, statement_id)
);
