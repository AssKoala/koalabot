import { DiscordMessageCreateListener, DiscordReactionAddListener } from './api/DiscordMessageListener.js';
import { Message, MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import { Global } from './global.js';
import { DiscordBotRuntimeData } from './api/DiscordBotRuntimeData.js';

export abstract class ListenerManager {
    static async importListeners() {
        try {
            // Load the dynamically defined commands from the .env file
            const autoListeners = Global.settings().get("LISTENER_LIST").split(",");

            for (const listener of autoListeners) {
                if (!listener) {
                    Global.logger().logInfo("Skipping empty listener definition");
                    continue;
                }

                using perfCounter = Global.getPerformanceCounter(`importListeners::import(${listener})`);

                const modulePath = `./listeners/${listener}.js`;

                try {
                    await import(modulePath);
                    Global.logger().logInfo(`Successfully Loaded ${modulePath}.`);
                }
                catch (e) {
                    Global.logger().logError(`Failed to load module ${modulePath}, got error ${e}`);
                }
            };
        } catch (e) {
            Global.logger().logError(`Failed to import all listeners, got error ${e}`);
        }
    }

    private static messageCreateHandlers: DiscordMessageCreateListener[] = [];
	private static messageReactionAddHandlers: DiscordReactionAddListener[] = [];

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
	static registerMessageCreateListener(listener: DiscordMessageCreateListener): void {
		ListenerManager.messageCreateHandlers.push(listener);
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
	static registerMessageReactionAddListener(listener: DiscordReactionAddListener): void {
		ListenerManager.messageReactionAddHandlers.push(listener);
	}

    static processMessageCreateListeners(message: Message) {
        ListenerManager.messageCreateHandlers.forEach(handler => {
			handler.onMessageCreate(new DiscordBotRuntimeData(Global.bot(), Global.logger(), Global.settings()), message);
		});
    }

    static processMessageReactionAddListeners(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
        ListenerManager.messageReactionAddHandlers.forEach(handler => {
			handler.onMessageReactionAdd(new DiscordBotRuntimeData(Global.bot(), Global.logger(), Global.settings()), reaction, user);
		});
    }
}

