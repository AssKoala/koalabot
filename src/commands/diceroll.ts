/*
    Diceroll
*/

import { SlashCommandBuilder, AttachmentBuilder, Utils } from 'discord.js';
import { getRandomValues } from 'node:crypto';
import { KoalaSlashCommandRequest } from '../koala-bot-interface/koala-slash-command.js';
import { PerformanceCounter } from '../performancecounter.js';

import { BasicCommand, DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js'

class DiceRollCommand extends DiscordBotCommand {
    
    async handle(interaction: any)
    {
        using perfCounter = PerformanceCounter.Create("handleDicerollCommand(): ");

        try {
            await interaction.deferReply();

            const slashCommandRequest = KoalaSlashCommandRequest.fromDiscordInteraction(interaction);

            const count = Math.min(Math.abs(slashCommandRequest.getOptionValueNumber('count', 1)), 16);
            let sides = slashCommandRequest.getOptionValueNumber('sides', 6);
            
            const randArray = new Uint32Array(count);
            getRandomValues(randArray);

            let total = 0;

            randArray.forEach(entry => {
                total += entry % sides;
            });

            let outputStr = `Got Total ${total} from ${count}xd${sides} with results:`;
            randArray.forEach(entry => {
                outputStr += ` ${entry%sides},`;
            });
            outputStr = outputStr.substring(0, outputStr.length - 1);

            await interaction.editReply(outputStr);
        } catch (e) {
            await this.runtimeData().logger().logErrorAsync(`Top level exception during dice roll, got error ${e}`, interaction, true);
        }

        
    }

    get()
    {
        const dicerollCommand = new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(`Roll Dice`)
            .addStringOption((option) =>
                option
                    .setName('count')
                    .setDescription('Number of die to roll')
                    .setRequired(false),
            )
            .addStringOption((option) =>
                option
                    .setName('sides')
                    .setDescription('Sides per Die')
                    .addChoices(
                        { name: 'd4', value: '4' },
                        { name: 'd6', value: '6' },
                        { name: 'd8', value: '8' },
                        { name: 'd10', value: '10' },
                        { name: 'd12', value: '12' },
                        { name: 'd20', value: '20' },
                    )
                    .setRequired(false),
            )
        ;

        return dicerollCommand;
    }
}

registerDiscordBotCommand(new DiceRollCommand('diceroll'), false);
