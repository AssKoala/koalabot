import winston from 'winston';
import * as Discord from 'discord.js';
import { LogLevel, Logger } from '../api/koalabotsystem.js'


export class LoggerConcrete implements Logger {
    static getStandardDiscordMessageFormat(message: Discord.Message)
    {
        return `${message.author.username}<@${message.author.id}>: ${message.content}`;
    }

    static getDateString() {
        const date = new Date(Date.now());
    
        return date.toISOString() + " :: ";
    }
    
    private _logDir : string;
    logDir() {
        return this._logDir
    }

    private _logFileName : string;
    logFileName() {
        return this._logFileName;
    }
    logFullPath() {
        return `${this.logDir()}/${this.logFileName()}`;
    }

    private _logger;
    getRawLogger() {
        return this._logger;
    }

    constructor(logRootPath: string, logFileName: string, logLevel: LogLevel, outputToConsole: boolean = true) {
        this._logDir = logRootPath;
        this._logFileName = logFileName;

        this._logger = winston.createLogger({
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
            this._logger.add(new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.simple()
                )
            }));
        }
    }

    /* Log function */
    logDiscordMessage(message: string)
    {
        try {
            // @ts-expect-error todo cleanup tech debt
            this._logger.discord_message(message);
        } catch (e) {
            console.log(`[PANIC] Failed to log discord message ${message}!, error: ${e}`);
        }
    }

    logInfo(message: string)
    {
        try {
            this._logger.info(message);
        } catch (e) {
            console.log(`[PANIC] Failed to log info ${message}!, error: ${e}`);
        }
    }

    logDebug(message: string)
    {
        try {
            this._logger.debug(message);
        } catch (e) {
            console.log(`[PANIC] Failed to log debug ${message}!, error: ${e}`);
        }
    }

    logWarning(message: string)
    {
        try {
            this._logger.warning(message);
        } catch (e) {
            console.log(`[PANIC] Failed to log warning ${message}!, error: ${e}`);
        }
    }

    logFatal(message: string, shouldThrow: boolean = true) {
        // @ts-expect-error todo cleanup tech debt
        this._logger.fatal(message);
        if (shouldThrow) {
            throw new Error(message);
        }
    }

    logError(message: string) {
        try {
            this._logger.error(message);
        } catch (e) {
            console.log(`[PANIC] Failed to log error ${message}!, error: ${e}`);
        }
    }

    async logErrorAsync(message: string, discordReply: Discord.ChatInputCommandInteraction | undefined = undefined, editReply = false)
    {
        try {
            this._logger.error(message);

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
                this._logger.error(`Failed to reply to discord, got error ${e}`);
            }
        } catch (e) {
            console.log(`[PANIC] Failed to log error ${message}!, error: ${e}`);
        } 
    }
}