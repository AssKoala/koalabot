/*
    Pillow module
*/

import { ChatInputCommandInteraction, SlashCommandOptionsOnlyBuilder, SlashCommandBuilder } from 'discord.js';
import { DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js'
import { PerformanceCounter } from '../performancecounter.js';

class PillowCommand extends DiscordBotCommand  {
    async handle(interaction: ChatInputCommandInteraction): Promise<void> {
        using perfCounter = PerformanceCounter.Create("handlePillowCommand(): ");

        try {
            await interaction.reply(`Thank you for yelling into the pillow.  This action helps everyone get through the day without toxicity.`);
        } catch (e) {
            this.runtimeData().logger().logErrorAsync(`Failed to yell into the pillow, got exception ${e}`, interaction);
        }
    }

    get(): SlashCommandOptionsOnlyBuilder {
        const pillowCommand = new SlashCommandBuilder()
                                            .setName(this.name())
                                            .setDescription('Yell into the pillow to get through the day')
                                            .addStringOption((option) =>
                                                option
                                                    .setName('statement')
                                                    .setDescription('Statement to yell into the pillow')
                                                    .setRequired(true),
                                            );

        return pillowCommand;
    }
}

const pillowCommand = new PillowCommand('pillow');
registerDiscordBotCommand(pillowCommand, false);
