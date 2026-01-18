import { GetKoalaBotSystem } from '../../api/koalabotsystem.js';

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

    static createFromJsonLog(guildId: string, channelId: string, jsonLog: any)
    {
        let messages = [];
        try {
            for (let i = 0; i < jsonLog.length; i++)
            {
                const msg = DiscordStenographerMessage.createFromJsonLogObject(guildId, channelId, jsonLog[i]);
                if (msg != null)
                {
                    messages.push(msg);
                }
            }
        } catch (e) {
            GetKoalaBotSystem().getLogger().logError(`Failed to load JSON chat logs, got: ${e}`);
        }

        return messages;
    }

    static createFromJsonLogObject(guildId: string, channelId: string, jsonLogObject: any)
    {
        try {
            return DiscordStenographerMessage.parseFromStandardMessageFormat(guildId, channelId, jsonLogObject.message);
        } catch (e) {
            GetKoalaBotSystem().getLogger().logError(`Failed to create json log object from ${jsonLogObject}, got error: ${e}`);
            return null;
        }
        
    }

    static parseFromStandardMessageFormat(guildId: string, channelId: string, message: string, timestamp = Date.now())
    {
        var author = message.split('<')[0];
        var authorId = message.split('<')[1].split('>')[0];
        var dstMsg = message.split(":")[1].replace(' ', "");

        return new DiscordStenographerMessage(guildId, channelId, author, authorId, dstMsg, timestamp);
    }
}
