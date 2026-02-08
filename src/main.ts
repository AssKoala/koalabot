/*
	"Main" file for the bot that interfaces with discord's API.
*/

import config from 'config';

/*
    Initialization flow:

    0) Foundational systems
        Version Information
        Logger
        Performance
        Memory
    1) Core systems
        Stenograher
    2) Functional Systems
        Commands
        Listeners
    3) Discord/Slack/etc systems
    4) Establish connections to external services
*/

/* Foundational */
// Version information
import { VersionInformation } from './version.js';
await VersionInformation.init(config.get<string>("Global.versionInfoFile"));
console.log(`Initializing Application, Version: ${await VersionInformation.get().getVersionString()}`);

// Logging
import { LogLevel } from './api/koalabotsystem.js'
import { LogManager } from './logging/logmanager.js';

console.log("Initializing logger.");
LogManager.init(config.get<string>("Global.logPath"), 
                config.get<string>("Global.fullLogFilename"),
                config.get<string>("Global.logLevel") as LogLevel,
                config.get<string>("Global.messageLogFilename")
);
LogManager.get().commonLogger.logInfo("Starting bot.");

// Performance, depends on logger
import { PerformanceCounter } from './performancecounter.js';
if (config.get("Developer.timingEnable")) {
    LogManager.get().commonLogger.logInfo("Enabling Performance Counters");
    PerformanceCounter.enablePerformanceCounters(config.get("Developer.timingEnable"), LogManager.get().commonLogger);
}

// Register handlers, depend on logger
process.on('unhandledRejection', error => {
    LogManager.get().commonLogger.logErrorAsync(`Unhandled Process Rejection, got ${error}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    LogManager.get().commonLogger.logInfo('Received SIGTERM, shutting down gracefully.');
    await DatabaseManager.shutdownIfAvailable();
    process.exit(0);
});
process.on('SIGINT', async () => {
    LogManager.get().commonLogger.logInfo('Received SIGINT, shutting down gracefully.');
    await DatabaseManager.shutdownIfAvailable();
    process.exit(0);
});

// Database (optional, graceful degradation if unavailable)
import { DatabaseManager } from './db/databasemanager.js';
try {
    await DatabaseManager.init();
} catch (e) {
    LogManager.get().commonLogger.logErrorAsync(`Database initialization failed, continuing without DB: ${e}`);
}

// Load previous logs
import { Stenographer } from './app/stenographer/discordstenographer.js';
Stenographer.init(LogManager.get());

// Load user settings
import { UserSettingsManager } from './app/user/usersettingsmanager.js';
import { UserSettingsDbSync } from './db/usersettingsdbsync.js';
import { DatabaseBootstrapSync } from './db/databasebootstrapsync.js';
UserSettingsManager.init(`${config.get("Global.dataPath")}/settings.json`);
UserSettingsDbSync.attachPersistence(UserSettingsManager.get());
await UserSettingsDbSync.syncStartup(UserSettingsManager.get());

/* Initialize the bot */
import { Bot } from './bot.js'
await Bot.init();

/* Initialize Commands */
import { Dict } from './commands/dict.js'
Dict.init();

import { CommandManager } from './commandmanager.js'
await CommandManager.register(Bot.get().client());  // Register
const leaderboardModule = await import('./commands/leaderboard.js');
await DatabaseBootstrapSync.syncLeaderboardStartupData({
    guildCaches: Stenographer.getAllGuildCaches(),
    getInMemoryLeaderboardRows: leaderboardModule.getInMemoryLeaderboardRowsForPersistence,
    applyDatabaseLeaderboardRowsForGuild: leaderboardModule.applyDatabaseLeaderboardRowsForGuild,
    getInMemoryMessageCount: (guildId: string, userName: string) => Stenographer.getMessageCount(guildId, userName),
    setInMemoryMessageCount: leaderboardModule.setPersistedMessageCountForUser,
});
await CommandManager.deployDiscordSlashCommands(    // Deploy
    config.get("Discord.clearSlashCommandsOnStartup"), 
    config.get("Discord.deployGuildSlashCommandsOnStartup"), 
    config.get("Discord.deployGlobalSlashCommandsOnStartup"));

/* Import all listeners */
import { ListenerManager } from './listenermanager.js';
await ListenerManager.importListeners();
const enabledListeners = config.get<string>('Listeners.listenerList')
    .split(',')
    .map(listener => listener.trim())
    .filter(listener => listener.length > 0);

if (enabledListeners.includes('badwordlistener')) {
    const badwordModule = await import('./listeners/badwordlistener.js');
    const trackedBadWords = badwordModule.getTrackedBadWordsForPersistence();
    const trackedChannelIds = config.get<string>("Listeners.BadWordListener.trackingChannelIds")
        .split(',')
        .map(channelId => channelId.trim())
        .filter(channelId => channelId.length > 0);

    for (const badword of trackedBadWords) {
        await DatabaseBootstrapSync.syncBadWordStartupData({
            getBadWord: () => badword,
            getTrackingChannels: () => trackedChannelIds,
            getTrackedEvents: (channelId: string) => badwordModule.getTrackedEventsForPersistence(badword, channelId),
            mergeTrackedEvents: (channelId: string, events) => {
                badwordModule.mergeTrackedEventsForPersistence(badword, channelId, events);
            }
        }, LogManager.get().commonLogger);
    }
}

/* Create all the LLM instances. */
Bot.get().createSubBots();

/* Once all systems are loaded, login to services */
await Bot.get().login();
