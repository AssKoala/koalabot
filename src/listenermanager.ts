import { DiscordMessageCreateListener, DiscordReactionAddListener } from './api/discordmessagelistener.js';
import { Message, MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import { DiscordBotRuntimeData } from './api/discordbotruntimedata.js';
import { getCommonLogger, LogManager } from './logging/logmanager.js'
import { Bot } from './bot.js'
import { PerformanceCounter } from './performancecounter.js';

import config from 'config';

// Listeners are processed by priority and then round-robin lists (assume random sorting)
export const enum ListenerPriority {
    Critical,
    High,
    Medium,
    Low,
    LISTENER_PRIORITY_COUNT
}

export abstract class ListenerManager {

    private static messageCreateHandlers: Map<ListenerPriority, DiscordMessageCreateListener[]> = new Map();
	private static messageReactionAddHandlers: Map<ListenerPriority, DiscordReactionAddListener[]> = new Map();
    
    // Resets all handler lists to empty.  Also serves as an init to allocate all the internal objects.
    static reset() {
        for (let i = ListenerPriority.Critical; i < ListenerPriority.LISTENER_PRIORITY_COUNT; i++) {
            this.messageCreateHandlers.set(i, []);
            this.messageReactionAddHandlers.set(i, []);
        }
    }

    static async importListeners() {    
        try {
            // Load the dynamically defined commands from the .env file
            const autoListeners = config.get<string>("Listeners.listenerList").split(",");

            for (const listener of autoListeners) {
                if (!listener) {
                    getCommonLogger().logInfo("Skipping empty listener definition");
                    continue;
                }

                using perfCounter = PerformanceCounter.Create(`importListeners::import(${listener})`);

                const modulePath = `./listeners/${listener}.js`;

                try {
                    await import(modulePath);
                    getCommonLogger().logInfo(`Successfully Loaded ${modulePath}.`);
                }
                catch (e) {
                    getCommonLogger().logErrorAsync(`Failed to load module ${modulePath}, got error ${e}`);
                }
            };
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to import all listeners, got error ${e}`);
        }
    }

	/**
	 * Register onMessageCreate listener to be called whenever a message is received by the bot.
	 * 
	 * All messages are sent to listeners, including bot messages, so protect accordingly.
	 * 
	 * You PROBABLY want to have 
	 * 		if (message.author.bot && message.content.length == 0) return;
	 * at the top of each handler, but maybe not.
	 * @param listener Listener to register, if not unique, handler will get called twice.
	 */
	static registerMessageCreateListener(listener: DiscordMessageCreateListener, priority: ListenerPriority = ListenerPriority.Low): void {
		ListenerManager.messageCreateHandlers.get(priority)!.push(listener);
	}

	/**
	 * Register onMessageReactionAdd listener to be called whenever a reaction message is received by the bot.
	 * 
	 * All messages are sent to listeners, including bot messages, so protect accordingly.
	 * 
	 * You PROBABLY want to have 
	 * 		if (user.bot) return; 
	 * at the top of the handler, but maybe not.
	 * @param listener Listener to register, if not unique, handler will get called twice.
	 */
	static registerMessageReactionAddListener(listener: DiscordReactionAddListener, priority: ListenerPriority = ListenerPriority.Low): void {
		ListenerManager.messageReactionAddHandlers.get(priority)!.push(listener);
	}

    static processMessageCreateListeners(message: Message) {
		const logManager = LogManager.get();

		if (!logManager.discordLogManager.hasChannelLogger(message.channelId)) {
            // @ts-ignore
			const created = logManager.discordLogManager.createLogger(message.guildId, message.channelId);

			if (!created) {
				getCommonLogger().logErrorAsync(`Failed to create logger for channel ${message.channelId}`);
			}
		}

        // @ts-ignore
		const guildLogger = logManager.discordLogManager.getGuildLogger(message.guildId);
		const channelLogger = logManager.discordLogManager.getChannelLogger(message.channelId);

        for (let i = 0; i < ListenerPriority.LISTENER_PRIORITY_COUNT; i++) {
            ListenerManager.messageCreateHandlers.get(i)!.forEach(handler => {
                const runtimeData = new DiscordBotRuntimeData(Bot.get(), getCommonLogger(), guildLogger, channelLogger);

                try {
                    handler.onDiscordMessageCreate(runtimeData, message);
                } catch (e) {
                    getCommonLogger().logErrorAsync(`Error in onMessageCreate listener ${handler}, got ${e}`);
                }
                
            });
        }
    }

    static processMessageReactionAddListeners(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) 
	{
		const guildLogger = LogManager.get().discordLogManager.getGuildLogger(reaction.message.guildId!);
		const channelLogger = LogManager.get().discordLogManager.getChannelLogger(reaction.message.channelId!);

        for (let i = 0; i < ListenerPriority.LISTENER_PRIORITY_COUNT; i++) {
            ListenerManager.messageReactionAddHandlers.get(i)!.forEach(handler => {
                try {
                    handler.onDiscordMessageReactionAdd(new DiscordBotRuntimeData(Bot.get(), getCommonLogger(), guildLogger, channelLogger), reaction, user);
                } catch (e) {
                    getCommonLogger().logErrorAsync(`Error with onMessageReactionAdd listender for ${handler}, got ${e}`);
                }
            });
        }
    }
}

ListenerManager.reset();