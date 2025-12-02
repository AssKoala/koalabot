import { readFile } from "fs/promises";
import { LoggerConcrete } from '../logging/logger.js'
import { ChatInputCommandInteraction } from 'discord.js'
import { PerformanceCounter } from "../performancecounter.js";

export class DiscordBotHelpers
{
    private logger: LoggerConcrete;
    constructor(logger: LoggerConcrete, enableTiming: boolean) {
        if (logger == null) {
            throw new Error("DiscordHelperFunctions class requires a valid Logger instance");
        }

        this.logger = logger;        

        if (enableTiming) {
            this._perfCounterFunction = this.getPerformanceCounterReal;
        } else {
            this._perfCounterFunction = function (){ return undefined; };
        }
    }

    public splitMessage(message: string, size = 2000): string | string[]
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
                interaction.editReply(splitMessage[0]);

                for (let i = 1; i < splitMessage.length; i++)
                {
                    if (interaction.channel == null) {
                        this.logger.logErrorAsync(`Failed to send split message, interaction channel is null`);
                        return;
                    } else if (!('send' in interaction.channel)) {
                        this.logger.logErrorAsync(`Failed to send split message, interaction channel lacks send method`);
                        return;
                    } else {
                        interaction.channel.send(splitMessage[i]);
                    }
                }
            } else {
                interaction.editReply(message);
            }
        } catch (e) {
            this.logger.logErrorAsync(`Failed to edit reply, got error ${e}`);
        }
    }

    async readJsonFile(path: string): Promise<any> {
        try {
            const file = await readFile(path, "utf8");
            return JSON.parse(file);
        } catch (e) {
            this.logger.logErrorAsync(`Failed to load ${path}, got ${e}`);
            return null;
        }
    }

    private _perfCounterFunction: (description: string) => PerformanceCounter | undefined;
    private getPerformanceCounterReal(description: string) {
        return new PerformanceCounter(description);
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
    getPerformanceCounter(description: string): PerformanceCounter | undefined {
        return this._perfCounterFunction(description);
    }
}
