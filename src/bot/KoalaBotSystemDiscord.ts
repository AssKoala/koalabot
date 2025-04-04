import { DiscordMessageCreateListener, WordListener } from "../api/DiscordMessageListener.js";
import { KoalaBotSystem } from "../api/KoalaBotSystem.js";
import { Global } from "../global.js";
import { ListenerManager } from "../listenermanager.js";
import { WordTracker } from "../listeners/wordtracker.js";

export class KoalaBotSystemDiscord implements KoalaBotSystem {
    private _wordTracker: WordTracker;

    constructor() {
        // Create and register the word tracker
        this._wordTracker = new WordTracker(`${Global.settings().get("DATA_PATH")}/${Global.settings().get("WORD_TRACKER_FILENAME")}`);
        this.registerDiscordMessageCreateListener(this._wordTracker);
    }

    // KoalaBotSystem
    getEnvironmentVariable(key: string): string {
        return Global.settings().get(key);
    }

    getLogger() {
        return Global.logger();
    }

    registerDiscordMessageCreateListener(listener: DiscordMessageCreateListener): void {
        ListenerManager.registerMessageCreateListener(listener);
    }

    registerWordListener(listener: WordListener, word: string): void {
        this._wordTracker.registerListener(listener, word);
    }

}

