/*
    Coinflip
*/

import { KoalaSlashCommandRequest } from '../koala-bot-interface/koala-slash-command.js';
import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { getRandomValues } from 'node:crypto';
import { BasicCommand, DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js'

class CoinFlipCommand extends DiscordBotCommand {

    async handle(interaction: ChatInputCommandInteraction)
    {
        using perfCounter = this.runtimeData().getPerformanceCounter(`handleCoinflipCommand(): `);

        try {
            await interaction.deferReply();

            const slashCommandRequest = KoalaSlashCommandRequest.fromDiscordInteraction(interaction);

            const count = Math.min(Math.abs(slashCommandRequest.getOptionValueNumber('count', 1)), 16000);

            const randArray = new Uint32Array(count);
            getRandomValues(randArray);

            let total = 0;

            randArray.forEach(entry => {
                total += (entry % 2 == 0) ? -1 : 1;
            });

            let outputStr = "";
            let flips = (count > 1) ? "flips" : "flip";        

            if (total != 0) {
                let flipResult;

                if (total < 0) {
                    flipResult = 'Heads';
                }
                else { //if (total > 0) {
                    flipResult = 'Tails';
                }

                outputStr = `Got ${flipResult} after ${count} ${flips} with ${Math.abs(total)} more ${flipResult}`;
            } else {
                outputStr = `Got Side!? after ${count} ${flips} with equal heads and tails!`;
            }

            await interaction.editReply(outputStr);
        } catch (e) {   
            await this.runtimeData().logger().logErrorAsync(`Top level exception during coin flip, got error ${e}`, interaction, true);
        }
    } // handleCoinflipCommand

    get() {
        const coinflipCommand = new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(`Flip coin(s)`)
            .addStringOption((option) =>
                option
                    .setName('count')
                    .setDescription('Number of coins to flip')
                    .setRequired(false),
            )
        ;

        return coinflipCommand;
    }

}

registerDiscordBotCommand(new CoinFlipCommand('coinflip'), false);
