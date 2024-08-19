/*
    Daily affirmations module
*/

import { ChatInputCommandInteraction, SlashCommandOptionsOnlyBuilder, SlashCommandBuilder } from 'discord.js';
import { BasicCommand, DiscordBotCommand, registerDiscordBotCommand } from '../api/DiscordBotCommand.js'

class AffirmationCommand extends DiscordBotCommand  {
    private affirmationData = null;
    
    async loadData(affirmationFilePath: string) {
        this.affirmationData = await this.runtimeData().helpers().readJsonFile(affirmationFilePath);
    }

    getAffirmationCount(): number {
        try {
            return this.affirmationData.length;
        } catch (e) {
            this.runtimeData().logger().logError(`Failed to retrieve affirmation count, got ${e}`);
            return 0;
        }
    }

    async handle(interaction: ChatInputCommandInteraction): Promise<void> {
        using perfCounter = this.runtimeData().getPerformanceCounter("handleAffirmationCommand(): ");

        try {
            const index = Math.floor(Math.random() * this.affirmationData.length);
            await interaction.reply(`${this.affirmationData[index].entry} by **${this.affirmationData[index].author}**`);
        } catch (e) {
            this.runtimeData().logger().logError(`Failed to get affirmation, got exception ${e}`, interaction);
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
affirmationCommand.loadData(`${affirmationCommand.runtimeData().settings().get("DATA_PATH")}/affirmations.json`);

// Used by system command
function getAffirmationCount() {
    return affirmationCommand.getAffirmationCount();
}

export { getAffirmationCount };
