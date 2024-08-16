import { DiscordStenographer } from '../helpers/discordstenographer.js';

var stenographer = new DiscordStenographer();

stenographer.loadDiscordMessages(`tests/data/discord_messages.log`);
