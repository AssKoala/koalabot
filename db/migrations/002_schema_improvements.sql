-- 002_schema_improvements.sql: Add composite index and NOT NULL constraints

-- Issue: getEvents() orders by timestamp but existing index only covers (channel_id, badword).
-- A composite index including timestamp avoids a sort for ordered queries.
DROP INDEX IF EXISTS idx_badword_channel_word;
CREATE INDEX IF NOT EXISTS idx_badword_channel_word_ts ON badword_events (channel_id, badword, timestamp);
