import { DiscordMessageCreateListener } from "../api/DiscordMessageListener.js";
import { Message } from 'discord.js'
import { ListenerManager } from "../listenermanager.js"
import { DiscordBotRuntimeData } from '../api/DiscordBotRuntimeData.js'

class SwankSwitchListener implements DiscordMessageCreateListener {
    private swankSwitchEnabled: boolean = false;

    async onMessageCreate(runtimeData: DiscordBotRuntimeData, message: Message) {
		if (message.author.bot) return;

        if (message.content.includes("TOGGLE SWANK SWITCH")) {
			if (message.author.id != process.env["SWANK_USER_ID"]) {
				this.swankSwitchEnabled = !this.swankSwitchEnabled;
				message.reply(`Swank switch is now ${this.swankSwitchEnabled}`);
			} else {
				message.reply(`Only literally every other user can toggle the switch`);
			}
		}

		if (this.swankSwitchEnabled 
            && message.author.id == process.env["SWANK_USER_ID"] 
            && message.channelId == process.env["TWOCPU_CHANNEL_ID"]) 
        {
			await message.reply("This user's messages have been flagged as highly likely to be incorrect and/or false.");
		}
    }
}

ListenerManager.registerMessageCreateListener(new SwankSwitchListener());
