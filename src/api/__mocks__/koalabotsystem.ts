import { KoalaBotSystem, Logger } from "../koalabotsystem.js";
import { DiscordMessageCreateListener, WordListener } from "../discordmessagelistener.js";

class MockLogger implements Logger {
    logDiscordMessage(_message: string) {}
    logInfo(_message: string) {}
    logDebug(_message: string) {}
    logWarning(_message: string) {}
    logFatal(_message: string, _shouldThrow: boolean) {}
    logError(_message: string) {}
    async logErrorAsync(_message: string, _discordReply: any, _editReply: boolean) {}   // eslint-disable-line @typescript-eslint/no-explicit-any
}

class KoalaBotSystemMock implements KoalaBotSystem {
    getLogger(): Logger {
        return new MockLogger();
    }
    registerWordListener(_listener: WordListener, _word: string): void {
        throw new Error("Method not implemented.");
    }
    registerDiscordMessageCreateListener(_listener: DiscordMessageCreateListener): void {
        throw new Error("Method not implemented.");
    }
    getConfigVariable(_key: string): string {
        throw new Error("Method not implemented.");
    }
}

export function GetKoalaBotSystem(): KoalaBotSystem {
    return new KoalaBotSystemMock();
}
