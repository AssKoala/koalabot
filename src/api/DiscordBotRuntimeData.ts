import { LoggerConcrete } from '../logging/logger.js';
import { Bot } from '../bot.js';
import { Global } from '../global.js'
import { DiscordBotHelpers } from './discordbothelpers.js'
import { SettingsManager } from '../helpers/settingsmanager.js'

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

    private readonly _channelLogger: LoggerConcrete;
    channelLogger(): LoggerConcrete {
        return this._channelLogger;
    }

    private readonly _guildlogger: LoggerConcrete;
    guildLogger(): LoggerConcrete {
        return this._guildlogger;
    }

    private readonly _bot: Bot;
    bot(): Bot {
        return this._bot;
    }
    
    private readonly _helpers;
    helpers(): DiscordBotHelpers {
        return this._helpers;
    }

    private readonly _settings;
    settings(): SettingsManager {
        return this._settings;
    }

    getPerformanceCounter(description: string) {
        return this.helpers().getPerformanceCounter(description);
    }

    constructor(bot: Bot, logger: LoggerConcrete, guildLogger: LoggerConcrete, channelLogger: LoggerConcrete, settings: SettingsManager) {
        this._logger = logger;
        this._channelLogger = channelLogger;
        this._guildlogger = guildLogger;
        this._bot = bot;
        this._settings = settings;
        this._helpers = new DiscordBotHelpers(this.logger(), settings.get("TIMING_ENABLE") == 'true');
    }
}