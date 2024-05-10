/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

    Diceroll
*/

import { Common } from '../common.js';
import { SlashCommandBuilder, AttachmentBuilder, Utils } from 'discord.js';
import { getRandomValues } from 'node:crypto';

async function handleDicerollCommand(interaction)
{
    const start = Common.startTiming("handleDicerollCommand(): ");

    try {
        await interaction.deferReply();

        let count = 1;
        let sides = 6;
        let errorMsg = "";

        for (let i = 0; i < interaction.options.data.length; i++) {
            const name = interaction.options.data[i].name;
            const value = interaction.options.data[i].value;

            switch (name) {
                case 'count':
                    try {
                        count = Math.min(Math.abs(parseInt(value)), 16);
                    } catch (e) {
                        errorMsg = "Nice try, don't know what you did, but you get 1: ";
                    }
                    break;
                case 'sides':
                    sides = parseInt(value);
                default:
                    break;
            }
        }

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

        await interaction.editReply(errorMsg + outputStr);
    } catch (e) {
        await Common.logError(`Top level exception during dice roll, got error ${e}`, interaction, true);
    }

    Common.endTiming(start);
}

function getDicerollCommand()
{
    const dicerollCommand = new SlashCommandBuilder()
        .setName('diceroll')
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

function getDicerollJSON()
{
    return getDicerollCommand().toJSON();
}

function registerDicerollCommand(client)
{
    const diceroll = 
    {
        data: getDicerollCommand(),
        async execute(interaction) {
            await handleDicerollCommand(interaction);
        }
    }

    client.commands.set(diceroll.data.name, diceroll);
}

Common.registerCommandModule(registerDicerollCommand, getDicerollJSON);
