import { DiscordMessageCreateListener } from "../api/discordmessagelistener.js";
import { Message } from 'discord.js'
import { ListenerManager } from "../listenermanager.js"
import { DiscordBotRuntimeData } from '../api/discordbotruntimedata.js'

import config from 'config';

class SlimelineListener implements DiscordMessageCreateListener {

    private responseList: ((message: Message) => void)[] = [];

    constructor() {
        if (config.has("TwoCpu.guildId")) {
            if (config.has("TwoCpu.skullUserId")) {
                this.responseList.push((message: Message) => {
                    if (message.guildId == config.get<string>("TwoCpu.guildId") && message.content.includes('@slimeline')) {
                        message.reply(`Hey <@${config.get<string>("TwoCpu.skullUserId")}>, ${message.author.username} wants you ╭∩╮( ͡° ͜ʖ ͡°)╭∩╮`);
                    }
                });
            }

            if (config.has("TwoCpu.chompsUserId")) {
                this.responseList.push((message: Message) => {
                    if (message.guildId == config.get<string>("TwoCpu.guildId") && message.content.includes('@chomps')) {
                        message.reply(`Hey <@${config.get<string>("TwoCpu.chompsUserId")}>, ${message.author.username} desires you (☞ ͡° ͜ʖ ͡°)☞`);
                    }
                });
            }
        }
    }

    async onDiscordMessageCreate(runtimeData: DiscordBotRuntimeData, message: Message) {
        if (message.author.bot) return;

        this.responseList.forEach((func) => {
            try {
                func(message);
            } catch (e) {
                runtimeData.logger().logError(`Failed to reply to lister, got ${e}`);
            }
        });
        
    }
}

ListenerManager.registerMessageCreateListener(new SlimelineListener());

