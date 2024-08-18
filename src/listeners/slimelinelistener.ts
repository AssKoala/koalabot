import { DiscordMessageCreateListener } from "../api/DiscordMessageListener.js";
import { Message } from 'discord.js'
import { ListenerManager } from "../listenermanager.js"
import { DiscordBotRuntimeData } from '../api/DiscordBotRuntimeData.js'

class SlimelineListener implements DiscordMessageCreateListener {
    async onMessageCreate(runtimeData: DiscordBotRuntimeData, message: Message) {
        if (message.guildId == "1029187497068089385" && message.content.includes('@slimeline'))
        {
            // slimeline, skullone thing.  Refactor into its own file.
                //346696662619521026
                message.reply(`Hey <@346696662619521026>, ${message.author.username} wants you!`);
        }
    }
}

ListenerManager.registerMessageCreateListener(new SlimelineListener());
