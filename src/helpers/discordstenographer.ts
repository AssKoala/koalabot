import { LoggerConcrete } from '../logging/logger.js';
import { Global } from '../global.js';
import fs from 'fs';
import path from 'path';
import { DiscordMessageCreateListener } from '../api/discordmessagelistener.js'
import { ListenerManager } from "../listenermanager.js"
import { DiscordStenographerMessage } from './discordstenographermessage.js'
import { MessageCache } from './messagecache.js'
import { PerformanceCounter } from '../performancecounter.js';

/**
 * Caches discord messages in memory for use in bot processing
 */
class DiscordStenographer implements DiscordMessageCreateListener
{
    private _globalCache: MessageCache;
    private _channelCacheMap: Map<string, MessageCache> = new Map<string, MessageCache>();
    private _guildCacheMap: Map<string, MessageCache> = new Map<string, MessageCache>();
    private _maxEntriesPerCache:number;

    constructor(folderName, messageFileName, max)
    {
        using perfCounter = Global.getPerformanceCounter("DiscordStenographer::constructor(): ");

        if (max != null)
        {
            try {
                this._maxEntriesPerCache = parseInt(max);
            } catch (e) {
                // This really should never happen, but lets still use a somewhat sane default
                Global.logger().logErrorAsync(`Failed to set max entries (will use default of 1000), got ${e}`);
                this._maxEntriesPerCache = 1000;
            }
        }

        // Create the global cache
        this._globalCache = new MessageCache(this._maxEntriesPerCache);

        if (folderName != null && messageFileName != null)
        {
            const globalFileName = `${folderName}/${messageFileName}`;

            try {
                this.loadGlobalDiscordMessages(globalFileName);
            } catch (e) {
                Global.logger().logErrorAsync(`Failed to load discord messages from ${globalFileName}, got ${e}`);
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
                        Global.logger().logErrorAsync(`Failed to load guild log ${guildLogFileName}, got ${e}`);
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
                            Global.logger().logErrorAsync(`Failed to load guild log ${channelLogFileName}, got ${e}`);
                        }
                    });
                });
            } catch (e) {
                Global.logger().logErrorAsync(`Failed to all channel logs, got ${e}`);
            }
        }       
    }

    private getGlobalCache() {
        return this._globalCache;
    }

    private getChannelCache(channelId: string, create: boolean = true)
    {
        if (!this._channelCacheMap.has(channelId)) {
            this._channelCacheMap.set(channelId, new MessageCache(this._maxEntriesPerCache));
        }

        return this._channelCacheMap.get(channelId);
    }

    private getGuildCache(guildId: string, create: boolean = true) {
        if (!this._guildCacheMap.has(guildId)) {
            this._guildCacheMap.set(guildId, new MessageCache(this._maxEntriesPerCache));
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

    getTotalMessages(): number {
        let count = 0;

        // global cache
        count += this.getGlobalCache().messages().length;

        // channel caches
        this._channelCacheMap.forEach(channel => {
            count += channel.messages().length;
        });

        // guild caches
        this._guildCacheMap.forEach(guild => {
            count += guild.messages().length;
        });

        return count;
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
            Global.logger().logErrorAsync(message);
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
            Global.logger().logErrorAsync(messagesFile);
            error(`Failed to parse ${filename}, got error: ${e}`);
            return null;
        }

        return messageJson;
    }

    loadDiscordMessagesForChannel(filename, guildId: string, channelId: string)
    {
        using perfCounter = new PerformanceCounter("loadDiscordMessagesForChannel(): ");

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
        using perfCounter = new PerformanceCounter("loadDiscordMessagesForGuild(): ");

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
        using perfCounter = new PerformanceCounter("loadGlobalDiscordMessages(): ");

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
                const storedString = LoggerConcrete.getStandardDiscordMessageFormat(message);
                
                this.pushMessage(DiscordStenographerMessage.parseFromStandardMessageFormat(message.guildId, message.channelId, storedString));
            }
        } catch (e) {
            Global.logger().logErrorAsync(`Failed to log ${message} to stenographer, got ${e}`);
        }
    }
}

/**
 * Stenographer singleton
 */
class Stenographer {
    private static stenographer: DiscordStenographer = null;

    static init() {
        const logManager = Global.logManager();

        Stenographer.stenographer = new DiscordStenographer(logManager.logBaseDir, logManager.discordLogFileName, Global.settings().get("LOG_MAX_ENTRIES"));
        ListenerManager.registerMessageCreateListener(Stenographer.stenographer);
    }

    static getChannelMessages(channelId) {
        try {
            return Stenographer.stenographer.getMessages(channelId);
        } catch (e) {
            Global.logger().logErrorAsync(`Failed to get messages from channel ${channelId}, got ${e}`);
            return [];
        }
    }

    static getGuildMessages(guildId) {
        try {
            return Stenographer.stenographer.getAllMessagesFromGuild(guildId);
        } catch (e) {
            Global.logger().logErrorAsync(`Failed to get all messages from guild ${guildId}, got ${e}`);
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
            Global.logger().logErrorAsync(`Failed to push message, got ${e}`);
        }
    }

    static getInMemoryMessageCount() {
        try {
            return { "count": Stenographer.stenographer.getTotalMessages(), "max": Stenographer.stenographer.getMaxEntries() };
        } catch (e) {
            Global.logger().logErrorAsync(`Failed to get in memory message count, got ${e}`);
            return { "count": 0, "max": 0 };
        }
    }
}
Stenographer.init();

export { Stenographer, DiscordStenographer, DiscordStenographerMessage };