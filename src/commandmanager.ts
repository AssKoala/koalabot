import { PerformanceCounter } from './performancecounter.js';
import { getCommonLogger } from './logging/logmanager.js'
import { Bot } from './bot.js'
import { Client, REST, Routes } from 'discord.js';
import config from 'config';

export abstract class CommandManager {

    static async importCommands() {
        using _impComm = PerformanceCounter.Create(`CommandManager::import()`);
        
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
        using perfCounter = PerformanceCounter.Create("CommandManager::register(): ");

        if (!client) {
            getCommonLogger().logErrorAsync("Trying to register without a valid client");
        }
    
        try {
            await this.importCommands();    
        } catch (e) {
            getCommonLogger().logErrorAsync("Error registering commands, got: " + e);
        }
    }

    static getCommandsJSON(): string[] {
        let commands: string[] = [];
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

                    rest.put(Routes.applicationCommands(clientId), { body: [] })
                        .then(() => getCommonLogger().logInfo('Successfully deleted all Global application commands.'))
                        .catch(console.error);
                }

                if (deployGuild) {
                    guildIdList.forEach(guildId => {
                        getCommonLogger().logInfo(`Clearing slash commands from guild: ${guildId}`);

                        rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] })
                            .then(() => getCommonLogger().logInfo(`Successfully deleted all guild commands from guild: ${guildId}`))
                            .catch(console.error);
                    });
                }
            }

            getCommonLogger().logInfo(`Started refreshing ${commands.length} application (/) commands.`);

            // Deploy commands globally
            if (deployGlobal) {
                const data = <any> await rest.put(
                    Routes.applicationCommands(clientId),
                    { body: commands },
                );
        
                getCommonLogger().logInfo(`[GLOBAL] Successfully reloaded ${data.length} GLOBAL application (/) commands.`);
            }

            // Deploy guild commands
            if (deployGuild) {
                for (const guildId of guildIdList) {
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

