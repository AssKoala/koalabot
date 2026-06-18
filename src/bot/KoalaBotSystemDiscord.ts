import { DiscordMessageCreateListener, WordListener } from "../api/discordmessagelistener.js";
import { KoalaBotSystem, ConfigReloadListener } from "../api/koalabotsystem.js";
import { ListenerManager } from "../listenermanager.js";
import { WordTracker } from "../sys/wordtracker.js";
import { Logger } from '../api/koalabotsystem.js'
import config from "config";

export class KoalaBotSystemDiscord implements KoalaBotSystem {
    private _wordTracker: WordTracker;
    private _logger: Logger;

    constructor(logger: Logger) {
        // Create and register the word tracker
        this._wordTracker = new WordTracker(`${config.get<string>("Global.dataPath")}/${config.get<string>("Listeners.WordTracker.fileName")}`);
        this.registerDiscordMessageCreateListener(this._wordTracker);
        this._logger = logger;
    }

    // KoalaBotSystem
    getConfigVariable(key: string): string {
        return config.get<string>(key);
    }

    getLogger() {
        return this._logger;
    }

    registerDiscordMessageCreateListener(listener: DiscordMessageCreateListener): void {
        ListenerManager.registerMessageCreateListener(listener);
    }

    registerWordListener(listener: WordListener, word: string): void {
        this._wordTracker.registerListener(listener, word);
    }

    registerOnConfigReloadListener(listener: ConfigReloadListener): void {
        ListenerManager.registerConfigReloadListener(listener);
    }

    async reloadConfigs(): Promise<void> {
        // Just trigger the config reload listeners, the rest of the system should be able to handle itself
        await ListenerManager.processConfigReloadListeners();
    }
}

