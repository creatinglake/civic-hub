-- Add banner image fields to projects and project_drafts

ALTER TABLE projects
  ADD COLUMN banner_image_url TEXT,
  ADD COLUMN banner_image_alt TEXT;

ALTER TABLE project_drafts
  ADD COLUMN banner_image_url TEXT,
  ADD COLUMN banner_image_alt TEXT;
