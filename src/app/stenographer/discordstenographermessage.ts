import { GetKoalaBotSystem } from '../../api/koalabotsystem.js';

export interface JsonMessageLogObject {
    level: string
    message: string;
    timestamp: string;
}

export class DiscordStenographerMessage
{
    constructor(guildId: string, channelId: string, author: string, authorId: string, message: string, timestamp: number, imageUrl = "")
    {
        this.guildId = guildId;
        this.channelId = channelId;
        this.author = author;
        this.authorId = authorId;
        this.message = message;
        this.timestamp = timestamp;
        this.imageUrl = imageUrl;
    }

    readonly guildId: string;
    readonly channelId: string;
    readonly author: string;
    readonly authorId: string;
    readonly message: string;
    readonly timestamp: number;
    readonly imageUrl: string;

    getStandardDiscordMessageFormat()
    {
        return `${this.author}<@${this.authorId}>: ${this.message}`;
    }

    static createFromJsonLog(guildId: string, channelId: string, jsonLog: JsonMessageLogObject[]): DiscordStenographerMessage[]
    {
        const messages: DiscordStenographerMessage[] = [];
        try {
            for (let i = 0; i < jsonLog.length; i++)
            {
                const msg = DiscordStenographerMessage.createFromJsonLogObject(guildId, channelId, jsonLog[i]);
                if (msg !== undefined)
                {
                    messages.push(msg);
                }
            }
        } catch (e) {
            GetKoalaBotSystem().getLogger().logError(`Failed to load JSON chat logs, got: ${e}`);
        }

        return messages;
    }

    static createFromJsonLogObject(guildId: string, channelId: string, jsonLogObject: JsonMessageLogObject): DiscordStenographerMessage | undefined
    {
        try {
            return DiscordStenographerMessage.parseFromStandardMessageFormat(guildId, channelId, jsonLogObject.message);
        } catch (e) {
            GetKoalaBotSystem().getLogger().logError(`Failed to create json log object from ${jsonLogObject}, got error: ${e}`);
            return undefined;
        }
        
    }

    static parseFromStandardMessageFormat(guildId: string, channelId: string, message: string, timestamp = Date.now()): DiscordStenographerMessage
    {
        const author = message.split('<')[0];
        const authorId = message.split('<')[1].split('>')[0];
        const dstMsg = message.split(":")[1].replace(' ', "");

        return new DiscordStenographerMessage(guildId, channelId, author, authorId, dstMsg, timestamp);
    }
}
