import fs from 'fs';
import path from 'path';
import { DiscordMessageCreateListener } from '../../api/discordmessagelistener.js'
import { ListenerManager, ListenerPriority } from "../../listenermanager.js"
import { DiscordStenographerMessage } from './discordstenographermessage.js'
import { MessageCache } from './messagecache.js'
import { PerformanceCounter } from '../../performancecounter.js';
import { DiscordBotRuntimeData } from '../../api/discordbotruntimedata.js';
import { getCommonLogger, LogManager } from '../../logging/logmanager.js';

import * as Discord from 'discord.js';
import config from 'config';

/**
 * Caches discord messages in memory for use in bot processing
 */
class DiscordStenographer implements DiscordMessageCreateListener
{
    private static readonly DEFAULT_MAX_ENTRIES_PER_CACHE = 1000;
    private _globalCache: MessageCache;
    private _channelCacheMap: Map<string, MessageCache> = new Map<string, MessageCache>();
    private _guildCacheMap: Map<string, MessageCache> = new Map<string, MessageCache>();
    private _maxEntriesPerCache: number = DiscordStenographer.DEFAULT_MAX_ENTRIES_PER_CACHE;

    constructor(folderName: string, messageFileName: string, max: string)
    {
        using perfCounter = PerformanceCounter.Create("DiscordStenographer::constructor(): ");

        if (max != null)
        {
            try {
                this._maxEntriesPerCache = parseInt(max);
            } catch (e) {
                // This really should never happen, but lets still use a somewhat sane default
                getCommonLogger().logErrorAsync(`Failed to set max entries (will use default of ${DiscordStenographer.DEFAULT_MAX_ENTRIES_PER_CACHE}), got ${e}`);
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
                getCommonLogger().logErrorAsync(`Failed to load discord messages from ${globalFileName}, got ${e}`);
            }

            // Load each channel log
            try {
                const isDirectory = (directoryName: string) => {
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

                    if (!guildId) {
                        getCommonLogger().logErrorAsync(`Failed to get guild ID from path ${guild}`);
                        return;
                    }

                    try {
                        this.loadDiscordMessagesForGuild(guildLogFileName, guildId);
                    } catch (e) {
                        getCommonLogger().logErrorAsync(`Failed to load guild log ${guildLogFileName}, got ${e}`);
                    }

                    // Get all the channels
                    const channels = fs.readdirSync(guild).map(directoryName => {
                        return path.join(guild, directoryName);
                    }).filter(isDirectory);

                    // For all channels, load the messages
                    channels.forEach(channel => {
                        const channelId = channel.split(path.sep).at(-1);
                        const channelLogFileName = path.join(channel, messageFileName);

                        if (!channelId) {
                            getCommonLogger().logErrorAsync(`Failed to get channel ID from path ${channel}`);
                            return;
                        }

                        try {
                            this.loadDiscordMessagesForChannel(channelLogFileName, guildId, channelId);
                        } catch (e) {
                            getCommonLogger().logErrorAsync(`Failed to load guild log ${channelLogFileName}, got ${e}`);
                        }
                    });
                });
            } catch (e) {
                getCommonLogger().logErrorAsync(`Failed to all channel logs, got ${e}`);
            }
        }       
    }

    private getGlobalCache() {
        return this._globalCache;
    }

    private getChannelCache(channelId: string): MessageCache {
        if (!this._channelCacheMap.has(channelId)) {
            this._channelCacheMap.set(channelId, new MessageCache(this._maxEntriesPerCache));
        }

        return this._channelCacheMap.get(channelId)!;
    }

    private getGuildCache(guildId: string) {
        if (!this._guildCacheMap.has(guildId)) {
            this._guildCacheMap.set(guildId, new MessageCache(this._maxEntriesPerCache));
        }

        return this._guildCacheMap.get(guildId)!;
    }

    getAllMessagesFromGuild(guildId: string) {
        return this.getGuildCache(guildId).messages();
    }

    getAllGuildCaches(): Map<string, MessageCache> {
        return this._guildCacheMap;
    }

    getMessages(channelId: string) {
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

    getMessageCount(guildId: string, author: string) {
        return this.getGuildCache(guildId).getMessagesCountBy(author);
    }

    getMaxEntries() {
        return this._maxEntriesPerCache;
    }

    setMaxEntries(max: number)
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
        using perfCounter = PerformanceCounter.Create("loadMessageJson(): ");

        const error = function(message: string){
            getCommonLogger().logErrorAsync(message);
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
            getCommonLogger().logErrorAsync(messagesFile);
            error(`Failed to parse ${filename}, got error: ${e}`);
            return null;
        }

        return messageJson;
    }

    loadDiscordMessagesForChannel(filename: string, guildId: string, channelId: string)
    {
        using perfCounter = PerformanceCounter.Create("loadDiscordMessagesForChannel(): ");

        if (channelId === "") {
            throw new Error("Invalid channelId");
        }        

        const messageJson = this.loadMessageJson(filename);

        if (messageJson == null) return;

        // It's in JSON, extract runtime variant
        const messages = DiscordStenographerMessage.createFromJsonLog(guildId, channelId, messageJson);
        this.getChannelCache(channelId).replace(messages);
        getCommonLogger().logInfo(`DiscordStenographer::loadDiscordMessagesForChannel(${filename}, ${guildId}, ${channelId}): Loaded ${messages.length} messages`);
    }

    loadDiscordMessagesForGuild(filename: string, guildId: string)
    {
        using perfCounter = PerformanceCounter.Create("loadDiscordMessagesForGuild(): ");

        if (guildId === "") {
            throw new Error("Invalid guildId");
        }        

        const messageJson = this.loadMessageJson(filename);

        if (messageJson == null) return;

        // It's in JSON, extract runtime variant
        const messages = DiscordStenographerMessage.createFromJsonLog(guildId, 'global', messageJson);
        this.getGuildCache(guildId).replace(messages);
        getCommonLogger().logInfo(`DiscordStenographer::loadDiscordMessagesForGuild(${filename}, ${guildId}): Loaded ${messages.length} messages`);
    }

    loadGlobalDiscordMessages(filename: string) {
        using perfCounter = PerformanceCounter.Create("loadGlobalDiscordMessages(): ");

        const messageJson = this.loadMessageJson(filename);

        if (messageJson == null) return;

        // It's in JSON, extract runtime variant
        const messages = DiscordStenographerMessage.createFromJsonLog('global', 'global', messageJson);
        this.getGlobalCache().replace(messages);
        getCommonLogger().logInfo(`DiscordStenographer::loadGlobalDiscordMessages(${filename}): Loaded ${messages.length} messages`);
    }

    async onDiscordMessageCreate(runtimeData: DiscordBotRuntimeData, message: Discord.Message) {
        try {
            if (message.author.id != runtimeData.botId()
               && (message.content.length > 0 || (config.get<boolean>("Stenographer.storeImages") && message.attachments.size > 0))) 
            {
                if (!message.guildId) {
                    throw new Error(`Failed to log message to stenographer, message.guildId is null: bot currently only supports guild messages`);
                }

                let imageUrl = "";

                if (config.get<boolean>("Stenographer.storeImages") && message.attachments.size > 0) {
                    const attachment = message.attachments.first();
                    if (attachment) {
                        imageUrl = attachment.url;
                    }
                }

                const msg = new DiscordStenographerMessage(
                    message.guildId!,
                    message.channelId,
                    message.author.username,
                    message.author.id,
                    message.content,
                    Date.now(),
                    imageUrl
                );

                this.pushMessage(msg);
            }
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to log ${message} to stenographer, got ${e}`);
        }
    }
}

/**
 * Stenographer singleton
 */
class Stenographer {
    private static stenographer?: DiscordStenographer = undefined;

    static init(logManager: LogManager) {
        using _perf = PerformanceCounter.Create(`Stenographer::init(${logManager})`);

        Stenographer.stenographer = new DiscordStenographer(logManager.logBaseDir, logManager.getDiscordLogFileName(), config.get<string>("Global.logMaxEntries"));
        ListenerManager.registerMessageCreateListener(Stenographer.stenographer, ListenerPriority.High);
    }

    static getChannelMessages(channelId: string) {
        try {
            return Stenographer.stenographer!.getMessages(channelId);
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to get messages from channel ${channelId}, got ${e}`);
            return [];
        }
    }

    static getGuildMessages(guildId: string) {
        try {
            return Stenographer.stenographer!.getAllMessagesFromGuild(guildId);
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to get all messages from guild ${guildId}, got ${e}`);
            return [];
        }
    }

    static getAllGuildCaches() {
        return Stenographer.stenographer!.getAllGuildCaches();
    }

    static getMessageCount(guildId: string, author: string) {
        return Stenographer.stenographer!.getMessageCount(guildId, author);
    }

    static pushMessage(msg: DiscordStenographerMessage) {
        try {
            Stenographer.stenographer!.pushMessage(msg);
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to push message, got ${e}`);
        }
    }

    static getInMemoryMessageCount() {
        try {
            return { "count": Stenographer.stenographer!.getTotalMessages(), "max": Stenographer.stenographer!.getMaxEntries() };
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to get in memory message count, got ${e}`);
            return { "count": 0, "max": 0 };
        }
    }
}

export { Stenographer, DiscordStenographer};
