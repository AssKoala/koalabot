-- 002_schema_improvements.sql: Add composite index and NOT NULL constraints

-- Issue: getEvents() orders by timestamp but existing index only covers (channel_id, badword).
-- A composite index including timestamp avoids a sort for ordered queries.
DROP INDEX IF EXISTS idx_badword_channel_word;
CREATE INDEX IF NOT EXISTS idx_badword_channel_word_ts ON badword_events (channel_id, badword, timestamp);

-- Issue: provider and model columns allow NULL but code always provides non-null strings.
-- Align schema with actual usage.
UPDATE llm_usage SET provider = 'unknown' WHERE provider IS NULL;
UPDATE llm_usage SET model = 'unknown' WHERE model IS NULL;
ALTER TABLE llm_usage ALTER COLUMN provider SET NOT NULL;
ALTER TABLE llm_usage ALTER COLUMN model SET NOT NULL;
