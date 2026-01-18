import { LoggerConcrete } from '../logging/logger.js';
import { Bot } from '../bot.js';
import { DiscordBotHelpers } from './discordbothelpers.js'
import config from 'config'

/**
 * Simple class that will be passed to every command at registration time.
 * 
 * Contains instance information for a given command (loggers, references to the owning bot, etc)
 */
export class DiscordBotRuntimeData {
    private readonly _logger: LoggerConcrete;
    logger(): LoggerConcrete {
        return this._logger;
    }

    private readonly _channelLogger?: LoggerConcrete;
    channelLogger(): LoggerConcrete | undefined {
        return this._channelLogger;
    }

    private readonly _guildlogger?: LoggerConcrete;
    guildLogger(): LoggerConcrete | undefined{
        return this._guildlogger;
    }

    private readonly _bot: Bot;
    bot(): Bot {
        return this._bot;
    }

    botId(): string {
        return this.bot().client().user!.id;
    }
    
    private readonly _helpers;
    helpers(): DiscordBotHelpers {
        return this._helpers;
    }

    constructor(bot: Bot, logger: LoggerConcrete, guildLogger?: LoggerConcrete, channelLogger?: LoggerConcrete) {
        this._logger = logger;
        this._channelLogger = channelLogger;
        this._guildlogger = guildLogger;
        this._bot = bot;
        this._helpers = new DiscordBotHelpers(this.logger());
    }
}