import { PerformanceCounter } from './performancecounter.js';
import { SettingsManager } from './helpers/settingsmanager.js'
import { registerEnvironmentSettings } from './env-settings.js';
import { UserSettingsManager } from "./helpers/usersettingsmanager.js"
import { Logger, LogLevel } from './logging/logger.js'
import { LogManager } from './logging/logmanager.js'
import { Bot } from './bot.js';
import { CommandManager } from './commandmanager.js'
import { ChatInputCommandInteraction } from 'discord.js'
import { readFile } from "fs/promises";

export abstract class Global {
    static #userSettingsManager: UserSettingsManager;
    static userSettings(): UserSettingsManager {
        return Global.#userSettingsManager
    }

    static #settingsManager: SettingsManager;
    static settings(): SettingsManager {
        return Global.#settingsManager;
    }

    static #logManager: LogManager;
    static logManager() : LogManager {
        return Global.#logManager;
    }
    static logger(): Logger {
        return Global.#logManager.globalLogger();
    }

    static #bot: Bot;
    static bot() {
        return Global.#bot;
    }

    static initSettings() {
        Global.#settingsManager = new SettingsManager();
    }

    static initLogger(logRootPath: string, logFileName: string, logLevel: LogLevel, discordLogFileName: string) {
        Global.#logManager = new LogManager(logRootPath, logFileName, logLevel, discordLogFileName);
    }

    static initUserSettings(settingsPath: string) {
        Global.#userSettingsManager = new UserSettingsManager(settingsPath);
    }

    static initBot() {
        Global.#bot = new Bot();
    }

    static init() {
        Global.initSettings();
        registerEnvironmentSettings();

        Global.initLogger(
            process.env["LOG_PATH"] || './logs', 
            process.env["FULL_LOG_FILENAME"] || 'combined.log', 
            (process.env["LOG_LEVEL"] || 'debug') as LogLevel,
            process.env["MESSAGE_LOG_FILENAME"] || 'discord_messages.log'
        );
        Global.initUserSettings(`${Global.settings().get("DATA_PATH")}/settings.json`);
        Global.initBot();
    }

    static async initDiscord() {
        using perfCounter = this.getPerformanceCounter(`Bot::initBot()`);
        await Global.#bot.init(Global.settings().getDiscordKey());
    }

    static getPerformanceCounter(description: string) {
        return new PerformanceCounter(description);
    }

    static #splitMessage(message, size = 2000)
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
                await interaction.editReply(`Message too long, split below`);

                for (let i = 0; i < splitMessage.length; i++)
                {
                    await interaction.channel.send(splitMessage[i]);
                }
            } else {
                await interaction.editReply(message);
            }
        } catch (e) {
            Global.logger().logError(`Failed to edit reply, got error ${e}`);
        }
    }

    static async readJsonFile(path) {
        try {
            const file = await readFile(path, "utf8");
            return JSON.parse(file);
        } catch (e) {
            Global.logger().logError(`Failed to load ${path}, got ${e}`);
            return null;
        }
    }
}