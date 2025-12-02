import { KoalaBotSystem, Logger } from "../koalabotsystem.js";
import { DiscordMessageCreateListener, WordListener } from "../discordmessagelistener.js";

class MockLogger implements Logger {
    logDiscordMessage(message: string) {}
    logInfo(message: string) {}
    logDebug(message: string) {}
    logWarning(message: string) {}
    logFatal(message: string, shouldThrow: boolean) {}
    logError(message: string) {}
    async logErrorAsync(message: string, discordReply: any, editReply: boolean) {}
}

class KoalaBotSystemMock implements KoalaBotSystem {
    getLogger(): Logger {
        return new MockLogger();
    }
    registerWordListener(listener: WordListener, word: string): void {
        throw new Error("Method not implemented.");
    }
    registerDiscordMessageCreateListener(listener: DiscordMessageCreateListener): void {
        throw new Error("Method not implemented.");
    }
    getEnvironmentVariable(key: string): string {
        throw new Error("Method not implemented.");
    }
}

export function GetKoalaBotSystem(): KoalaBotSystem {
    return new KoalaBotSystemMock();
}
