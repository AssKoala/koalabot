ALTER TABLE badword_events
    ADD CONSTRAINT uq_badword_event UNIQUE (channel_id, badword, user_id, timestamp);
