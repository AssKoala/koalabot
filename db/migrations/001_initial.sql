-- 001_initial.sql: Create all initial tables for KoalaBot PostgreSQL persistence

CREATE TABLE IF NOT EXISTS leaderboard_stats (
    guild_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    word TEXT NOT NULL,
    count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (guild_id, user_name, word)
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_guild_word ON leaderboard_stats (guild_id, word);

CREATE TABLE IF NOT EXISTS user_settings (
    user_name TEXT PRIMARY KEY,
    settings_json JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS badword_events (
    id SERIAL PRIMARY KEY,
    channel_id TEXT NOT NULL,
    badword TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_badword_channel_word ON badword_events (channel_id, badword);

CREATE TABLE IF NOT EXISTS message_counts (
    guild_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (guild_id, user_name)
);

CREATE TABLE IF NOT EXISTS command_usage (
    id SERIAL PRIMARY KEY,
    guild_id TEXT,
    user_id TEXT,
    user_name TEXT,
    command_name TEXT NOT NULL,
    latency_ms INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_command_usage_guild ON command_usage (guild_id, command_name);
CREATE INDEX IF NOT EXISTS idx_command_usage_user ON command_usage (user_id);
