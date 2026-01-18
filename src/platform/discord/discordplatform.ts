import { getCommonLogger } from '../../logging/logmanager.js';
import * as Discord from 'discord.js'

export class DiscordPlatform {
    public static splitMessage(message: string, size = 2000): string[] {
        if (message.length <= size)
        {
            return [message];
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

    static async editAndSplitReply(interaction: Discord.ChatInputCommandInteraction, message: string)
    {
        try {
            const splitMessage = this.splitMessage(message);
    
            interaction.editReply(splitMessage[0]);

            for (let i = 1; i < splitMessage.length; i++)
            {
                if ('send' in interaction.channel!) {
                    interaction.channel!.send(splitMessage[i]);
                }
            }
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to edit reply, got error ${e}`);
        }
    }

}