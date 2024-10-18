import { DiscordMessageCreateListener } from "../api/DiscordMessageListener.js";
import { Message } from 'discord.js'
import { ListenerManager } from "../listenermanager.js"
import { DiscordBotRuntimeData } from '../api/DiscordBotRuntimeData.js'

class SlimelineListener implements DiscordMessageCreateListener {
    async onMessageCreate(runtimeData: DiscordBotRuntimeData, message: Message) {
        if (message.author.bot) return;

        try {
            if (message.guildId == process.env["TWOCPU_GUILD_ID"] && message.content.includes('@slimeline')) {
                message.reply(`Hey <@${process.env["SKULL_USER_ID"]}>, ${message.author.username} wants you!`);
            }

            if (message.guildId == process.env["TWOCPU_GUILD_ID"] && message.content.includes('@cuck')) {
                message.reply(`Hey <@${process.env["GIGA_USER_ID"]}>, ${message.author.username} wants you!`);
            }
        } catch (e) {
            runtimeData.logger().logError(`Failed to reply to lister, got ${e}`);
        }
        
    }
}

ListenerManager.registerMessageCreateListener(new SlimelineListener());
