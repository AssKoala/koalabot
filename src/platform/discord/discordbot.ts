//import { LogManager } from '../../logging/logmanager.js'
import { Logger } from '../../api/koalabotsystem.js'
import { ListenerManager } from "../../listenermanager.js";
import { PerformanceCounter } from '../../performancecounter.js';
import * as Discord from 'discord.js'
import config from 'config';

export interface DiscordClientCommandType {
    data: Discord.SlashCommandOptionsOnlyBuilder | Discord.SlashCommandSubcommandsOnlyBuilder;
    execute: (interaction: Discord.ChatInputCommandInteraction) => Promise<void>;
}

// Handles Discord platform functionality
export class DiscordBot {
    private _client?: Discord.Client = undefined;
    client() { return this._client!; }

    private logger: Logger;

    constructor(logger: Logger) {
        // Init must still be called
        this.logger = logger;
    }

    async init() {
        this._client = new Discord.Client({
			intents: [
				Discord.GatewayIntentBits.Guilds,
				Discord.GatewayIntentBits.GuildMessages,
				Discord.GatewayIntentBits.GuildMessageReactions,
				Discord.GatewayIntentBits.MessageContent,
				Discord.GatewayIntentBits.GuildMembers,
			],
			autoReconnect: true,
		});

        // Enable debug features?
		if (config.get<string>("Developer.debugEnable"))
		{
			this.logger.logInfo("Enabling debug information");
			this.client().on('debug', this.logger.logDebug);
		}
		else
		{
			this.logger.logInfo("Debugging information disabled");
		}

        this.client().on(Discord.Events.ClientReady, () => this.onClientReady());
            this.client().on(Discord.Events.InteractionCreate, (intr: Discord.Interaction) => this.onInteractionCreate(intr));
            this.client().on(Discord.Events.MessageCreate, (message: Discord.Message) => this.onMessageCreate(message));
            this.client().on(Discord.Events.MessageReactionAdd, 
                (reaction: Discord.MessageReaction | Discord.PartialMessageReaction, user: Discord.User | Discord.PartialUser) => this.onMessageReactionAdd(reaction, user));

        // Create commands collection based on convention
        this.client().commands = new Discord.Collection<string, DiscordClientCommandType>();
    }

    async onClientReady() {
        this.logger.logInfo(`Logged in as ${this.client().user!.tag}!`);
    }

    async onInteractionCreate(interaction: Discord.Interaction) {
        if (!interaction.isChatInputCommand()) {
            this.logger.logInfo("Received non-command interaction, ignoring");
            return;
        }
        
        using perfCounter = PerformanceCounter.Create(`DiscordBot::onInteractionCreate(), command: ${interaction.commandName}`, performance.now(), this.logger, true);
        
        this.logger.logInfo(interaction.toString());
    
        const command = interaction.client.commands.get(interaction.commandName);
    
        if (!command) {
            this.logger.logError(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            this.logger.logError(`Failed to execute comman, got error: ${error}`);
            await interaction.reply(
                { 
                    content: 'There was an error while executing this command!', 
                    flags:   Discord.MessageFlags.Ephemeral 
                });
        }
    }

    async onMessageCreate(message: Discord.Message) {
		ListenerManager.processMessageCreateListeners(message);
	}

	async onMessageReactionAdd(reaction: Discord.MessageReaction | Discord.PartialMessageReaction, user: Discord.User | Discord.PartialUser) {
		ListenerManager.processMessageReactionAddListeners(reaction, user);
	}
}