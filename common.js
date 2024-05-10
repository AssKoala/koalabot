/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

*/

import { performance } from 'perf_hooks'
import dotenv from "dotenv";
dotenv.config();

import fs from 'fs'
import userSettings from './user_data/settings.json' assert { type: 'json' }

import winston from 'winston';

class Common
{
    static #startTimingInternal(desc) {
        try {
            const start = performance.now();
            const description = (desc == null) ? "[UNKNOWN]" : desc;

            return { "description": description, "start": start };
        } catch (e) {
            Common.logError(`Failed to start timing, got ${e}`);
        }
    }

    static #endTimingInternal(startTimingResult) {
        try {
            const end = performance.now();
            const timeMs = end - startTimingResult.start;

            Common.logInfo(`${startTimingResult.description} completed in ${timeMs} milliseconds`);

            return timeMs;
        } catch (e) {
            Common.logError(`Failed to get timing, got ${e}`);
        }

        return -1;
    }

    static #initTiming() {
        if (process.env.TIMING_ENABLE == "true") {
            this.#startTimingFunc = Common.#startTimingInternal;
            this.#endTimingFunc = Common.#endTimingInternal;
        }
    }

    static #startTimingFunc = null;
    static #endTimingFunc = null;

    static startTiming(desc) {
        if (this.#startTimingFunc != null)
            return this.#startTimingFunc(desc);
        return null;
    }

    static endTiming(startTimingResult) {
        if (this.#endTimingFunc != null)
            return this.#endTimingFunc(startTimingResult);
        return null;
    }

    static #logger = null;

    static #initLogger()
    {
        const timing = this.startTiming("initLogger(): ");

        const messageLogFile = Common.getDiscordLogFilename();
        const logFile = process.env.LOG_PATH + (process.env.FULL_LOG_FILENAME || 'combined.log');

        Common.#logger = winston.createLogger({
            levels: {
                discord_message: 0,
                fatal: 1,
                error: 2,
                warning: 3,
                info: 4,
                debug: 5,
                trace: 6,
            },
            level: process.env.LOG_LEVEL || 'debug',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                //
                // - Write all logs with importance level of `error` or less to `error.log`
                // - Write all logs with importance level of `info` or less to `combined.log`
                //
                new winston.transports.File({ filename: messageLogFile, level: 'discord_message' }),
                new winston.transports.File({ filename: logFile, level: 'debug' }),
            ],
        });

        //
        // If we're logging to console, then log with the format:
        // `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
        //
        if (process.env.LOG_TO_CONSOLE == 'true') {
            Common.#logger.add(new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.simple()
                )
            }));
        }

        this.endTiming(timing);
    }

    static #static_init = (function() {
        Common.#initTiming();
        Common.#initLogger();
    })();

    static #discordClient;

    static setDiscordClient(client)
    {
        this.#discordClient = client;
    }

    static getDiscordClient(client)
    {
        return this.#discordClient;
    }

    static getDiscordLogFilename()
    {
        return process.env.LOG_PATH + (process.env.MESSAGE_LOG_FILENAME || 'messages.log');
    }

    static getStandardDiscordMessageFormat(message)
    {
        return `${message.author.username}<@${message.author.id}>: ${message.content}`;
    }

    static splitMessage(message, size = 2000)
    {
        if (message.length <= size)
        {
            return message;
        }
        else {
            const splitCount = Math.ceil(message.length / size)
            const splitMessage = new Array(splitCount)

            for (let i = 0, c = 0; i < splitCount; ++i, c += size) {
                splitMessage[i] = message.substr(c, size)
            }

            return splitMessage
        }
    }

    static async editAndSplitReply(interaction, message)
    {
        try {
            const splitMessage = Common.splitMessage(message);
    
            if (Array.isArray(splitMessage)) {
                await interaction.editReply(`Message too long, split below`);

                for (let i = 0; i < splitMessage.length; i++)
                {
                    await interaction.channel.send(splitMessage[i]);
                }
            } else {
                await interaction.editReply(message);
            }
        } catch (e) {
            Common.logError(`Failed to edit reply, got error ${e}`);
        }
    }
    
    /**
     * Flush the user data to disk in JSON format
     */
    static async flushUserData()
    {
        try {
            const jsonString = JSON.stringify(userSettings, null, 2);
            fs.writeFile('./user_data/settings.json', jsonString, err => {
                if (err) {
                    Common.logError(`Error flushing user data file, got ${err}`);
                    return false;
                } else {
                    Common.logInfo('Successfully wrote user data');
                    return true;
                }
            });
        } catch (e) {
            Common.logError(`Failed to flush user data to disk, got error ${e}`);
        }
    }
    
    /**
     * 
     * @returns A fresh default user data object that can be inserted in the array
     */
    static getDefaultUserData(newName)
    {
        try {
            let copied = JSON.parse(JSON.stringify(userSettings.primordial));
            copied.name = newName;
            return copied;
        } catch (e) {
            Common.logError(`Failed to copy primordial user data object, got error: ${e}`);
            return null;
        }
        
    }
    
    /**
     * Retrieves stored user data object
     * @param {string} username - Discord username
     * @param {boolean} create - Create new data if it doesn't already exist
     * @returns user data object, null if user has no data
     */
    static getUserData(username, create = false)
    {
        try {
            for (let i = 0; i < userSettings.user_data.length; i++)
            {
                if (username.toLowerCase() === userSettings.user_data[i].name.toLowerCase())
                {
                    return userSettings.user_data[i];
                }
            }
        
            if (create) {
                return Common.getDefaultUserData(username);
            } else {
                return null;
            }
        }
        catch (e)
        {
            Common.logError(`Failed to get user data, got exception: ${e}`);
            return null;
        }
    }
    
    /**
     * 
     * @param {string} userData - user data object to use
     * @param {boolean} flush - flush user data to disk after setting
     */
    static setUserData(userData, flush = false)
    {
        try {
            let copied = JSON.parse(JSON.stringify(userData));
            let pushAtEnd = true;
            for (let i = 0; i < userSettings.user_data.length; i++)
            {
                if (userSettings.user_data[i].name.toLowerCase() === userData.name.toLowerCase())
                {
                    userSettings.user_data[i] = copied;
                    pushAtEnd = false;
                }
            }
        
            if (pushAtEnd)
            {
                userSettings.user_data.push(copied);
                userSettings.user_data.sort((a,b) => a.name.localeCompare(b.name));
            }
        
            Common.flushUserData();
        }
        catch (e) {
            Common.logError(`Failed to set user data, got exception ${e}`);
        }
    }
    
    /**
     * Gets the date string used for logging
     */
    static getDateString() {
        const date = new Date(Date.now());
    
        return date.toISOString() + " :: ";
    }
    
    static logDiscordMessage(message)
    {
        try {
            Common.#logger.discord_message(message);
        } catch (e) {
            console.log(`[PANIC] Failed to log discord message ${message}!!`);
        }
    }

    /**
     * Log an [INFO] message
     * @param {string} message 
     */
    static logInfo(message)
    {
        try {
            Common.#logger.info(message);
        } catch (e) {
            console.log(`[PANIC] Failed to log info ${message}!!`);
        }
    }
    
    /**
     * Log debug information, just calls console.log with [DEBUG] prepended
     * @param {string} message
     */
    static logDebug(message)
    {
        try {
            Common.#logger.debug(message);
        } catch (e) {
            console.log(`[PANIC] Failed to log debug ${message}!!`);
        }
    }
    
    /**
     * Log a [WARN] message
     * @param {string} message 
     */
    static logWarning(message)
    {
        try {
            Common.#logger.warn(message);
        } catch (e) {
            console.log(`[PANIC] Failed to log warning ${message}!!`);
        }
    }
    
    /**
     * Log an [ERR] error message
     * @param {string} message 
     * @param {Discord.interaction} or {Discord.message}
     */
    static async logError(message, discordReply = null, editReply = false)
    {
        try {
            Common.#logger.error(message);

            try {
                if (discordReply)
                {
                    if (editReply)
                    {
                        await discordReply.editReply(message);
                    }
                    else
                    {
                        await discordReply.reply(message);
                    }
                }
            }
            catch (e)
            {
                Common.#logger.error(`Failed to reply to discord, got error ${e}`);
            }
        } catch (e) {
            console.log(`[PANIC] Failed to log error ${message}!!`);
        } 
    }
    
    /**
     * Returns the discord key string based on how the program was started
     */
    static getDiscordKey()
    {
        const args = process.argv.slice(2);
    
        if (args.length > 0 && args[0] == "prod")
        {
            return process.env.DISCORD_TOKEN_PROD;
        } else {
            return process.env.DISCORD_TOKEN_TEST;
        }
    }
    
    static getDiscordAppId()
    {
        const args = process.argv.slice(2);
    
        if (args.length > 0 && args[0] == "prod")
        {
            return process.env.DISCORD_APP_ID_PROD;
        } else {
            return process.env.DISCORD_APP_ID_TEST;
        }
    }
    
    static getDiscordGuildId()
    {
        return process.env.DISCORD_GUILD_ID;
    }
    
    static registrationList = [];
    
    /**
     * Auto Registration functions for modules
     */
    static registerCommandModule(registrationFunction, jsonDataFunction)
    {
        var newEntry = {};
        newEntry['registrationFunc'] = registrationFunction;
        newEntry['jsonFunc'] = jsonDataFunction;
        Common.registrationList.push(newEntry);
    }
    
    static listenerList = [];
    
    static registerMessageListener(listen_func) {
        Common.listenerList.push(listen_func);
    }
    
    static sendMessageToListeners(message) {
        Common.listenerList.forEach(listener_func => {
            try {
                listener_func(message);
            } catch (e) {
                Common.logError(`Failed to send message to ${listener_func}, got ${e}`);
            }
            
        });
    }    
}

export { Common };
