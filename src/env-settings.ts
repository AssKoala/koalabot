import { Global } from './global.js';

export function registerEnvironmentSettings() {
    // global settings
    Global.settings().register('global', "BOT_NAME", "BottyMcBotFace", "Name for the bot to use when referencing self", false);
    Global.settings().register('global', "DEBUG_ENABLE", "false", "Set to true to enable debug functionality", false);
    Global.settings().register('global', "COMMAND_LIST", "settings,coinflip,diceroll,leaderboard", "Comma separate list of commands to load.  All commands are expected to be in the ./commands folder and implement the DiscordBotCommand interface.  Commands are dynamically imported so long as they register their name in .env and the command file itself has a registerDiscordBotCommand call to assign an instance to a given command.", false);
    Global.settings().register('global', "DATA_PATH", "./data", "Path to JSON data to be loaded by commands", true);
    Global.settings().register('global', "TEMP_PATH", "./temp", "Path to write temporary files", true);
    Global.settings().register('global', "REBOOT_FILE", "$TEMP_PATH/reboot", "Path to file to write to signal a reboot to the OS", false);
    Global.settings().register('global', "LOG_MAX_ENTRIES", "2048", "Maximum number of log entries to keep in memory", false);
    Global.settings().register('global', "LOG_PATH", "./logs", "Folder to write logs to", false);
    Global.settings().register('global', "FULL_LOG_FILENAME", "bot.log", "Log file to write ALL logs to", false);
    Global.settings().register('global', "MESSAGE_LOG_FILENAME", "discord_messages.log", "Log file to write discord messages to", false);
    Global.settings().register('global', "LOG_LEVEL", "debug", "Logging level.  See logger.ts enum LogLevel for available levels.", false);
    Global.settings().register('global', 'LISTENER_LIST', '', 'List of listener modules to load', false);

    // module: reddit
    Global.settings().register('reddit', "PYTHON_BINARY", "python", "Path to python binary", true);
    Global.settings().register('reddit', "REDDIT_READER_PATH", "../../scripts/reddit_reader.py", "Path to reddit reader python program", true);
    Global.settings().register('reddit', "REDDIT_CLIENT_ID", "", "Reddit app client id: https://www.reddit.com/prefs/apps", true);
    Global.settings().register('reddit', "REDDIT_CLIENT_SECRET", "", "Reddit app client secret: https://www.reddit.com/prefs/apps", true);
    Global.settings().register('reddit', "REDDIT_USER_AGENT", "", "Reddit custom user agent for use in praw", true);

    // module: openai (chat, vision, query, image)
    Global.settings().register('openai', "OPENAI_API_KEY", "", "OpenAI API key to access data", true);

    // module: getimg.ai (image)
    Global.settings().register('getimgai', "GETIMG_AI_API_KEY", "", "getimg.ai API key to access data", true);

    // module: chat
    Global.settings().register('chat', "GPT_TOKEN_COUNT", "8192", "Max number of tokens to send during chat command", false);
    Global.settings().register('chat', "GPT_MAX_MESSAGES", "2048", "Max number of message history to send during chat command", false);

    // module: weather
    Global.settings().register('weather', "GOOGLE_MAPS_API_KEY", "", "Google maps API key.  See https://developers.google.com/maps/documentation/javascript/get-api-key", true);
    Global.settings().register('weather', "OPEN_WEATHER_KEY", "", "Open weather API key for the weather module.  See https://openweathermap.org/appid to get yourself going.", true);

    // module: discord
    Global.settings().register('discord', "DISCORD_TOKEN", "", "Discord bot token.  You only need a single token if you don't want to setup a test environment for the bot (i.e. you just wanna use this with what it comes with)", true);
    Global.settings().register('discord', "DISCORD_APP_ID", "", "Discord app id for bot, see discord docs", true);
    Global.settings().register('discord', "DISCORD_GUILD_ID", "", "Comma separate list of guilds the bot will join.  e.g.\n\tDISCORD_GUILD_ID=\"12345\" is a single server.\nDISCORD_GUILD_ID=\"12345,67891\" for two servers and so on.", true);
    Global.settings().register('discord', "DISCORD_CLEAR_SLASH_COMMANDS", "", "Clear slash commands on startup, recommend true for production use.", true);
    Global.settings().register('discord', "DISCORD_DEPLOY_GUILD_SLASH_COMMANDS", "", "Deploy slash commands to guilds, recommend true for production use", true);
    Global.settings().register('discord', "DISCORD_DEPLOY_GLOBAL_SLASH_COMMANDS", "false", "Deploy slash commands globally for bot, recommend to always be false", false);
}

