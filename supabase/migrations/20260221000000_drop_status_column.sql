-- Remove status column: completed (bool) is the single source of truth for task state.
-- The status field (todo/in_progress/done) was redundant with completed and caused
-- dual-source-of-truth bugs.
ALTER TABLE tasks DROP COLUMN IF EXISTS status;
