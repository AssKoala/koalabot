import { DiscordMessageCreateListener, TrackedWord, WordListener } from "../api/discordmessagelistener.js";
import { DiscordBotRuntimeData } from '../api/discordbotruntimedata.js';
import { Message } from 'discord.js';
import { Global } from "../global.js";
import { GetKoalaBotSystem } from "../api/koalabotsystem.js";
import fs from "fs";

class TrackedWordConcrete implements TrackedWord {
    word: string;           // human readable word
    matches: string[];      // list of regexes that match the word

    constructor(word: string, matches: string[]) {
        this.word = word;
        this.matches = matches;
    }

    isInMessage(message: string): boolean {
        let result = false;
        this.matches.every(regex => {
            if (message.toLowerCase().match(regex) != null) {
                result = true;
                return false;
            }
            return true;
        });

        return result;
    }
}

export class WordTracker implements DiscordMessageCreateListener {
    private trackedWords: TrackedWordConcrete[] = [];
    private listeners: Map<string, WordListener[]> = new Map<string, WordListener[]>();

    constructor(filePath: string = null) {
        if (filePath != null) {
            const data = Global.readJsonFileSync(filePath);

            if (data != null) {
                data.forEach(entry => {
                    this.trackWord(entry);
                });
            }
        }
    }

    public trackWord(word: TrackedWord): void {
        this.trackedWords.push(new TrackedWordConcrete(word.word, word.matches));

        if (!this.listeners.has(word.word)) {
            this.listeners.set(word.word, []);
        }
    }

    public untrackWord(word: TrackedWord): void {
        throw new Error("Not yet implemented");
    }

    public registerListener(listener: WordListener, word: string): boolean {
        if (this.listeners.has(word)) {
            this.listeners.get(word).push(listener);
            return true;
        }

        return false;
    }

    onMessageCreate(runtimeData: DiscordBotRuntimeData, message: Message): Promise<void> {
        if (message.author.bot) return; // Ignore bot messages

        this.trackedWords.forEach(word => {
            if (word.isInMessage(message.content)) {
                this.listeners.get(word.word).forEach(listener => {
                    listener.onWordDetected(runtimeData, word, message);
                });
            }
        });
    }
}
