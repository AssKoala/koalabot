import { LogLevel, Logger } from './logger.js'
import winston from 'winston';

export class LogManager {
    #loggerMap: Map<string, Logger> = new Map();
    #globalLogger: Logger;
    logBaseDir: string;
    discordLogFileName: string;
    globalLogFileName: string;

    getLogBasePath(channelId: string): string {
        return `${this.logBaseDir}/${channelId}`;
    }

    getGlobalDiscordLogFullPath()  {
        return `${this.logBaseDir}/${this.discordLogFileName}`;
    }

    getGlobalLogFullPath() {
        return `${this.logBaseDir}/${this.globalLogFileName}`;
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

    hasLogger(channelId: string): boolean {
        return this.#loggerMap.has(channelId);
    }

    createLogger(channelId: string): boolean {
        if (!this.hasLogger(channelId)) {
            this.#loggerMap.set(channelId, new Logger(this.getLogBasePath(channelId), this.discordLogFileName, LogLevel.DISCORD_MESSAGE));
            return true;
        } else {
            return false;
        }
    }

    getLogger(channelId: string, shouldCreate: boolean = true): Logger {
        if (!this.hasLogger(channelId)) {
            if (shouldCreate) this.createLogger(channelId);
            else return null;
        }

        return this.#loggerMap.get(channelId);
    }

    globalLogger() {
        return this.#globalLogger;
    }
}