import { Global } from "../global.js";
import { DiscordMessageCreateListener, WordListener } from "./discordmessagelistener.js";

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
    logFatal(message: string, shouldThrow: boolean);
    logError(message: string);
    logErrorAsync(message: string, discordReply, editReply: boolean): Promise<void>;
}

/*
    Public API for core bot systems.

    Use this to avoid direct dependencies outside the api folder that could break between versions.
*/
export interface KoalaBotSystem {
    getEnvironmentVariable(key: string): string;
    getLogger(): Logger;
    registerDiscordMessageCreateListener(listener: DiscordMessageCreateListener): void;
    registerWordListener(listener: WordListener, word: string): void;
}

let internalKoalaBotSystem = function(): KoalaBotSystem {
    return Global.bot().koalaBotSystem();
};

export function SetKoalaBotSystem(koalaBotSystem: KoalaBotSystem) {
    internalKoalaBotSystem = function(): KoalaBotSystem {
        return koalaBotSystem;
    };
}

export function GetKoalaBotSystem(): KoalaBotSystem {
    return internalKoalaBotSystem();
}
