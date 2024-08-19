import { readFile } from "fs/promises";
import { Logger } from '../logging/logger.js'
import { ChatInputCommandInteraction } from 'discord.js'
import { PerformanceCounter } from "../performancecounter.js";

export class DiscordBotHelpers
{
    private logger: Logger;
    constructor(logger: Logger) {
        if (logger == null) {
            throw new Error("DiscordHelperFunctions class requires a valid Logger instance");
        }

        this.logger = logger;        
    }

    private splitMessage(message: string, size = 2000): string | string[]
    {
        if (message.length <= size)
        {
            return message;
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

    async editAndSplitReply(interaction: ChatInputCommandInteraction, message: string): Promise<void>
    {
        try {
            const splitMessage = this.splitMessage(message);
    
            if (Array.isArray(splitMessage)) {
                await interaction.editReply(`Message too long, split below`);

                for (let i = 0; i < splitMessage.length; i++)
                {
                    await interaction.channel.send(splitMessage[i]);
                }
            } else {
                await interaction.editReply(message);
            }
        } catch (e) {
            this.logger.logError(`Failed to edit reply, got error ${e}`);
        }
    }

    async readJsonFile(path: string): Promise<any> {
        try {
            const file = await readFile(path, "utf8");
            return JSON.parse(file);
        } catch (e) {
            this.logger.logError(`Failed to load ${path}, got ${e}`);
            return null;
        }
    }

    /**
     * Returns a disposable Performance Counter.
     * 
     * Use like this to add performance counters to your code:
     * 
     * // Block I want to time
     * {
     *    const perf = getPerformanceCounter();
     *    // ... Stuff ...
     * } // Counter will calculate time when leaving the block
     * 
     * @param description Performance counter name/description string, e.g. `space::foo::doThing(${someVar})`
     * @returns 
     */
    getPerformanceCounter(description: string): PerformanceCounter {
        return new PerformanceCounter(description);
    }
}
