import dotenv from "dotenv";
import { Common } from './common.js';
dotenv.config();

async function importCommands()
{
    try {
        // Load the dynamically defined commands from the .env file
        var autoCommands = process.env.COMMAND_LIST.split(",");

        for (const command of autoCommands) 
        {
            const start = Common.startTiming(`importCommands::import(${command})`);

            const modulePath = `./commands/${command}.js`;

            try {
                await import(modulePath);
                Common.logInfo(`Successfully Loaded ${modulePath}`);
            }
            catch (e) {
                Common.logError(`Failed to load module ${modulePath}, got error ${e}`);
            }

            Common.endTiming(start);
        }
    } catch (e) {
        Common.logError(`Failed to import all commands, got error ${e}`);
    }
}

/**
 * 
 * @param {*} client 
 */
async function registerCommands(client) {
    const start = Common.startTiming("registerCommands(): ");

    if (!client) {
        Common.logError("Trying to register without a valid client");
    }

    try {
        await importCommands();

        // Register all the dynamic commands
        Common.registrationList.forEach(entry => entry['registrationFunc'](client));

    } catch (e) {
        Common.logError("Error registering commands, got: " + e);
    }

    Common.endTiming(start);
}

/**
 * 
 * @param {*} commands 
 */
function deployCommandsJSON(commands) {
    Common.registrationList.forEach(entry => commands.push(entry['jsonFunc']()));
}

export { registerCommands, deployCommandsJSON, importCommands }

