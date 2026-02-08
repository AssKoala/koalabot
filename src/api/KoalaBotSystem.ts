import { Bot } from '../bot.js'
import { DiscordMessageCreateListener, WordListener } from "./discordmessagelistener.js";
import * as Discord from 'discord.js';

export enum LogLevel {
    DISCORD_MESSAGE = 'discord_message',
    FATAL = 'fatal',
    ERROR = 'error',
    WARNING = 'warning',
    INFO = 'info',
    DEBUG = 'debug',
    TRACE = 'trace',
}

export interface Logger {
    logDiscordMessage(message: string): void;
    logInfo(message: string): void;
    logDebug(message: string): void;
    logWarning(message: string): void;
    logFatal(message: string, shouldThrow: boolean) : void;
    logError(message: string) : void;
    logErrorAsync(message: string, discordReply: Discord.ChatInputCommandInteraction, editReply: boolean): Promise<void>;
}

/*
    Public API for core bot systems.

    Use this to avoid direct dependencies outside the api folder that could break between versions.
*/
export interface KoalaBotSystem {
    getConfigVariable(key: string): string;
    getLogger(): Logger;
    registerDiscordMessageCreateListener(listener: DiscordMessageCreateListener): void;
    registerWordListener(listener: WordListener, word: string): void;
}

let internalKoalaBotSystem = function(): KoalaBotSystem {
    return Bot.get().koalaBotSystem();
};

export function SetKoalaBotSystem(koalaBotSystem: KoalaBotSystem) {
    internalKoalaBotSystem = function(): KoalaBotSystem {
        return koalaBotSystem;
    };
}

export function GetKoalaBotSystem(): KoalaBotSystem {
    return internalKoalaBotSystem();
}
