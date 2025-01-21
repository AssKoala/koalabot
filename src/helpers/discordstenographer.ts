import { Logger } from '../logging/logger.js';
import { Global } from '../global.js';
import fs from 'fs';
import path from 'path';
import { DiscordMessageCreateListener } from '../api/DiscordMessageListener.js'
import { ListenerManager } from "../listenermanager.js"

/**
 * Discord Stenographer internally keeps messages using this data structure
 */
class DiscordStenographerMessage
{
    constructor(guildId: string, channelId: string, author: string, authorId: string, message: string, timestamp)
    {
        this.guildId = guildId;
        this.channelId = channelId;
        this.author = author;
        this.authorId = authorId;
        this.message = message;
        this.timestamp = timestamp;
    }

    readonly guildId;
    readonly channelId;
    readonly author;
    readonly authorId;
    readonly message;
    readonly timestamp;

    getStandardDiscordMessageFormat()
    {
        return `${this.author}<@${this.authorId}>: ${this.message}`;
    }

    static createFromJsonLog(guildId, channelId, jsonLog)
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
            Global.logger().logError(`Failed to load JSON chat logs, got: ${e}`);
        }

        return messages;
    }

    static createFromJsonLogObject(guildId, channelId, jsonLogObject)
    {
        try {
            return DiscordStenographerMessage.parseFromStandardMessageFormat(guildId, channelId, jsonLogObject.message);
        } catch (e) {
            Global.logger().logError(`Failed to create json log object from ${jsonLogObject}, got error: ${e}`);
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

class MessageCache
{
    private _messages: DiscordStenographerMessage[] = [];
    private _authorMessageCount: Map<string, number> = new Map<string, number>();
    private _maxEntries: number = Number.MAX_VALUE;

    constructor(messages: DiscordStenographerMessage[] = null) {
        if (messages != null) {
            this.replace(messages);
        }
    }

    replace(messages: DiscordStenographerMessage[]) {
        messages.forEach(message => {
            this.pushMessage(message);
        });
    }

    messages(): DiscordStenographerMessage[] {
        return this._messages;
    }

    getMessagesCountBy(author: string): number {
        if (!this._authorMessageCount.has(author)) return -1;

        return this._authorMessageCount.get(author);
    }

    maxEntries(): number {
        return this._maxEntries;
    }

    setMaxEntries(maxEntries: number) {
        this._maxEntries = maxEntries;
    }

    pushMessage(msg: DiscordStenographerMessage) {
        try {
            if (!this._authorMessageCount.has(msg.author)) this._authorMessageCount.set(msg.author, 0);

            this._messages.push(msg);
            this._authorMessageCount.set(msg.author, this._authorMessageCount.get(msg.author) + 1);
            this.trimEntries();
        } catch (e) {
            Global.logger().logError(`Failed to push message ${msg}, got ${e}`);
        }
    }

    popMessage()
    {
        try {
            if (this.messages().length > 0) {
                var toRet = this.messages[0];

                this._authorMessageCount.set(toRet.author, this._authorMessageCount.get(toRet.author) - 1);
                this._messages.shift();

                return toRet;
            }
        } catch (e) {
            Global.logger().logError(`Failed to pop message, got ${e}`);
        }

        return null;
    }

    trimEntries()
    {
        try {
            while (this.messages().length > this.maxEntries()) {
                this.popMessage();
            }
        } catch (e) {
            Global.logger().logError(`Failed to trim entries, got ${e}`);
        }
    }
}

/**
 * Caches discord messages in memory for use in bot processing
 */
class DiscordStenographer implements DiscordMessageCreateListener
{
    private _globalCache: MessageCache = new MessageCache();
    private _channelCacheMap: Map<string, MessageCache> = new Map<string, MessageCache>();
    private _guildCacheMap: Map<string, MessageCache> = new Map<string, MessageCache>();
    private _maxEntriesPerCache:number;

    constructor(folderName, messageFileName, max)
    {
        if (max != null)
        {
            try {
                this._maxEntriesPerCache = parseInt(max);
            } catch (e) {
                // This really should never happen, but lets still use a somewhat sane default
                Global.logger().logError(`Failed to set max entries (will use default of 1000), got ${e}`);
                this._maxEntriesPerCache = 1000;
            }
        }

        if (folderName != null && messageFileName != null)
        {
            const globalFileName = `${folderName}/${messageFileName}`;

            try {
                this.loadGlobalDiscordMessages(globalFileName);
            } catch (e) {
                Global.logger().logError(`Failed to load discord messages from ${globalFileName}, got ${e}`);
            }

            // Load each channel log
            try {
                const isDirectory = directoryName => {
                    return fs.lstatSync(directoryName).isDirectory();
                };

                // Get all guilds
                const guilds = fs.readdirSync(folderName).map(directoryName => {
                    return path.join(folderName, directoryName);
                }).filter(isDirectory);

                // For each guild
                guilds.forEach(guild => {

                    // Load the global log
                    const guildId = guild.split(path.sep).at(-1);
                    const guildLogFileName = path.join(guild, messageFileName);

                    try {
                        this.loadDiscordMessagesForGuild(guildLogFileName, guildId);
                    } catch (e) {
                        Global.logger().logError(`Failed to load guild log ${guildLogFileName}, got ${e}`);
                    }

                    // Get all the channels
                    const channels = fs.readdirSync(guild).map(directoryName => {
                        return path.join(guild, directoryName);
                    }).filter(isDirectory);

                    // For all channels, load the messages
                    channels.forEach(channel => {
                        const channelId = channel.split(path.sep).at(-1);
                        const channelLogFileName = path.join(channel, messageFileName);

                        try {
                            this.loadDiscordMessagesForChannel(channelLogFileName, guildId, channelId);
                        } catch (e) {
                            Global.logger().logError(`Failed to load guild log ${channelLogFileName}, got ${e}`);
                        }
                    });
                });
            } catch (e) {
                Global.logger().logError(`Failed to all channel logs, got ${e}`);
            }
        }       
    }

    private getGlobalCache() {
        return this._globalCache;
    }

    private getChannelCache(channelId: string, create: boolean = true)
    {
        if (!this._channelCacheMap.has(channelId)) {
            this._channelCacheMap.set(channelId, new MessageCache());
        }

        return this._channelCacheMap.get(channelId);
    }

    private getGuildCache(guildId: string, create: boolean = true) {
        if (!this._guildCacheMap.has(guildId)) {
            this._guildCacheMap.set(guildId, new MessageCache());
        }

        return this._guildCacheMap.get(guildId);
    }

    getAllMessagesFromGuild(guildId) {
        return this._globalCache.messages();
    }

    getAllGuildCaches(): Map<string, MessageCache> {
        return this._guildCacheMap;
    }

    getMessages(channelId) {
        return this.getChannelCache(channelId).messages();
    }

    getMessageCount(guildId, author) {
        return this.getGuildCache(guildId).getMessagesCountBy(author);
    }

    getMaxEntries() {
        return this._maxEntriesPerCache;
    }

    setMaxEntries(max)
    {
        this._maxEntriesPerCache = max;

        this._globalCache.setMaxEntries(max);
        this._channelCacheMap.forEach(channel => {
            channel.setMaxEntries(max);
        });
        this._guildCacheMap.forEach(guild => {
            guild.setMaxEntries(max);
        });

        this.trimEntries();
    }

    private trimEntries()
    {
        this._globalCache.trimEntries();
        this._channelCacheMap.forEach(channel => {
            channel.trimEntries();
        });
        this._guildCacheMap.forEach(guild => {
            guild.trimEntries();
        });
    }

    pushMessage(msg: DiscordStenographerMessage) {
        this._globalCache.pushMessage(msg);
        this.getChannelCache(msg.channelId).pushMessage(msg);
        this.getGuildCache(msg.guildId).pushMessage(msg);
    }

    popMessage() {
        return this._globalCache.popMessage();
    }

    private loadMessageJson(filename: string) {
        using perfCounter = Global.getPerformanceCounter("loadMessageJson(): ");

        const error = function(message){
            Global.logger().logError(message);
            return message;
        };

        let messagesFile;
        let messageJson;

        // Read the file into memory
        try 
        {
            messagesFile = "["  // make the log file into an array
                            + fs.readFileSync(filename, "utf8").toString()
                            .trim() // log files sometimes have erroneous whitespace
                            .replaceAll("\n", ",") // logs have newlines not commas
                            + "]";
        }
        catch (e)
        {
            error(`Failed to load file ${filename}, got error: ${e}`);
            return null;
        }
        
        // Parse the file into a JSON object
        try 
        {
            messageJson = JSON.parse(messagesFile);
        }
        catch (e)
        {
            Global.logger().logError(messagesFile);
            error(`Failed to parse ${filename}, got error: ${e}`);
            return null;
        }

        return messageJson;
    }

    loadDiscordMessagesForChannel(filename, guildId: string, channelId: string)
    {
        using perfCounter = Global.getPerformanceCounter("loadDiscordMessagesForChannel(): ");

        if (channelId === "") {
            throw new Error("Invalid channelId");
        }        

        const messageJson = this.loadMessageJson(filename);

        if (messageJson == null) return;

        // It's in JSON, extract runtime variant
        const messages = DiscordStenographerMessage.createFromJsonLog(guildId, channelId, messageJson);
        this.getChannelCache(channelId).replace(messages);
        Global.logger().logInfo(`Loaded ${messages.length} messages`);
    }

    loadDiscordMessagesForGuild(filename, guildId: string)
    {
        using perfCounter = Global.getPerformanceCounter("loadDiscordMessagesForGuild(): ");

        if (guildId === "") {
            throw new Error("Invalid guildId");
        }        

        const messageJson = this.loadMessageJson(filename);

        if (messageJson == null) return;

        // It's in JSON, extract runtime variant
        const messages = DiscordStenographerMessage.createFromJsonLog(guildId, 'global', messageJson);
        this.getGuildCache(guildId).replace(messages);
        Global.logger().logInfo(`Loaded ${messages.length} messages`);
    }

    loadGlobalDiscordMessages(filename) {
        using perfCounter = Global.getPerformanceCounter("loadGlobalDiscordMessages(): ");

        const messageJson = this.loadMessageJson(filename);

        if (messageJson == null) return;

        // It's in JSON, extract runtime variant
        const messages = DiscordStenographerMessage.createFromJsonLog('global', 'global', messageJson);
        this.getGlobalCache().replace(messages);
        Global.logger().logInfo(`Loaded ${messages.length} messages`);
    }

    async onMessageCreate(runtimeData, message) {
        try {
            if (!message.author.bot || message.content.length > 0) {
                const storedString = Logger.getStandardDiscordMessageFormat(message);
                
                this.pushMessage(DiscordStenographerMessage.parseFromStandardMessageFormat(message.guildId, message.channelId, storedString));
            }
        } catch (e) {
            Global.logger().logError(`Failed to log ${message} to stenographer, got ${e}`);
        }
    }
}

/**
 * Stenographer singleton
 */
class Stenographer {
    private static stenographer = null;

    static init() {
        const logManager = Global.logManager();

        Stenographer.stenographer = new DiscordStenographer(logManager.logBaseDir, logManager.discordLogFileName, Global.settings().get("LOG_MAX_ENTRIES"));
        ListenerManager.registerMessageCreateListener(Stenographer.stenographer);
    }

    static getChannelMessages(channelId) {
        try {
            return Stenographer.stenographer.getMessages(channelId);
        } catch (e) {
            Global.logger().logError(`Failed to get messages from channel ${channelId}, got ${e}`);
            return [];
        }
    }

    static getGuildMessages(guildId) {
        try {
            return Stenographer.stenographer.getAllMessagesFromGuild(guildId);
        } catch (e) {
            Global.logger().logError(`Failed to get all messages from guild ${guildId}, got ${e}`);
            return [];
        }
    }

    static getAllGuildCaches() {
        return Stenographer.stenographer.getAllGuildCaches();
    }

    static getMessageCount(guildId: string, author: string) {
        return Stenographer.stenographer.getMessageCount(guildId, author);
    }

    static pushMessage(msg) {
        try {
            Stenographer.stenographer.pushMessage(msg);
        } catch (e) {
            Global.logger().logError(`Failed to push message, got ${e}`);
        }
    }

    static getInMemoryMessageCount() {
        try {
            return { "count": Stenographer.stenographer.getMessages().length, "max": Stenographer.stenographer.getMaxEntries() };
        } catch (e) {
            Global.logger().logError(`Failed to get in memory message count, got ${e}`);
            return { "count": 0, "max": 0 };
        }
    }
}
Stenographer.init();

export { Stenographer, DiscordStenographer, DiscordStenographerMessage };