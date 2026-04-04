import { getCommonLogger } from '../../logging/logmanager.js';
import * as Discord from 'discord.js'
import config from 'config';

/*
    Automatically send typing indicator while in the scope and continue to do so until all operations are complete.
*/
export class AutoTyper implements Disposable {
    private readonly channel: Discord.Channel;
    private typingInterval: NodeJS.Timeout | null;

    constructor(channel: Discord.Channel, typingIntervalMs: number = 5000, maxTypingTimeMs: number = config.get<number>("Discord.maxTypingTimeMs")) {
        this.channel = channel;
        this.sendTyping();
        
        let iteration = 0;
        const maxIntervals = Math.ceil(maxTypingTimeMs / typingIntervalMs);

        this.typingInterval = setInterval(() => {
            if (iteration >= maxIntervals) {
                clearInterval(this.typingInterval!);
                this.typingInterval = null; // Clear the interval and set to null to indicate it's no longer active
                getCommonLogger().logWarning("AutoTyper(): Max typing time reached, stopping typing indicator to prevent infinite loop.");
                return;
            }
            this.sendTyping();
            iteration++;
        }, typingIntervalMs);
    }

    [Symbol.dispose](): void {
        if (this.typingInterval) {
            clearInterval(this.typingInterval);
        }
    }

    public sendTyping() {
        try {
            if (this.channel && 'sendTyping' in this.channel) {
                this.channel.sendTyping();
            }
            getCommonLogger().logDebug("AutoTyper(): Sent typing indicator");
        } catch (e) {
            getCommonLogger().logError(`AutoTyper(): Failed to get channel to send typing indicator, got: ${e}`);
        }
    }
}

// Discord platform utility functions
export class DiscordPlatform {
    // Split message based on some size limit
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

    // Split the message up and send as multiple with one being a reply to the original interaction
    public static async editAndSplitReply(interaction: Discord.ChatInputCommandInteraction, message: string)
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

    // Create an AutoTyper object for the given channel
    public static createTypingObject(channel: Discord.Channel) {
        return new AutoTyper(channel);
    }
}