import { Global } from './global.js';
import { Client, REST, Routes } from 'discord.js';

export abstract class CommandManager {

    static async importCommands() {
        try {
            // Load the dynamically defined commands from the .env file
            const autoCommands = Global.settings().get("COMMAND_LIST").split(",");
            const commandPath = Global.settings().get("COMMAND_PATH");

            for (const command of autoCommands) 
            {
                if (!command) {
                    Global.logger().logInfo("Skipping empty command definition");
                    continue;
                }

                using perfCounter = Global.getPerformanceCounter(`importCommands::import(${command})`);
    
                const modulePath = `./${commandPath}/${command}.js`;

                try {
                    await import(modulePath);
                    Global.logger().logInfo(`Successfully Loaded ${modulePath}, registering command`);
                }
                catch (e) {
                    Global.logger().logError(`Failed to load module ${modulePath}, got error ${e}`);
                }
            }
        } catch (e) {
            Global.logger().logError(`Failed to import all commands, got error ${e}`);
        }
    }

    static async register(client: Client) {
        using perfCounter = Global.getPerformanceCounter("registerCommands(): ");

        if (!client) {
            Global.logger().logError("Trying to register without a valid client");
        }
    
        try {
            await this.importCommands();    
        } catch (e) {
            Global.logger().logError("Error registering commands, got: " + e);
        }
    }

    static getCommandsJSON(): string[] {
        let commands: string[] = [];
        Global.bot().client().commands.forEach(entry => {
            commands.push(entry.data.toJSON());
        })
        return commands;
    }

    static async deployDiscordSlashCommands(clearExisting:boolean = false, deployGuild:boolean = false, deployGlobal:boolean = false) {
        using perfCounter = Global.getPerformanceCounter(`CommandManager::deployDiscordSlashCommands(${clearExisting}, ${deployGuild}, ${deployGlobal})`);

        try {
            // Discord information
            const clientId =  Global.settings().getDiscordAppId();
            const guildIdList =  Global.settings().getDiscordGuildIdList();
            const token =  Global.settings().getDiscordKey();

            // Our existing command list for this instance
            const commands = CommandManager.getCommandsJSON();

            // Discord REST module
            const rest = new REST({ version: '10' }).setToken(token);

            if (clearExisting) {
                if (deployGlobal) {
                    Global.logger().logInfo("Clearing Global Discord Commands");

                    rest.put(Routes.applicationCommands(clientId), { body: [] })
                        .then(() => Global.logger().logInfo('Successfully deleted all Global application commands.'))
                        .catch(console.error);
                }

                if (deployGuild) {
                    guildIdList.forEach(guildId => {
                        Global.logger().logInfo(`Clearing slash commands from guild: ${guildId}`);

                        rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] })
                            .then(() => Global.logger().logInfo(`Successfully deleted all guild commands from guild: ${guildId}`))
                            .catch(console.error);
                    });
                }
            }

            Global.logger().logInfo(`Started refreshing ${commands.length} application (/) commands.`);

            // Deploy commands globally
            if (deployGlobal) {
                const data = <any> await rest.put(
                    Routes.applicationCommands(clientId),
                    { body: commands },
                );
        
                Global.logger().logInfo(`[GLOBAL] Successfully reloaded ${data.length} GLOBAL application (/) commands.`);
            }

            // Deploy guild commands
            if (deployGuild) {
                for (const guildId of guildIdList) {
                    const data = <any> await rest.put(
                        Routes.applicationGuildCommands(clientId, guildId),
                        { body: commands },
                    );

                    Global.logger().logInfo(`[GUILD: ${guildId}] Successfully reloaded ${data.length} application (/) commands.`);
                }
            }
        } catch (e) {
            Global.logger().logError(`Failed to deploy commands, got error ${e}`);
        }
    }
}

