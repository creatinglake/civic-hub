-- Word cloud submissions table.
-- Each row is one resident's response to one prompt within a word cloud process.

CREATE TABLE wordcloud_submissions (
  id TEXT PRIMARY KEY,
  process_id TEXT NOT NULL REFERENCES processes(id),
  prompt_id TEXT NOT NULL,
  author_id TEXT,
  body TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_token TEXT,
  hidden_at TIMESTAMPTZ,
  hidden_by TEXT,
  hidden_reason TEXT,
  restored_at TIMESTAMPTZ
);

CREATE INDEX idx_wc_submissions_process
  ON wordcloud_submissions(process_id);

CREATE INDEX idx_wc_submissions_prompt
  ON wordcloud_submissions(process_id, prompt_id);

-- Enforce one submission per author per prompt (hub mode with identity).
-- Partial index excludes anonymous submissions (null author_id).
CREATE UNIQUE INDEX idx_wc_submissions_unique_author
  ON wordcloud_submissions(process_id, prompt_id, author_id)
  WHERE author_id IS NOT NULL;
