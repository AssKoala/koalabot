import { DiscordMessageCreateListener } from "../api/discordmessagelistener.js";
import { Message } from 'discord.js'
import { ListenerManager } from "../listenermanager.js"
import { LoggerConcrete } from '../logging/logger.js'
import { DiscordBotRuntimeData } from '../api/discordbotruntimedata.js'

class LogListener implements DiscordMessageCreateListener {
    async onMessageCreate(runtimeData: DiscordBotRuntimeData, message: Message) {
        // Don't log empty messages
		if (message.author.bot && message.content.length == 0) return;

        const standardMessage = LoggerConcrete.getStandardDiscordMessageFormat(message);

		runtimeData.logger().logDiscordMessage(standardMessage);
        runtimeData.channelLogger().logDiscordMessage(standardMessage);
        runtimeData.guildLogger().logDiscordMessage(standardMessage);
    }
}

ListenerManager.registerMessageCreateListener(new LogListener());
