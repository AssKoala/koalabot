// API Imports
import { LogLevel } from './api/koalabotsystem.js'
import { KoalaBotSystem } from './api/koalabotsystem.js';
import { KoalaBotSystemDiscord } from './bot/KoalaBotSystemDiscord.js';

// Internal
import { PerformanceCounter } from './performancecounter.js';
import { SettingsManager } from './helpers/settingsmanager.js'
import { registerEnvironmentSettings } from './env-settings.js';
import { UserSettingsManager } from "./helpers/usersettingsmanager.js"
import { LoggerConcrete } from './logging/logger.js'
import { LogManager } from './logging/logmanager.js'
import { Bot } from './bot.js';
import { CommandManager } from './commandmanager.js'
import { ChatInputCommandInteraction } from 'discord.js'
import fs from "fs";
import fsPromises from "fs/promises";

export abstract class Global {
    private static _userSettingsManager: UserSettingsManager;
    static userSettings(): UserSettingsManager {
        return Global._userSettingsManager
    }

    private static _settingsManager: SettingsManager;
    static settings(): SettingsManager {
        return Global._settingsManager;
    }

    private static _logManager: LogManager;
    static logManager() : LogManager {
        return Global._logManager;
    }
    static logger(): LoggerConcrete {
        return Global._logManager.globalLogger();
    }

    private static _bot: Bot;
    static bot() {
        return Global._bot;
    }

    static initSettings() {
        Global._settingsManager = new SettingsManager();
    }

    static initLogger(logRootPath: string, logFileName: string, logLevel: LogLevel, discordLogFileName: string) {
        Global._logManager = new LogManager(logRootPath, logFileName, logLevel, discordLogFileName);
    }

    static initUserSettings(settingsPath: string) {
        Global._userSettingsManager = new UserSettingsManager(settingsPath);
    }

    static initBot() {
        Global._bot = new Bot();
    }

    static init() {
        Global.initSettings();
        registerEnvironmentSettings(Global._settingsManager);

        Global.initLogger(
            process.env["LOG_PATH"] || './logs', 
            process.env["FULL_LOG_FILENAME"] || 'combined.log', 
            (process.env["LOG_LEVEL"] || 'debug') as LogLevel,
            process.env["MESSAGE_LOG_FILENAME"] || 'discord_messages.log'
        );
        Global.initUserSettings(`${Global.settings().get("DATA_PATH")}/settings.json`);
        
        Global.initBot();

        // Once bot is initialized, disable performance counters if timing not enabled
        if (Global.settings().get("TIMING_ENABLE") != 'true') {
            this._getPerformanceCounter = function(descr:string): PerformanceCounter | undefined { return undefined; };
        }
    }

    static async initDiscord() {
        using perfCounter = this.getPerformanceCounter(`Bot::initBot()`);
        await Global._bot.init(Global.settings().getDiscordKey());
    }

    private static getPerformanceCounterInternal(description: string) {
        return new PerformanceCounter(description);
    }

    // Timing is enabled by default to get initialization timings always since counter overhead is nominal during init
    private static _getPerformanceCounter: (description: string) => PerformanceCounter | undefined = this.getPerformanceCounterInternal;

    static getPerformanceCounter(description: string) {
        return this._getPerformanceCounter(description);
    }

    static #splitMessage(message: string, size = 2000)
    {
        if (message.length <= size)
        {
            return message;
        }
        else {
            const splitCount = Math.ceil(message.length / size)
            const splitMessage = new Array(splitCount)

            for (let i = 0, c = 0; i < splitCount; ++i, c += size) {
                splitMessage[i] = message.substr(c, size)
            }

            return splitMessage
        }
    }

    static async editAndSplitReply(interaction: ChatInputCommandInteraction, message: string)
    {
        try {
            const splitMessage = Global.#splitMessage(message);
    
            if (Array.isArray(splitMessage)) {
                interaction.editReply(splitMessage[0]);

                for (let i = 1; i < splitMessage.length; i++)
                {
                    // @ts-ignore
                    interaction.channel.send(splitMessage[i]);
                }
            } else {
                interaction.editReply(message);
            }
        } catch (e) {
            Global.logger().logErrorAsync(`Failed to edit reply, got error ${e}`);
        }
    }

    static async readJsonFile(path: string) {
        try {
            const file = await fsPromises.readFile(path, {encoding: "utf8"});
            return JSON.parse(file);
        } catch (e) {
            Global.logger().logErrorAsync(`Failed to load ${path}, got ${e}`);
            return null;
        }
    }

    static readJsonFileSync(path: string) {
        try {
            const file = fs.readFileSync(path, {encoding: "utf8"});
            return JSON.parse(file);
        } catch (e) {
            Global.logger().logErrorAsync(`Failed to load ${path}, got ${e}`);
            return null;
        }
    }
}