import { MockLogger } from "../logging/mocklogger.js";
import { DiscordMessageCreateListener, WordListener } from "../../api/discordmessagelistener.js";
import { ConfigReloadListener } from "../../api/koalabotsystem.js";

export class MockKoalaBotSystem {
    getConfigVariable(_key: string): string { return ""; }
    getLogger() { return new MockLogger(); }
    registerDiscordMessageCreateListener(_listener: DiscordMessageCreateListener): void {}
    registerWordListener(_listener: WordListener, _word: string): void {}
    registerOnConfigReloadListener(_listener: ConfigReloadListener): void {}
    registerConfigReloadListener(_listener: ConfigReloadListener, _priority: number): void {}
    async reloadConfigs(): Promise<void> {}
}