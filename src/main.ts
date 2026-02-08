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

// Load previous logs
import { Stenographer } from './app/stenographer/discordstenographer.js';
Stenographer.init(LogManager.get());

// Load user settings
import { UserSettingsManager } from './app/user/usersettingsmanager.js';
UserSettingsManager.init(`${config.get("Global.dataPath")}/settings.json`);

/* Initialize the bot */
import { Bot } from './bot.js'
await Bot.init();

/* Initialize Commands */
import { Dict } from './commands/dict.js'
Dict.init();

import { CommandManager } from './commandmanager.js'
await CommandManager.register(Bot.get().client());  // Register
await CommandManager.deployDiscordSlashCommands(    // Deploy
    config.get("Discord.clearSlashCommandsOnStartup"), 
    config.get("Discord.deployGuildSlashCommandsOnStartup"), 
    config.get("Discord.deployGlobalSlashCommandsOnStartup"));

/* Import all listeners */
import { ListenerManager } from './listenermanager.js';
await ListenerManager.importListeners();

/* Create all the LLM instances. */
Bot.get().createSubBots();

/* Once all systems are loaded, login to services */
await Bot.get().login();
