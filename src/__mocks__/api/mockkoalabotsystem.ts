import { MockLogger } from "../logging/mocklogger.js";
import { DiscordMessageCreateListener, WordListener } from "../../api/discordmessagelistener.js";

export class MockKoalaBotSystem {
    getConfigVariable(_key: string): string { return ""; }
    getLogger() { return new MockLogger(); }
    registerDiscordMessageCreateListener(_listener: DiscordMessageCreateListener): void {}
    registerWordListener(_listener: WordListener, _word: string): void {}
}