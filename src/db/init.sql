/*
this.guildId = guildId;
this.channelId = channelId;
this.author = author;
this.authorId = authorId;
this.message = message;
this.timestamp = timestamp;

simple schema to store and make leaderboard style queries easier

*/

CREATE TABLE channels (
    id INT PRIMARY KEY, -- system generated, internal key
    chan_id INT NOT NULL, -- the natural-key from discord
    is_active BOOL DEFAULT TRUE,
    deactivated_at TEXT DEFAULT NULL,
    created_at TEXT DEFAULT 
) STRICT;

CREATE TABLE messages (
    id int PRIMARY KEY,
    
)
