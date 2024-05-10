/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

    Settings module, stores and manages user settings.
*/

import dotenv from "dotenv"
import { Common } from './../common.js'
dotenv.config();

import { SlashCommandBuilder } from 'discord.js';

/**
 * Sets the user's location and saves it off
 * @param {Discord.interaction} interaction - Discord interaction to reply to
 */
async function setUserLocation(interaction)
{
    try {
        const newLocation = interaction.options.data[0].options[0].options[0].value;

        // If they didn't specify a location, let them know and bail
        if (newLocation == "")
        {
            await interaction.editReply('You gotta specify a location after set_location, buddy');
        } else {
            let userData = Common.getUserData(interaction.user.username, true);

            if (userData) {
                if (userData.weather_settings.location === "") {
                    await interaction.editReply(`Setting your location to ${newLocation}`);
                } else {
                    await interaction.editReply(`Setting your location to ${newLocation} from ${userData.weather_settings.location}`);
                }
                
                userData.weather_settings.location = newLocation;
                Common.setUserData(userData, true);
            } else {
                await interaction.editReply(`Failed to create user data, something has gone wrong, check the logs!`);
            }
        }
    } catch (e) {
        logError(`Failed to set user location, got ${e}`);
    }
    
}

/**
 * Sets the user's preferred temperature units and saves that to disk
 * @param {Discord.interaction} interaction - Discord interaction to reply to
 */
async function setPreferredUnits(interaction)
{
    try {
        // If no string exists, tell the user
        if (interaction.options.data[0].options.length < 1)
        {
            const str = 'Interaction did not contain unit data'
            Common.logError(str);
            await interaction.editReply(str);
        } else {
            // Assume the position element is the one we want
            const preferred_units = interaction.options.data[0].options[0].options[0].value;

            // Validate that it's a real set of units
            if (preferred_units !== 'celsius' && preferred_units !== 'fahrenheit'
                && preferred_units !== 'kelvin' && preferred_units !== 'rankine')
            {
                await interaction.editReply(`Maybe try using real units not whatever the hell ${preferred_units} is, friend`);
            } else {
                let userData = Common.getUserData(interaction.user.username, true);
                await interaction.editReply(`Setting your preferred units to ${preferred_units} from ${userData.weather_settings.preferred_units}`);
                userData.weather_settings.preferred_units = preferred_units;
                Common.setUserData(userData, true);
            }
        }
    } catch (e) {
        await Common.logError(`Failed to set preferred units, got error ${e}`, interaction);
    }
}

/**
 * Prints the user's existing settings out, if they exist
 * @param {Discord.interaction} interaction - interaction to reply to
 */
async function getUserSettings(interaction)
{
    try {
        const userData = Common.getUserData(interaction.user.username);

        if (userData) {
            await interaction.editReply(`Your settings:\n`
                + `location: ${userData.weather_settings.location}\n`
                + `preferred_units: ${userData.weather_settings.preferred_units}`
            );
        } else {
            await interaction.editReply(`LOL you don't have any options saved, loser.`);
        }
    } catch (e) {
        await Common.logError(`Failed to get user settings, got ${e}`, interaction, true);
    }
}

/**
 * Set the user settings using the interaction object
 * @param {Discord.interaction} interaction 
 */
async function setUserSettings(interaction)
{
    try {
        switch (interaction.options._subcommand) {
            case 'preferred_units':
                await setPreferredUnits(interaction);
                break;
            case 'location':
                await setUserLocation(interaction);
                break;
        }
    } catch (e) {
        await Common.logError(e, interaction);
    }
}

/**
 * Handles the /settings command
 * @returns nothing
 */
async function handleSettingsCommand(interaction) {
    const start = Common.startTiming("handleSettingsCommand(): ");

    try {
        await interaction.deferReply();

        if (interaction.options.data.length < 1) {
            const str = `Interaction data missing, got length: ${interaction.options.data.length}`;
            Common.logError(str);
            await interaction.editReply(str);
        }

        switch (interaction.options.data[0].name) {
            case 'get':
                await getUserSettings(interaction);
                break;
            case 'set':
                await setUserSettings(interaction);
                break;
            default:
                Common.logError(`Failed to find response for settings command with subcommand(${interaction.options._subcommand})`);
                break;
        }
    } catch (e) {
        await Common.logError(`Failed to handle settings command, got error: ${e}`, interaction);
    }

    Common.endTiming(start);
}

/**
 * settings command object
 */
const settingsCommand = new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Set/view user bot settings')
        // Set group
        .addSubcommandGroup((group) =>
            group
                .setName('set')
                .setDescription('Set user options')
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('location')
                        .setDescription('User location to use (e.g. Weston,FL or 33326')
                        .addStringOption((option) =>
                            option
                                .setName('location')
                                .setDescription('Location to set')
                                .setRequired(true),
                        )
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('preferred_units')
                        .setDescription('Preferred temperature units')
                        .addStringOption((option) =>
                            option
                                .setName('units')
                                .setDescription('Units to use')
                                .addChoices(
                                    { name: 'Kelvin', value: 'kelvin' },
                                    { name: 'Rankine', value: 'rankine' },
                                    { name: 'Fahrenheit', value: 'fahrenheit' },
                                    { name: 'Celsius', value: 'celsius' },
                                )
                                .setRequired(true),
                        )
                    )
        )
        // get command
        .addSubcommand(subcommand =>
            subcommand
                .setName('get')
                .setDescription('Retrieve your settings')
        )
;

/**
 * 
 * @param {Discord.Client} client 
 */
function registerSettingsCommand(client)
{
    const settings = 
    {
        data: settingsCommand,
        async execute(interaction) {
            await handleSettingsCommand(interaction);
        }
    }

    client.commands.set(settings.data.name, settings);
}

/**
 * 
 * @returns Retrieve the settings command as JSON
 */
function getSettingsJSON()
{
    return settingsCommand.toJSON();
}

 Common.registerCommandModule(registerSettingsCommand, getSettingsJSON);

export { registerSettingsCommand, getSettingsJSON }
