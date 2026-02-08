import { PerformanceCounter } from './performancecounter.js';
import { getCommonLogger } from './logging/logmanager.js'
import { Bot } from './bot.js'
import { Client, REST, Routes } from 'discord.js';
import config from 'config';

import * as Discord from 'discord.js';

export abstract class CommandManager {

    static async importCommands() {
        using _perfCounter = PerformanceCounter.Create(`CommandManager::import()`);
        
        try {
            // Load the dynamically defined commands from the .env file
            const autoCommands = config.get<string>("Global.commandList").split(",");
            const commandPath = config.get<string>("Global.commandPath");

            for (const command of autoCommands) 
            {
                if (!command) {
                    getCommonLogger().logInfo("Skipping empty command definition");
                    continue;
                }

                using _importInd = PerformanceCounter.Create(`importCommands::import(${command})`);
    
                const modulePath = `./${commandPath}/${command}.js`;

                try {
                    await import(modulePath);
                    getCommonLogger().logInfo(`Successfully Loaded ${modulePath}, registering command`);
                }
                catch (e) {
                    getCommonLogger().logErrorAsync(`Failed to load module ${modulePath}, got error ${e}`);
                }
            }
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to import all commands, got error ${e}`);
        }
    }

    static async register(client: Client) {
        using _perfCounter = PerformanceCounter.Create("CommandManager::register(): ");

        if (!client) {
            getCommonLogger().logErrorAsync("Trying to register without a valid client");
        }
    
        try {
            await this.importCommands();    
        } catch (e) {
            getCommonLogger().logErrorAsync("Error registering commands, got: " + e);
        }
    }

    static getCommandsJSON(): Discord.RESTPostAPIChatInputApplicationCommandsJSONBody [] {
        const commands: Discord.RESTPostAPIChatInputApplicationCommandsJSONBody [] = [];
        Bot.get().client().commands.forEach(entry => {
            commands.push(entry.data.toJSON());
        })
        return commands;
    }

    static async deployDiscordSlashCommands(clearExisting:boolean = false, deployGuild:boolean = false, deployGlobal:boolean = false) {
        using perfCounter = PerformanceCounter.Create(`CommandManager::deployDiscordSlashCommands(${clearExisting}, ${deployGuild}, ${deployGlobal})`);

        try {
            // Discord information
            const clientId =  config.get<string>("Discord.appId");
            const guildIdList =  config.get<string>("Discord.guildIds").split(",");
            const token =  config.get<string>("Discord.token");

            // Our existing command list for this instance
            const commands = CommandManager.getCommandsJSON();

            // Discord REST module
            const rest = new REST({ version: '10' }).setToken(token);

            if (clearExisting) {
                if (deployGlobal) {
                    getCommonLogger().logInfo("Clearing Global Discord Commands");

                    try {
                        const _result = await rest.put(Routes.applicationCommands(clientId), { body: [] });
                        getCommonLogger().logInfo('Successfully deleted all Global application commands.');
                    } catch (e) {
                        getCommonLogger().logError(`Error clearing global commands: ${e}`);
                    }
                }

                if (deployGuild) {
                    // TODO: maybe wait on all rather than linearly waiting                    
                    guildIdList.forEach(async guildId => {
                        getCommonLogger().logInfo(`Clearing slash commands from guild: ${guildId}`);

                        try {
                            const _result = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
                            getCommonLogger().logInfo(`Successfully deleted all guild commands from guild: ${guildId}`);
                        } catch (e) {
                            getCommonLogger().logError(`Error clearing guild commands from guild ${guildId}: ${e}`);
                        }
                    });
                }
            }

            getCommonLogger().logInfo(`Started refreshing ${commands.length} application (/) commands.`);

            // Deploy commands globally
            if (deployGlobal) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data = <any> await rest.put(
                    Routes.applicationCommands(clientId),
                    { body: commands },
                );
        
                getCommonLogger().logInfo(`[GLOBAL] Successfully reloaded ${data.length} GLOBAL application (/) commands.`);
            }

            // Deploy guild commands
            if (deployGuild) {
                for (const guildId of guildIdList) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const data = <any> await rest.put(
                        Routes.applicationGuildCommands(clientId, guildId),
                        { body: commands },
                    );

                    getCommonLogger().logInfo(`[GUILD: ${guildId}] Successfully reloaded ${data.length} application (/) commands.`);
                }
            }
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to deploy commands, got error ${e}`);
        }
    }
}

