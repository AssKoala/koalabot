import { Logger } from '../logging/logger.js';
import { Global } from '../global.js';
import fs from 'fs';

/**
 * Discord Stenographer internally keeps messages using this data structure
 */
class DiscordStenographerMessage
{
    constructor(author: string, authorId: string, message: string, timestamp)
    {
        this.author = author;
        this.authorId = authorId;
        this.message = message;
        this.timestamp = timestamp;
    }

    author;
    authorId;
    message;
    timestamp;

    getStandardDiscordMessageFormat()
    {
        return `${this.author}<@${this.authorId}>: ${this.message}`;
    }

    static createFromJsonLog(jsonLog)
    {
        let messages = [];
        try {
            for (let i = 0; i < jsonLog.length; i++)
            {
                const msg = DiscordStenographerMessage.createFromJsonLogObject(jsonLog[i]);
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

    static createFromJsonLogObject(jsonLogObject)
    {
        try {
            return DiscordStenographerMessage.parseFromStandardMessageFormat(jsonLogObject.message);
        } catch (e) {
            Global.logger().logError(`Failed to create json log object from ${jsonLogObject}, got error: ${e}`);
            return null;
        }
        
    }

    static parseFromStandardMessageFormat(message, timestamp = Date.now())
    {
        var author = message.split('<')[0];
        var authorId = message.split('<')[1].split('>')[0];
        var dstMsg = message.split(":")[1].replace(' ', "");

        return new DiscordStenographerMessage(author,authorId,dstMsg,timestamp);
    }
}

/**
 * Caches discord messages in memory for use in bot processing
 */
class DiscordStenographer
{
    #messages = [];
    #maxEntries = Number.MAX_VALUE;
    #messageCount = [];

    constructor(filename, max)
    {
        if (max != null)
        {
            try {
                this.#maxEntries = parseInt(max);
            } catch (e) {
                Global.logger().logError(`Failed to set max entries, got ${e}`);
            }
        }

        if (filename != null)
        {
            try {
                this.loadDiscordMessages(filename);
            } catch (e) {
                Global.logger().logError(`Failed to load discord messages from ${filename}, got ${e}`);
            }
        }       
    }

    getMessages()
    {
        return this.#messages;
    }

    getMessageCount(author)
    {
        if (author in this.#messageCount)
        {
            return this.#messageCount[author];
        }

        return 0;
    }

    getMaxEntries()
    {
        return this.#maxEntries;
    }

    setMaxEntries(max)
    {
        this.#maxEntries = max;
    }

    #trimEntries()
    {
        try {
            while (this.#messages.length > this.#maxEntries) {
                this.popMessage();
            }
        } catch (e) {
            Global.logger().logError(`Failed to trim entries, got ${e}`);
        }
    }

    pushMessage(discordStenographerMsg)
    {
        try {
            if (!(discordStenographerMsg.author in this.#messageCount)) this.#messageCount[discordStenographerMsg.author] = 0;

            this.#messages.push(discordStenographerMsg);
            this.#messageCount[discordStenographerMsg.author]++;
            this.#trimEntries();
        } catch (e) {
            Global.logger().logError(`Failed to push message ${discordStenographerMsg}, got ${e}`);
        }
    }

    popMessage()
    {
        try {
            if (this.#messages.length > 0) {
                var toRet = this.#messages[0];

                this.#messageCount[toRet.author]--;
                this.#messages.shift();

                return toRet;
            }
        } catch (e) {
            Global.logger().logError(`Failed to pop message, got ${e}`);
        }

        return null;
    }

    loadDiscordMessages(filename)
    {
        using perfCounter = Global.getPerformanceCounter("loadDiscordMessages(): ");

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
            return error(`Failed to load file ${filename}, got error: ${e}`);
        }
        
        // Parse the file into a JSON object
        try 
        {
            messageJson = JSON.parse(messagesFile);
        }
        catch (e)
        {
            Global.logger().logError(messagesFile);
            return error(`Failed to parse ${filename}, got error: ${e}`);
        }

        // It's in JSON, extract runtime variant
        this.#messages = DiscordStenographerMessage.createFromJsonLog(messageJson);

        // Refresh counts
        this.#messages.forEach((msg) => {
            if (!(msg.author in this.#messageCount)) this.#messageCount[msg.author] = 0;
            this.#messageCount[msg.author]++;
        });

        // Trim excess
        this.#trimEntries();

        Global.logger().logInfo(`Loaded ${this.#messages.length} messages`);

        
    }
}

/**
 * Stenographer singleton
 */
class Stenographer {
    static #stenographer = null;

    static init = (function () {
        this.#stenographer = new DiscordStenographer(Global.logManager().getGlobalDiscordLogFullPath(), Global.settings().get("LOG_MAX_ENTRIES"));
        Global.bot().registerMessageListener((message) => this.#stenographerListener(message));
    });

    static #stenographerListener(message) {
        try {
            if (!message.author.bot || message.content.length > 0) {
                const storedString = Logger.getStandardDiscordMessageFormat(message);
                this.#stenographer.pushMessage(DiscordStenographerMessage.parseFromStandardMessageFormat(storedString), Date.now);
            }
        } catch (e) {
            Global.logger().logError(`Failed to log ${message} to stenographer, got ${e}`);
        }
    }

    static getMessages() {
        try {
            return this.#stenographer.getMessages();
        } catch (e) {
            Global.logger().logError(`Failed to get messages, got ${e}`);
        }

        return [];
    }

    static getMessageCount(author) {
        return this.#stenographer.getMessageCount(author);
    }

    static pushMessage(msg) {
        try {
            this.#stenographer.pushMessage(msg);
        } catch (e) {
            Global.logger().logError(`Failed to push message, got ${e}`);
        }
    }

    static getInMemoryMessageCount() {
        try {
            return { "count": this.#stenographer.getMessages().length, "max": this.#stenographer.getMaxEntries() };
        } catch (e) {
            Global.logger().logError(`Failed to get in memory message count, got ${e}`);
            return { "count": 0, "max": 0 };
        }
    }
}
Stenographer.init();

export { Stenographer, DiscordStenographer, DiscordStenographerMessage };