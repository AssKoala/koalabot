import winston from 'winston';
import { Message } from 'discord.js';

export enum LogLevel {
    DISCORD_MESSAGE = 'discord_message',
    FATAL = 'fatal',
    ERROR = 'error',
    WARNING = 'warning',
    INFO = 'info',
    DEBUG = 'debug',
    TRACE = 'trace',
}

export class Logger {
    static getStandardDiscordMessageFormat(message: Message)
    {
        return `${message.author.username}<@${message.author.id}>: ${message.content}`;
    }

    static getDateString() {
        const date = new Date(Date.now());
    
        return date.toISOString() + " :: ";
    }
    
    #logDir : string;
    logDir() {
        return this.#logDir
    }

    #logFileName : string;
    logFileName() {
        return this.#logFileName;
    }
    logFullPath() {
        return `${this.logDir()}/${this.logFileName()}`;
    }

    #logger;
    getRawLogger() {
        return this.#logger;
    }

    constructor(logRootPath: string, logFileName: string, logLevel: LogLevel, outputToConsole: boolean = true) {
        this.#logDir = logRootPath;
        this.#logFileName = logFileName;

        this.#logger = winston.createLogger({
            levels: {
                discord_message: 0,
                fatal: 1,
                error: 2,
                warning: 3,
                info: 4,
                debug: 5,
                trace: 6,
            },
            level: logLevel,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.File({ filename: this.logFullPath(), level: logLevel }),
            ],
        });

        //
        // If we're logging to console, then log with the format:
        // `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
        //
        if (outputToConsole == true) {
            this.#logger.add(new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.simple()
                )
            }));
        }
    }

    /* Log function */
    logDiscordMessage(message)
    {
        try {
            this.#logger.discord_message(message);
        } catch (e) {
            console.log(`[PANIC] Failed to log discord message ${message}!!`);
        }
    }

    logInfo(message)
    {
        try {
            this.#logger.info(message);
        } catch (e) {
            console.log(`[PANIC] Failed to log info ${message}!!`);
        }
    }

    logDebug(message)
    {
        try {
            this.#logger.debug(message);
        } catch (e) {
            console.log(`[PANIC] Failed to log debug ${message}!!`);
        }
    }

    logWarning(message)
    {
        try {
            this.#logger.warn(message);
        } catch (e) {
            console.log(`[PANIC] Failed to log warning ${message}!!`);
        }
    }

    logFatal(message, shouldThrow = true) {
        this.#logger.fatal(message);
        if (shouldThrow) {
            throw new Error(message);
        }
    }

    async logError(message: string, discordReply = null, editReply = false)
    {
        try {
            this.#logger.error(message);

            try {
                if (discordReply)
                {
                    if (editReply)
                    {
                        await discordReply.editReply(message);
                    }
                    else
                    {
                        await discordReply.reply(message);
                    }
                }
            }
            catch (e)
            {
                this.#logger.error(`Failed to reply to discord, got error ${e}`);
            }
        } catch (e) {
            console.log(`[PANIC] Failed to log error ${message}!!`);
        } 
    }
}