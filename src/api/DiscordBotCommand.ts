import { SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder, ChatInputCommandInteraction } from 'discord.js';
import { DiscordBotRuntimeData } from './DiscordBotRuntimeData.js';
import { Global } from '../global.js';

/**
 * Holds the common command information for all commands to be compatible with the DiscordBotCommand interface.
 * 
 * Commands should PROBABLY just extend this unless they have a good reason not to.
 */
export class BasicCommand {
    private _runtimeData: DiscordBotRuntimeData = null;
    runtimeData() {
        return this._runtimeData;
    }

    private readonly _name: string;
    name(): string {
        return this._name;
    }

    constructor(name: string) {
        this._name = name;
    }

    /**
     * This must be called before any command functionality can be used.
     * 
     * The initCommand is the "last step" of the constructor that creates
     * all the data for the current bot runtime.  This shouldn't generally 
     * be an issue, but be aware that you should call register immediately
     * after creation or create instances with the following paradigm to 
     * avoid any issues at runtime:
     * 
     *    registerDiscordBotCommand(new MyCommand('commandName'));
     * 
     * @param runtimeData instance information for the current runtime context
     */
    initCommand(runtimeData: DiscordBotRuntimeData) {
        this._runtimeData = runtimeData;
    }
}

/**
 * Interface for Discord bot commands.
 * 
 * Use is simple: 
 *  - create a class that implements both handle() and get()
 *  - call registerDiscordBotCommand with an instance of your class
 */
export abstract class DiscordBotCommand extends BasicCommand {
    abstract handle(interaction: ChatInputCommandInteraction): Promise<void>;
    abstract get(): SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
}

/**
 * Registers command with the Bot.  Includes registering slash commands, etc.
 * @param botCommand Command to register
 * @param shouldDeferReply If true, the Discord ChatInputCommandInteraction will be deferred before being sent to the handle() function.
 * @returns true on success, false otherwise.
 */
export function registerDiscordBotCommand(botCommand: DiscordBotCommand, shouldDeferReply: boolean = true): boolean {
    try {
        if (Global.bot().client().commands.has(botCommand.name())) {
            Global.logger().logError(`Cannot register ${botCommand.name()}, name is already registered!`);
            return false;
        } else {
            Global.logger().logDebug(`Registering ${botCommand.name()}, name is available.`);
         
            // Initialize the command with the runtime information, this has to go before ANY use of the object
            // The command isn't fully constructed as a Discord bot object until it's initialized.
            botCommand.initCommand(new DiscordBotRuntimeData(Global.bot(), Global.logger(), Global.settings()));

            const newCommand = {
                data: botCommand.get(),
                async execute(interaction: ChatInputCommandInteraction) {
                    if (shouldDeferReply) {
                        await interaction.deferReply();
                    }
    
                    await botCommand.handle(interaction);
                }
            }

            // Add the command to the command list
            Global.bot().client().commands.set(newCommand.data.name, newCommand);
            
            return true;
        }
    } catch (e) {
        Global.logger().logError(`Failed to registerDiscordBotCommand(${botCommand}, ${shouldDeferReply}), got error: ${e}`);
    }

    return false;
}