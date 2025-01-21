import { LogLevel, Logger } from './logger.js'
import winston from 'winston';

export class LogManager {
    private channelLoggerMap: Map<string, Logger> = new Map();
    private guildLoggerMap: Map<string, Logger> = new Map();
    private channelToGuildMap: Map<string, string> = new Map();
    private guildToChannelMap: Map<string, string> = new Map();
    #globalLogger: Logger;
    logBaseDir: string;
    discordLogFileName: string;
    globalLogFileName: string;

    getGuildLogBasePath(guildId: string): string {
        return `${this.logBaseDir}/${guildId}`;
    }

    getChannelLogBasePath(guildId: string, channelId: string): string {
        return `${this.logBaseDir}/${guildId}/${channelId}`;
    }

    getGlobalDiscordLogFullPath()  {
        return `${this.logBaseDir}/${this.discordLogFileName}`;
    }

    getGlobalLogFullPath() {
        return `${this.logBaseDir}/${this.globalLogFileName}`;
    }

    getOwningGuildId(channelId: string) {
        if (this.channelToGuildMap.has(channelId)) {
            return this.channelToGuildMap[channelId];
        } else {
            return "";
        }
    }

    constructor(
        logBasePath: string, 
        globalLogFileName: string, 
        globalLogLevel: LogLevel, 
        discordLogFileName: string = 'discord_messages.log', 
        outputGlobalToConsole: boolean = true) 
    {
       console.log(`Creating LogManager(${logBasePath}, ${globalLogFileName}, ${globalLogLevel}, ${discordLogFileName}, ${outputGlobalToConsole})`);

        this.logBaseDir = logBasePath;
        this.discordLogFileName = discordLogFileName;
        this.globalLogFileName = globalLogFileName;

        this.#globalLogger = new Logger(logBasePath, globalLogFileName, globalLogLevel, outputGlobalToConsole);

        // Add a global discord message log file
        this.#globalLogger.getRawLogger().add(new winston.transports.File({ filename: this.getGlobalDiscordLogFullPath(), level: LogLevel.DISCORD_MESSAGE }));
    }

    hasGuildLogger(guildId: string): boolean {
        return this.guildLoggerMap.has(guildId);
    }

    hasChannelLogger(channelId: string): boolean {
        return this.channelLoggerMap.has(channelId);
    }

    createLogger(guildId: string, channelId: string): boolean {
        // We don't have this channel
        if (!this.hasChannelLogger(channelId)) {
            // Setup our lookups
            this.channelToGuildMap.set(channelId, guildId);
            this.guildToChannelMap.set(guildId, channelId);

            // Check if we have the guild logger, create if not
            if (!this.hasGuildLogger(guildId)) {
                this.guildLoggerMap.set(guildId, new Logger(this.getGuildLogBasePath(guildId), this.discordLogFileName, LogLevel.DISCORD_MESSAGE, false));
            }

            this.channelLoggerMap.set(channelId, new Logger(this.getChannelLogBasePath(guildId, channelId), this.discordLogFileName, LogLevel.DISCORD_MESSAGE, false));
            return true;
        } else {
            return false;
        }
    }

    getChannelLogger(channelId: string): Logger {
        return this.channelLoggerMap.get(channelId);
    }

    getGuildLogger(guildId: string): Logger {
        return this.guildLoggerMap.get(guildId);
    }

    globalLogger() {
        return this.#globalLogger;
    }
}