/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

    Settings module, stores and manages user settings.
*/

import dotenv from "dotenv"
import { Global } from './../global.js'
import { SlashCommandBuilder } from 'discord.js';
import { BasicCommand, DiscordBotCommand, registerDiscordBotCommand } from "../api/DiscordBotCommand.js";

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
            let userData = Global.userSettings().get(interaction.user.username, true);

            if (userData) {
                if (userData.weatherSettings.location === "") {
                    await interaction.editReply(`Setting your location to ${newLocation}`);
                } else {
                    await interaction.editReply(`Setting your location to ${newLocation} from ${userData.weatherSettings.location}`);
                }
                
                userData.weatherSettings.location = newLocation;
                Global.userSettings().set(userData, true);
            } else {
                await interaction.editReply(`Failed to create user data, something has gone wrong, check the logs!`);
            }
        }
    } catch (e) {
        Global.logger().logError(`Failed to set user location, got ${e}`);
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
            Global.logger().logError(str);
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
                let userData = Global.userSettings().get(interaction.user.username, true);
                await interaction.editReply(`Setting your preferred units to ${preferred_units} from ${userData.weatherSettings.preferredUnits}`);
                userData.weatherSettings.preferredUnits = preferred_units;
                Global.userSettings().set(userData, true);
            }
        }
    } catch (e) {
        await Global.logger().logError(`Failed to set preferred units, got error ${e}`, interaction);
    }
}

/**
 * Prints the user's existing settings out, if they exist
 * @param {Discord.interaction} interaction - interaction to reply to
 */
async function getUserSettings(interaction)
{
    try {
        const userData = Global.userSettings().get(interaction.user.username);

        if (userData) {
            await interaction.editReply(`Your settings:\n`
                + `location: ${userData.weatherSettings.location}\n`
                + `preferred_units: ${userData.weatherSettings.preferredUnits}`
            );
        } else {
            await interaction.editReply(`LOL you don't have any options saved, loser.`);
        }
    } catch (e) {
        await Global.logger().logError(`Failed to get user settings, got ${e}`, interaction, true);
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
        await Global.logger().logError(e, interaction);
    }
}

class SettingsCommand extends DiscordBotCommand {
    async handle(interaction) {
        using perfCounter = Global.getPerformanceCounter("handleSettingsCommand(): ");

        try {
            await interaction.deferReply();

            if (interaction.options.data.length < 1) {
                const str = `Interaction data missing, got length: ${interaction.options.data.length}`;
                Global.logger().logError(str);
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
                    Global.logger().logError(`Failed to find response for settings command with subcommand(${interaction.options._subcommand})`);
                    break;
            }
        } catch (e) {
            await Global.logger().logError(`Failed to handle settings command, got error: ${e}`, interaction);
        }
    }

    get() {
        const settingsCommand = new SlashCommandBuilder()
                .setName(this.name())
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

        return settingsCommand;
    }
}

registerDiscordBotCommand(new SettingsCommand('settings'), false);