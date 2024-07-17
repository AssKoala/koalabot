/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

    Coinflip
*/

import { Global } from '../global.js';
import { SlashCommandBuilder, AttachmentBuilder, Utils } from 'discord.js';
import { getRandomValues } from 'node:crypto';

async function handleCoinflipCommand(interaction)
 {
    using perfCounter = Global.getPerformanceCounter(`handleCoinflipCommand(): `);

    try {
        await interaction.deferReply();

        let count = 1;
        let errorMsg = "";

        for (let i = 0; i < interaction.options.data.length; i++)
        {
            const name = interaction.options.data[i].name;
            const value = interaction.options.data[i].value;

            switch (name)
            {
                case 'count':
                    try {
                        count = Math.min(Math.abs(parseInt(value)), 16000);
                    } catch (e) {
                        errorMsg = "Nice try, don't know what you did, but you get 1 coin: ";
                    }
                    break;
                default:
                    break;
            }
        }

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

        await interaction.editReply(errorMsg + outputStr);
    } catch (e) {   
        await Global.logger().logError(`Top level exception during coin flip, got error ${e}`, interaction, true);
    }

    
}

function getCoinflipCommand()
{
    const coinflipCommand = new SlashCommandBuilder()
        .setName('coinflip')
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

function getCoinflipJSON()
{
    return getCoinflipCommand().toJSON();
}

function registerCoinflipCommand(client)
{
    const coinflip = 
    {
        data: getCoinflipCommand(),
        async execute(interaction) {
            await handleCoinflipCommand(interaction);
        }
    }

    client.commands.set(coinflip.data.name, coinflip);
}

Global.registerCommandModule(registerCoinflipCommand, getCoinflipJSON);
