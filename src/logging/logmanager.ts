// API
import { LogLevel } from '../api/koalabotsystem.js'

// Internal
import { LoggerConcrete } from './logger.js'
import winston from 'winston';

export class DiscordLogManager {
    constructor(basePath: string, logFileName: string) {
        this.logBasePath = basePath;
        this.fullLogFileName = logFileName;
    }

    /* Logfiles */

    getGuildLogBasePath(guildId: string): string 
    { return `${this.logBasePath}/${guildId}`; }

    getChannelLogBasePath(guildId: string, channelId: string): string 
    { return `${this.logBasePath}/${guildId}/${channelId}`; }

    getLogFullPath(): string
    { return `${this.logBasePath}/${this.fullLogFileName}`; }

    /* Logger Accessors */

    getOwningGuildId(channelId: string): string {
        if (this.channelToGuildMap.has(channelId)) {
            return this.channelToGuildMap.get(channelId)!;
        } else {
            return "";
        }
    }

    hasGuildLogger(guildId: string): boolean {
        return this.guildLoggerMap.has(guildId);
    }

    hasChannelLogger(channelId: string): boolean {
        return this.channelLoggerMap.has(channelId);
    }

    getChannelLogger(channelId: string, noAutoCreate: boolean = false): LoggerConcrete {
        if (!this.hasChannelLogger(channelId)) {
            const guildId = this.getOwningGuildId(channelId);
            
            if (guildId.length == 0) {
                throw new Error(`Channel ${channelId} has not been registered to a guild.  Call registerChannelToGuild first.`);
            }

            try {
                // If this is the first channel logger being created, we need the guild logger too
                if (!this.hasGuildLogger(guildId)) {
                    this.guildLoggerMap.set(guildId, new LoggerConcrete(this.getGuildLogBasePath(guildId), this.fullLogFileName, LogLevel.DISCORD_MESSAGE, false));
                }
            } catch (e) {
                throw new Error(`DiscordLogManager::getChannelLogger(${channelId},${noAutoCreate}): Failed to create guild logger for ${guildId}, got exception: ${e}`);
            }

            try {
                // Create the channel logger
                this.channelLoggerMap.set(channelId, new LoggerConcrete(this.getChannelLogBasePath(guildId, channelId), this.fullLogFileName, LogLevel.DISCORD_MESSAGE, false));
            } catch (e) {
                throw new Error(`DiscordLogManager::getChannelLogger(${channelId},${noAutoCreate}): Failed to create channel logger, got exception: ${e}`);
            }
        }

        return this.channelLoggerMap.get(channelId)!;
    }

    registerChannelToGuild(channelId: string, guildId: string) {
        this.channelToGuildMap.set(channelId, guildId);
        this.guildToChannelMap.set(guildId, channelId);
    }

    getGuildLogger(guildId: string): LoggerConcrete {
        if (!this.hasGuildLogger(guildId)) {
            try {
                this.guildLoggerMap.set(guildId, new LoggerConcrete(this.getGuildLogBasePath(guildId), this.fullLogFileName, LogLevel.DISCORD_MESSAGE, false));
            } catch (e) {
                throw new Error(`DiscordLogManager::getGuildLogger(${guildId}): Failed to create channel logger, got exception: ${e}`);
            }
        }
        
        return this.guildLoggerMap.get(guildId)!;
    }

    createLogger(guildId: string, channelId: string): boolean {
        // We don't have this channel
        if (!this.hasChannelLogger(channelId)) {
            // Setup our lookups
            this.channelToGuildMap.set(channelId, guildId);
            this.guildToChannelMap.set(guildId, channelId);

            // Check if we have the guild logger, create if not
            if (!this.hasGuildLogger(guildId)) {
                this.guildLoggerMap.set(guildId, new LoggerConcrete(this.getGuildLogBasePath(guildId), this.fullLogFileName, LogLevel.DISCORD_MESSAGE, false));
            }

            this.channelLoggerMap.set(channelId, new LoggerConcrete(this.getChannelLogBasePath(guildId, channelId), this.fullLogFileName, LogLevel.DISCORD_MESSAGE, false));
            return true;
        } else {
            return false;
        }
    }

    /* Private */

    private channelLoggerMap: Map<string, LoggerConcrete> = new Map();
    private guildLoggerMap: Map<string, LoggerConcrete> = new Map();
    private channelToGuildMap: Map<string, string> = new Map();
    private guildToChannelMap: Map<string, string> = new Map();
    public readonly logBasePath: string;
    public readonly fullLogFileName: string;
}

export class LogManager {

    public static get(): LogManager { return LogManager.instance; }
    private static instance: LogManager;
    public static init(
        logBaseDir: string, 
        commonLogFileName: string, 
        logLevel: LogLevel, 
        discordLogFileName: string = 'discord_messages.log', 
        outputGlobalToConsole: boolean = true) 
    {
        LogManager.instance = new LogManager(logBaseDir, commonLogFileName, logLevel, discordLogFileName, outputGlobalToConsole);
    }

    private constructor(
        logBaseDir: string, 
        commonLogFileName: string, 
        logLevel: LogLevel, 
        discordLogFileName: string = 'discord_messages.log', 
        outputGlobalToConsole: boolean = true) 
    {
        // Create subsystem loggers
        this.discordLogManager = new DiscordLogManager(logBaseDir, discordLogFileName);

        this.logBaseDir = logBaseDir;
        this.commonLogFileName = commonLogFileName;

        this.commonLogger = new LoggerConcrete(logBaseDir, commonLogFileName, logLevel, outputGlobalToConsole);

        // Add a global discord message log file
        this.commonLogger.getRawLogger().add(new winston.transports.File({ filename: this.discordLogManager.getLogFullPath(), level: LogLevel.DISCORD_MESSAGE }));
    }

    getCommonLogFullPath() 
    { return `${this.logBaseDir}/${this.commonLogFileName}`; }

    getCommonLogger() 
    { return this.commonLogger; }

    getDiscordLogFileName()
    { return this.discordLogManager.fullLogFileName; }

    public readonly discordLogManager: DiscordLogManager;
    public readonly commonLogger: LoggerConcrete;
    public readonly logBaseDir: string;
    public readonly commonLogFileName: string;
}

export function getCommonLogger() { return LogManager.get().commonLogger; }