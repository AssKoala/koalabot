import { TrackedWord, WordListener } from "../api/discordmessagelistener.js";
import { Message } from 'discord.js'
import { DiscordBotRuntimeData } from '../api/discordbotruntimedata.js'
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import { GetKoalaBotSystem } from "../api/koalabotsystem.js";
import { readJsonFileSync } from '../sys/jsonreader.js'

export function GetBadWordSaveFolder() {
    return path.join(GetKoalaBotSystem().getConfigVariable("Global.dataPath"), GetKoalaBotSystem().getConfigVariable("Listeners.BadWordListener.saveDir"));
}

export function GetBadWordSaveFileName(badword: string, channelId: string) {
    return `${badword}_${channelId}.json`;
}

export function GetBadWordSaveFilePath(badword: string, channelId: string) {
    return path.join(GetBadWordSaveFolder(), GetBadWordSaveFileName(badword, channelId));
}

interface IBadWordEvent {
    timestamp: number;
    userId: string;
    userName: string;
}

enum BadWordResponseType {
    ALL,
    NEW_RECORD,
    NONE
}

class BadWordEvent implements IBadWordEvent { 
    constructor(userId: string, userName: string) {
        this.userId = userId;
        this.userName = userName;
        this.timestamp = Date.now();
    }

    public userId: string;
    public userName: string;
    public timestamp: number;
}

class BadWordTracker {
    private badWordEvents: IBadWordEvent[];
    // @ts-expect-error todo cleanup tech debt
    private longestStreak: number;

    constructor(badWordEvents: IBadWordEvent[] = []) {
        this.badWordEvents = badWordEvents;

        if (this.badWordEvents.length > 1) {
            this.longestStreak = this.recalculateLongestStreak();
        }
    }

    public getLongestStreak(): number {
        return this.longestStreak;
    }

    public recalculateLongestStreak() {
        if (this.badWordEvents.length < 2) {
            return 0;
        }

        this.longestStreak = this.badWordEvents.reduce((longestStreak, current, index, array) => {
            if (index > 0) {
                const diff = Math.abs(current.timestamp - array[index-1].timestamp);
                return Math.max(longestStreak, diff);
            }
            return longestStreak;
        }, 0);

        return this.longestStreak;
    }

    public calculateAverageStreak() {
        if (this.badWordEvents.length < 2) return 0;

        let currentAverage: number = 0;

        for (let currentEntryNumber = 1; currentEntryNumber < this.badWordEvents.length; currentEntryNumber++) {
            const n_1 = currentEntryNumber;
            const diff = this.badWordEvents[currentEntryNumber].timestamp - this.badWordEvents[currentEntryNumber-1].timestamp

            currentAverage = currentAverage + (1/n_1)*diff - (1/n_1)*currentAverage;
        }

        return currentAverage;
    }

    public fromJsonString(eventJson: string) {
        this.badWordEvents = JSON.parse(eventJson);
    }

    public toJson(): string {
        return JSON.stringify(this.badWordEvents);//, null, 2);
    }

    public addEvent(event: BadWordEvent) {
        this.badWordEvents.push(event);
        this.recalculateLongestStreak();
    }

    public last() {
        if (this.badWordEvents.length > 0) {
            return this.badWordEvents[this.badWordEvents.length - 1];
        }

        return null;
    }

    public first() {
        if (this.badWordEvents.length > 0) {
            return this.badWordEvents[0];
        }

        return null;
    }
}

class HumanReadableTimestamp {
    readonly days: number;
    readonly hours: number;
    readonly minutes: number;
    readonly seconds: number;

    constructor(timestamp: number) {
        let days = 0;
        let hours = 0;

        const ms_per_day = 86400000;
        const ms_per_hour = 3600000;

        // sub days
        while (timestamp > ms_per_day) {
            timestamp -= ms_per_day;
            days++;
        }

        // sub hours
        while (timestamp > ms_per_hour) {
            timestamp -= ms_per_hour;
            hours++;
        }

        const minutes = Math.floor(timestamp / 60000);
        const seconds = ((timestamp % 60000) / 1000);

        this.days = days;
        this.hours = hours;
        this.minutes = minutes;
        this.seconds = seconds;
    }

    public toString(short: boolean = true): string {
        if (short) return `${this.days}d ${this.hours}h ${this.minutes}m ${this.seconds.toFixed(0)}s`;
        else return `${this.days} days ${this.hours} hours and ${this.minutes}m${this.seconds.toFixed(0)}s`;
    }
}

class BadWordListener implements WordListener {
    // @ts-expect-error todo cleanup tech debt
    private _badword: string;
    // @ts-expect-error todo cleanup tech debt
    private readonly trackingChannels: string[];
    private lastUsedMap: Map<string, BadWordTracker> = new Map<string, BadWordTracker>();
    private enabled: boolean = true;
    // @ts-expect-error todo cleanup tech debt
    private responseType: BadWordResponseType;

    private fileOpHandle: Promise<any> = Promise.resolve();

    private getBadWordSaveFilePath(badword: string, channelId: string) {
        return GetBadWordSaveFilePath(badword, channelId);
    }

    private getBadWordSaveFolder() {
        return GetBadWordSaveFolder();
    }

    constructor(badword: string, responseType: BadWordResponseType = BadWordResponseType.NONE) {
        try {
            this._badword = badword;
            this.responseType = responseType;
            this.trackingChannels = GetKoalaBotSystem().getConfigVariable("Listeners.BadWordListener.trackingChannelIds").split(",");
            
            const saveFolder = this.getBadWordSaveFolder();

            // If tracking folder doesn't exist, create it
            if (!fs.existsSync(saveFolder)) {
                GetKoalaBotSystem().getLogger().logInfo("Creating folder for badword tracking data");

                this.fileOpHandle = fsPromises.mkdir(saveFolder, { recursive: true });
            } else {    // If the folder exists, check if we need to load any saved data
                this.trackingChannels.forEach((channel) => {
                    GetKoalaBotSystem().getLogger().logInfo(`Loading badword tracking data for channel ${channel}`);

                    const filePath = this.getBadWordSaveFilePath(this._badword, channel);
                    if (fs.existsSync(filePath)) {
                        const data = readJsonFileSync(filePath);
        
                        if (data) {
                            this.lastUsedMap.set(channel, new BadWordTracker(data));
                        }
                    }
                });
            }
        } catch (e) {
            GetKoalaBotSystem().getLogger().logError(`Failed to load badword historic data, got ${e}`);
        }
    }

    private printMessage(message: Message, diff: number, average: number, longestStreak: number, isNewRecord: boolean) {
        const timeSinceLast = new HumanReadableTimestamp(diff);
        const averageTime = new HumanReadableTimestamp(average);
        const longestStreakTime = new HumanReadableTimestamp(longestStreak);

        if (isNewRecord && this.responseType != BadWordResponseType.NONE) {
            message.reply(`IT'S A NEW RECORD! It's been ${timeSinceLast.toString(false)} since the last time ${this._badword} was said with a new average of ${averageTime.toString()}!`);
        } else if (this.responseType != BadWordResponseType.NONE && this.responseType != BadWordResponseType.NEW_RECORD) {
            message.reply(`RESET THE CLOCK! It's been ${timeSinceLast.toString(false)} since the last time ${this._badword} was said with a new average of ${averageTime.toString()} with an active long streak of ${longestStreakTime.toString()}!`);
        }
    }

    async onWordDetected(runtimeData: DiscordBotRuntimeData, word: TrackedWord, message: Message) {
        if (!this.enabled) return;

        if (this.trackingChannels.includes(message.channelId) && message.content.toLowerCase().includes(this._badword.toLowerCase())) {
            // @ts-expect-error todo cleanup tech debt
            const newEvent = new BadWordEvent(message.member.user.id, message.member.user.username);
            // @ts-expect-error todo cleanup tech debt
            let tracker: BadWordTracker = null;

            if (!this.lastUsedMap.has(message.channelId)) { // It's the first event
                this.lastUsedMap.set(message.channelId, new BadWordTracker());
                // @ts-expect-error todo cleanup tech debt
                this.lastUsedMap.get(message.channelId).addEvent(newEvent);
                // @ts-expect-error todo cleanup tech debt
                tracker = this.lastUsedMap.get(message.channelId);
            } else {    // It's not the first event
                const currentTime = newEvent.timestamp;
                // @ts-expect-error todo cleanup tech debt
                tracker = this.lastUsedMap.get(message.channelId);
                let isNewRecord: boolean = false;

                // Check if this is a new record
                // @ts-expect-error todo cleanup tech debt
                let diff = currentTime - tracker.last().timestamp;
                if (diff > tracker.getLongestStreak()) {
                    isNewRecord = true;
                }

                // Store off the new event
                tracker.addEvent(newEvent);

                this.printMessage(message, diff, tracker.calculateAverageStreak(), tracker.getLongestStreak(), isNewRecord);
            }

            await this.fileOpHandle;
            this.fileOpHandle = fsPromises.writeFile(this.getBadWordSaveFilePath(this._badword, message.channelId), tracker.toJson(), {encoding: "utf8"});
        }
    }
}

try {
    GetKoalaBotSystem().getConfigVariable("Listeners.BadWordListener.badwords").split(",").forEach(badword => {
        if (badword == 'retard') {
            GetKoalaBotSystem().registerWordListener(new BadWordListener(badword, BadWordResponseType.ALL), badword);
        } else {
            GetKoalaBotSystem().registerWordListener(new BadWordListener(badword, BadWordResponseType.NEW_RECORD), badword);
        }
    });
} catch (e) {
    GetKoalaBotSystem().getLogger().logError(`Failed to load badwords, got ${e}`);
}
