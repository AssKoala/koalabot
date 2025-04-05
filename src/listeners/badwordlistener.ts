import { TrackedWord, WordListener } from "../api/DiscordMessageListener.js";
import { Message } from 'discord.js'
import { DiscordBotRuntimeData } from '../api/DiscordBotRuntimeData.js'
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import { Global } from "../global.js";
import { GetKoalaBotSystem } from "../api/KoalaBotSystem.js";

export function GetBadWordSaveFolder() {
    return path.join(GetKoalaBotSystem().getEnvironmentVariable("DATA_PATH"), GetKoalaBotSystem().getEnvironmentVariable("LISTENER_BADWORD_TRACKING_SAVE_DIR"))
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

        return this.badWordEvents.reduce((longestStreak, current, index, array) => {
            if (index > 0) {
                const diff = Math.abs(current.timestamp - array[index-1].timestamp);
                return Math.max(longestStreak, diff);
            }
            return longestStreak;
        }, 0);
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

class BadWordListener implements WordListener {
    private _badword: string;
    private readonly trackingChannels: string[];
    private lastUsedMap: Map<string, BadWordTracker> = new Map<string, BadWordTracker>();
    private enabled: boolean = true;
    private _displayOnlyRecords: boolean = true;

    private fileOpHandle: Promise<any> = Promise.resolve();

    private getBadWordSaveFilePath(badword: string, channelId: string) {
        return GetBadWordSaveFilePath(badword, channelId);
    }

    private getBadWordSaveFolder() {
        return GetBadWordSaveFolder();
    }

    constructor(badword: string, displayOnlyRecords: boolean = true) {
        try {
            this._badword = badword;
            this._displayOnlyRecords = displayOnlyRecords;
            this.trackingChannels = GetKoalaBotSystem().getEnvironmentVariable("LISTENER_BADWORD_TRACKING_CHANNEL").split(",");
            
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
                        const data = Global.readJsonFileSync(filePath);
        
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

    private getHumanTime(timestamp: number): [days: number, hours: number, minutes: number, seconds: number] {
        // Calculate the human readable time string
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

        return [days, hours, minutes, seconds];
    }

    private printMessage(message: Message, diff: number, average: number, isNewRecord: boolean) {
        const humanTimeSinceLast = this.getHumanTime(diff); 
        const d_days = humanTimeSinceLast[0];
        const d_hours = humanTimeSinceLast[1];
        const d_minutes = humanTimeSinceLast[2];
        const d_seconds = humanTimeSinceLast[3].toFixed(0);

        const averageHumanTime = this.getHumanTime(average);
        const a_days = averageHumanTime[0];
        const a_hours = averageHumanTime[1];
        const a_minutes = averageHumanTime[2];
        const a_seconds = averageHumanTime[3].toFixed(0);

        if (isNewRecord) {
            message.reply(`IT'S A NEW RECORD! It's been ${d_days} days ${d_hours} hours and ${d_minutes}m${d_seconds}s since the last time ${this._badword} was said with a new average of ${a_days}d ${a_hours}h ${a_minutes}m ${a_seconds}s!`);
        } else if (!this._displayOnlyRecords) {
            message.reply(`RESET THE CLOCK! It's been ${d_days} days ${d_hours} hours and ${d_minutes}m${d_seconds}s since the last time ${this._badword} was said with a new average of ${a_days}d ${a_hours}h ${a_minutes}m ${a_seconds}s!`);
        }
    }

    async onWordDetected(runtimeData: DiscordBotRuntimeData, word: TrackedWord, message: Message) {
        if (!this.enabled) return;

        if (this.trackingChannels.includes(message.channelId) && message.content.toLowerCase().includes(this._badword.toLowerCase())) {
            const newEvent = new BadWordEvent(message.member.user.id, message.member.user.username);
            let tracker;

            if (!this.lastUsedMap.has(message.channelId)) { // It's the first event
                this.lastUsedMap.set(message.channelId, new BadWordTracker());
                this.lastUsedMap.get(message.channelId).addEvent(newEvent);
                tracker = this.lastUsedMap.get(message.channelId);
            } else {    // It's not the first event
                const currentTime = newEvent.timestamp;
                tracker = this.lastUsedMap.get(message.channelId);
                let isNewRecord: boolean = false;

                // Check if this is a new record
                let diff = currentTime - tracker.last().timestamp;
                if (diff > tracker.getLongestStreak()) {
                    isNewRecord = true;
                }

                // Store off the new event
                tracker.addEvent(newEvent);

                this.printMessage(message, diff, tracker.calculateAverageStreak(), isNewRecord);
            }

            await this.fileOpHandle;
            this.fileOpHandle = fsPromises.writeFile(this.getBadWordSaveFilePath(this._badword, message.channelId), tracker.toJson(), {encoding: "utf8"});
        }
    }
}

try {
    GetKoalaBotSystem().getEnvironmentVariable("LISTENER_BADWORDS").split(",").forEach(badword => {
        if (badword == 'retard') {
            GetKoalaBotSystem().registerWordListener(new BadWordListener(badword, false), badword);        
        } else {
            GetKoalaBotSystem().registerWordListener(new BadWordListener(badword), badword);
        }
    });
} catch (e) {
    GetKoalaBotSystem().getLogger().logError(`Failed to load badwords, got ${e}`);
}
