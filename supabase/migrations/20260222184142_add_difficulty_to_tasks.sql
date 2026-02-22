ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'medium'
  CHECK (difficulty IN ('easy', 'medium', 'hard'));
