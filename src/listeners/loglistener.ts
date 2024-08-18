import { DiscordMessageCreateListener } from "../api/DiscordMessageListener.js";
import { Message } from 'discord.js'
import { ListenerManager } from "../listenermanager.js"
import { Global } from '../global.js'
import { Logger } from '../logging/logger.js'
import { DiscordBotRuntimeData } from '../api/DiscordBotRuntimeData.js'

class LogListener implements DiscordMessageCreateListener {
    async onMessageCreate(runtimeData: DiscordBotRuntimeData, message: Message) {
        // Don't log empty messages
		if (message.author.bot && message.content.length == 0) return;

		Global.logger().logDiscordMessage(Logger.getStandardDiscordMessageFormat(message));
    }
}

ListenerManager.registerMessageCreateListener(new LogListener());
