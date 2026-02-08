/*
    Daily affirmations module
*/
import config from 'config';

import { ChatInputCommandInteraction, SlashCommandOptionsOnlyBuilder, SlashCommandBuilder } from 'discord.js';
import { DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js'
import { PerformanceCounter } from '../performancecounter.js';

interface AffirmationEntry {
    author: string;
    entry: string;
}

class AffirmationCommand extends DiscordBotCommand  {
    private affirmationData!: AffirmationEntry[];
    
    async loadData(affirmationFilePath: string) {
        this.affirmationData = await this.runtimeData().helpers().readJsonFile(affirmationFilePath) as AffirmationEntry[];
    }

    getAffirmationCount(): number {
        try {
            if (this.affirmationData) return this.affirmationData.length;
            else throw new Error("Affirmation data not loaded");
        } catch (e) {
            this.runtimeData().logger().logErrorAsync(`Failed to retrieve affirmation count, got ${e}`);
            return 0;
        }
    }

    async handle(interaction: ChatInputCommandInteraction): Promise<void> {
        using perfCounter = PerformanceCounter.Create("handleAffirmationCommand(): ");

        try {
            const index = Math.floor(Math.random() * this.affirmationData.length);
            await interaction.reply(`${this.affirmationData[index].entry} by **${this.affirmationData[index].author}**`);
        } catch (e) {
            this.runtimeData().logger().logErrorAsync(`Failed to get affirmation, got exception ${e}`, interaction);
        }
    }

    get(): SlashCommandOptionsOnlyBuilder {
        const affirmationCommand = new SlashCommandBuilder()
                                            .setName(this.name())
                                            .setDescription('Affirmations to get you through the day');

        return affirmationCommand;
    }
}

const affirmationCommand = new AffirmationCommand('affirmation');
registerDiscordBotCommand(affirmationCommand, false);
affirmationCommand.loadData(`${config.get("Global.dataPath")}/affirmations.json`);

// Used by system command
function getAffirmationCount() {
    return affirmationCommand.getAffirmationCount();
}

export { getAffirmationCount };
