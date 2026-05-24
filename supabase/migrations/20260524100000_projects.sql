-- Projects module — living community project pages with sentiment,
-- comments, updates timeline, and AI-assisted drafting.

-- --- Projects table ---

CREATE TABLE projects (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  sources          TEXT[] NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'active',  -- active|archived
  support_count    INTEGER NOT NULL DEFAULT 0,
  oppose_count     INTEGER NOT NULL DEFAULT 0,
  assistant_helped BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX projects_status_created_idx ON projects (status, created_at DESC);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- --- Project updates (living-document timeline) ---

CREATE TABLE project_updates (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  media_urls   TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX project_updates_project_idx ON project_updates (project_id, created_at DESC);

ALTER TABLE project_updates ENABLE ROW LEVEL SECURITY;

-- --- Project sentiments (support/oppose, changeable) ---

CREATE TABLE project_sentiments (
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  sentiment   TEXT NOT NULL,  -- 'support'|'oppose'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TRIGGER project_sentiments_updated_at
  BEFORE UPDATE ON project_sentiments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE project_sentiments ENABLE ROW LEVEL SECURITY;

-- --- Project comments (flat list, verified citizens only) ---

CREATE TABLE project_comments (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX project_comments_project_idx ON project_comments (project_id, created_at DESC);

ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;

-- --- Project drafts (AI-assisted drafting) ---

CREATE TABLE project_drafts (
  id                         TEXT PRIMARY KEY,
  user_id                    TEXT NOT NULL,
  title                      TEXT NOT NULL DEFAULT '',
  description                TEXT NOT NULL DEFAULT '',
  sources                    TEXT NOT NULL DEFAULT '',
  conversation_history       JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_review_result         JSONB,
  draft_modified_since_review BOOLEAN NOT NULL DEFAULT false,
  assistant_helped           BOOLEAN NOT NULL DEFAULT false,
  status                     TEXT NOT NULL DEFAULT 'drafting',  -- drafting|submitted|abandoned
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_drafts_user_status ON project_drafts (user_id, status);

CREATE TRIGGER set_project_drafts_updated_at
  BEFORE UPDATE ON project_drafts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE project_drafts ENABLE ROW LEVEL SECURITY;
