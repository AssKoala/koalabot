/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

    Daily affirmations module
*/

import { Global } from '../global.js';
import { SlashCommandBuilder } from 'discord.js';

const affirmationData = await Global.readJsonFile(`${Global.settings().get("DATA_PATH")}/affirmations.json`);

function getAffirmationCount()
{
    try {
        return affirmationData.affirmations.length;
    } catch (e) {
        Global.logger().logError(`Failed to retrieve affirmation count, got ${e}`);
        return 0;
    }
}

/**
 * Retrieves a random affirmation from the affirmations.json file and replies it to the interaction
 * @param {*} interaction - Discord interaction
 */
async function handleAffirmationCommand(interaction) {
    using perfCounter = Global.getPerformanceCounter("handleAffirmationCommand(): ");

    try {
        const index = Math.floor(Math.random() * affirmationData.affirmations.length);
        await interaction.reply(`${affirmationData.affirmations[index].entry} by **${affirmationData.affirmations[index].author}**`);
    } catch (e) {
        Global.logger().logError(`Failed to get affirmation, got exception ${e}`, interaction);
    }

    
}

// discord affirmation command
const affirmationCommand = new SlashCommandBuilder()
        .setName('affirmation')
        .setDescription('Affirmations to get you through the day')
;

function registerAffirmationCommand(client)
{
    const affirmation = 
    {
        data: affirmationCommand,
        async execute(interaction) {
            await handleAffirmationCommand(interaction);
        }
    }

    client.commands.set(affirmation.data.name, affirmation);
}

function getAffirmationJSON()
{
    return affirmationCommand.toJSON();
}

Global.registerCommandModule(registerAffirmationCommand, getAffirmationJSON);

export { getAffirmationCount };
