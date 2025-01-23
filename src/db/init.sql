/*
this.guildId = guildId;
this.channelId = channelId;
this.author = author;
this.authorId = authorId;
this.message = message;
this.timestamp = timestamp;

simple schema to store and make leaderboard style queries easier

PRAGMA journal_mode=WAL;

Best if used in WAL mode -- allows for multiple readers and a single writer and for them not to block each other

*/

CREATE TABLE guilds 
    id INTEGER PRIMARY KEY,
    guild_id INT NOT NULL,
    is_active BOOL DEFAULT TRUE,
    deactivated_at INTEGER DEFAULT NULL, -- store unixepoch here
    created_at INTEGER DEFAULT NULL -- store unixepoch here 
) STRICT;-- koala bot is going worldwide babyyy! -- manage metrics about many discord servers all from this

CREATE TABLE channels (
    id INTEGER PRIMARY KEY, -- this indirection lets us be able to keep sane keys if/when discord changes the channel id for the same channel
    chan_id INT NOT NULL, -- the natural-key from discord
    is_active BOOL DEFAULT TRUE,
    deactivated_at INTEGER DEFAULT NULL, -- store unixepoch here
    created_at INTEGER DEFAULT NULL -- store unixepoch here 
) STRICT;

CREATE TABLE messages (
    id INTEGER PRIMARY KEY,

    
)
-- refactor this to dim_ and fact_ tables with a fact_messages wide table with pre-aggregates?
