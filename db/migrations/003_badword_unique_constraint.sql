-- Remove duplicate rows before enforcing uniqueness.
WITH ranked_badword_events AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY channel_id, badword, user_id, timestamp
            ORDER BY id ASC
        ) AS row_num
    FROM badword_events
)
DELETE FROM badword_events
WHERE id IN (
    SELECT id
    FROM ranked_badword_events
    WHERE row_num > 1
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_badword_event'
          AND conrelid = 'badword_events'::regclass
    ) THEN
        ALTER TABLE badword_events
            ADD CONSTRAINT uq_badword_event UNIQUE (channel_id, badword, user_id, timestamp);
    END IF;
END $$;
