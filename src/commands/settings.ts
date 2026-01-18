/*
    Settings module, stores and manages user settings.
*/

import dotenv from "dotenv"
import { SlashCommandBuilder } from 'discord.js';
import { BasicCommand, DiscordBotCommand, registerDiscordBotCommand } from "../api/discordbotcommand.js";
import { getCommonLogger } from '../logging/logmanager.js'
import { PerformanceCounter } from "../performancecounter.js";
import { UserSettingsManager } from "../app/user/usersettingsmanager.js";
import { GetKoalaBotSystem } from '../api/koalabotsystem.js';
import * as Discord from 'discord.js';
import config from 'config';

/**
 * Sets the user's location and saves it off
 * @param {Discord.interaction} interaction - Discord interaction to reply to
 */
// @ts-ignore
async function setUserLocation(interaction)
{
    try {
        const newLocation = interaction.options.data[0].options[0].options[0].value;

        // If they didn't specify a location, let them know and bail
        if (newLocation == "")
        {
            await interaction.editReply('You gotta specify a location after set_location, buddy');
        } else {
            let userData = UserSettingsManager.get().get(interaction.user.username);

            if (userData) {
                if (userData.weatherSettings.location === "") {
                    await interaction.editReply(`Setting your location to ${newLocation}`);
                } else {
                    await interaction.editReply(`Setting your location to ${newLocation} from ${userData.weatherSettings.location}`);
                }
                
                userData.weatherSettings.location = newLocation;
                UserSettingsManager.get().set(userData, true);
            } else {
                await interaction.editReply(`Failed to create user data, something has gone wrong, check the logs!`);
            }
        }
    } catch (e) {
        getCommonLogger().logErrorAsync(`Failed to set user location, got ${e}`);
    }
    
}

/**
 * Sets the user's preferred temperature units and saves that to disk
 * @param {Discord.interaction} interaction - Discord interaction to reply to
 */
// @ts-ignore
async function setPreferredUnits(interaction)
{
    try {
        // If no string exists, tell the user
        if (interaction.options.data[0].options.length < 1)
        {
            const str = 'Interaction did not contain unit data'
            getCommonLogger().logErrorAsync(str);
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
                let userData = UserSettingsManager.get().get(interaction.user.username);
                await interaction.editReply(`Setting your preferred units to ${preferred_units} from ${userData.weatherSettings.preferredUnits}`);
                userData.weatherSettings.preferredUnits = preferred_units;
                UserSettingsManager.get().set(userData, true);
            }
        }
    } catch (e) {
        await getCommonLogger().logErrorAsync(`Failed to set preferred units, got error ${e}`, interaction);
    }
}

async function setPreferredAiModel(interaction: Discord.ChatInputCommandInteraction)
{
    try {
        const aiModel = interaction!.options!.data![0]!.options![0]!.options![0]!.value! as string;

        let userData = UserSettingsManager.get().get(interaction.user.username);
        await interaction.editReply(`Setting your preferred AI model to ${aiModel} from ${userData.chatSettings.preferredAiModel}`);
        userData.chatSettings.preferredAiModel = aiModel;
        UserSettingsManager.get().set(userData, true);
    } catch (e) {
        await getCommonLogger().logErrorAsync(`Failed to set preferred AI model, got error ${e}`, interaction);
    }
}

async function setCustomAiPrompt(interaction: Discord.ChatInputCommandInteraction)
{
    try {
        const customPrompt = interaction!.options!.data![0]!.options![0]!.options![0]!.value! as string;
        const customUsername = interaction!.options!.data![0]!.options![0]!.options![1]?.value! as string | undefined;
        let userToLoad = interaction.user.username;

        // If they are trying to set a different user's prompt, make sure they are sudo
        if (customUsername && customUsername !== interaction.user.username) {
            const sudoList = config.get<string>('Global.sudoList').split(',').map(id => id.trim());
            if (!sudoList.includes(interaction.user.id)) {
                await interaction.editReply(`${interaction.user.username} is not in the Global.sudoList. This incident will be reported.`);
                return;
            }

            if (UserSettingsManager.get().has(customUsername) === false) {
                await interaction.editReply(`User *${customUsername}* doesn't exist, cannot set custom prompt for them.`);
                return;
            }

            userToLoad = customUsername;
        }

        let userData = UserSettingsManager.get().get(userToLoad);
        await interaction.editReply(`**Setting *${userToLoad}*'s custom AI prompt to** *${customPrompt}* **from** *${userData.chatSettings.customPrompt}*`);
        userData.chatSettings.customPrompt = customPrompt;
        UserSettingsManager.get().set(userData, true);
    } catch (e) {
        await getCommonLogger().logErrorAsync(`Failed to set custom AI prompt, got error ${e}`, interaction);
    }
}

/**
 * Prints the user's existing settings out, if they exist
 * @param {Discord.interaction} interaction - interaction to reply to
 */
// @ts-ignore
async function getUserSettings(interaction)
{
    try {
        let userNameToGet;
        
        if (interaction.options._subcommand === 'yours') {
            userNameToGet = interaction.user.username;
        } else if (interaction.options._subcommand === 'someones') {
            userNameToGet = interaction.options.data[0].options[0].options[0].value;

            if (!UserSettingsManager.get().has(userNameToGet)) {
                await interaction.editReply(`User *${userNameToGet}* doesn't exist, cannot get their settings.`);
                return;
            }
        } else {
            await interaction.editReply(`Interaction did not contain valid subcommand: ${interaction.options._subcommand}`);
            return;
        }
        const userData = UserSettingsManager.get().get(userNameToGet);

        const preferredUnits = userData.weatherSettings.preferredUnits.charAt(0).toUpperCase() 
                                + userData.weatherSettings.preferredUnits.slice(1);

        await interaction.editReply(`${userNameToGet}'s settings:\n`
            + `* **Location**: ${userData.weatherSettings.location}\n`
            + `* **Preferred Units**: ${preferredUnits}\n`
            + `* **Preferred Ai Model**: ${userData.chatSettings.preferredAiModel}\n`
            + `  * **Available models**: ${config.get<string>('Chat.AiModels.enabledModels')}\n`
            + `  * **Default model**: ${config.get<string>('Chat.aiModel')}\n`
            + `* **Custom Prompt**: ${userData.chatSettings.customPrompt}\n`
            + `  * **Default Prompt**: ${config.get<string>('Chat.systemPrompt')}`
        );
    } catch (e) {
        await getCommonLogger().logErrorAsync(`getUserSettings(): Failed to get user settings, got ${e}`, interaction, true);
    }
}

/**
 * Set the user settings using the interaction object
 * @param {Discord.interaction} interaction 
 */
// @ts-ignore
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
            case 'preferred_ai_model':
                await setPreferredAiModel(interaction);
                break;
            case 'custom_prompt':
                await setCustomAiPrompt(interaction);
                break;
            default:
                getCommonLogger().logErrorAsync(`Failed to find response for settings set subcommand(${interaction.options._subcommand})`, interaction);
                break;
        }
    } catch (e) {
        // @ts-ignore
        await getCommonLogger().logErrorAsync(e, interaction);
    }
}

class SettingsCommand extends DiscordBotCommand {
    // @ts-ignore
    async handle(interaction) {
        using perfCounter = PerformanceCounter.Create("handleSettingsCommand(): ");

        try {
            await interaction.deferReply();

            if (interaction.options.data.length < 1) {
                const str = `Interaction data missing, got length: ${interaction.options.data.length}`;
                getCommonLogger().logErrorAsync(str);
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
                    getCommonLogger().logErrorAsync(`Failed to find response for settings command with subcommand(${interaction.options._subcommand})`);
                    break;
            }
        } catch (e) {
            await getCommonLogger().logErrorAsync(`Failed to handle settings command, got error: ${e}`, interaction);
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
                        .addSubcommand((subcommand) =>
                            subcommand
                                .setName('preferred_ai_model')
                                .setDescription('Preferred AI model')
                                .addStringOption((option) =>
                                    option
                                        .setName('preferred_ai_model')
                                        .setDescription(`Ai Model (${config.get<string>('Chat.AiModels.enabledModels')})`)
                                        .setRequired(true),
                                )
                        )
                        .addSubcommand((subcommand) =>
                            subcommand
                                .setName('custom_prompt')
                                .setDescription('Custom AI prompt to use (e.g. You are a helpful assistant...)')
                                .addStringOption((option) =>
                                    option
                                        .setName('custom_prompt')
                                        .setDescription('Custom AI prompt to use (e.g. You are a helpful assistant...)')
                                        .setRequired(true),
                                )
                                .addStringOption((option) =>
                                    option
                                        .setName('username')
                                        .setDescription('[SUDO REQUIRED] Username to set for')
                                )
                        )
                )
                // get command
                .addSubcommandGroup((group) =>
                    group
                        .setName('get')
                        .setDescription('Get options')
                        .addSubcommand((subcommand) =>
                            subcommand
                                .setName('yours')
                                .setDescription('Get your settings')
                        )
                        .addSubcommand((subcommand) =>
                            subcommand
                                .setName('someones')
                                .setDescription('Get someone else\'s settings')
                                .addStringOption((option) =>
                                    option
                                        .setName('username')
                                        .setDescription('Username to get settings for.  Empty for self.')
                                        .setRequired(true),
                                )
                        )
                        
                )
        ;

        return settingsCommand;
    }
}

registerDiscordBotCommand(new SettingsCommand('settings'), false);