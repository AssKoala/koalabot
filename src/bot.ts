/*
	"Main" file for the bot that interfaces with discord's API.
*/

// Imports
import { Global } from './global.js';
import { 
	Client, Collection, Events, 
	GatewayIntentBits, Message, Interaction, PartialMessageReaction, 
	MessageReaction, TextChannel, User, PartialUser 
} from 'discord.js';

import fs from 'fs'

// Command setup
import { CommandManager } from "./commandmanager.js";

// Listener setup
import { ListenerManager } from "./listenermanager.js";

export class Bot {
	private _client: Client;
	client() { return this._client; }

	constructor() {
		this._client = null;
	}

	async init(discordKey: string) {
		this._client = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.GuildMessageReactions,
				GatewayIntentBits.MessageContent,
				GatewayIntentBits.GuildMembers,
			],
			autoReconnect: true,
		});

		// Enable debug features?
		if (Global.settings().get("DEBUG_ENABLE") == `true`)
		{
			Global.logger().logInfo("Enabling debug information");
		
			/**
			 * Debug messagingtsc
			 */
			this.client().on('debug', Global.logger().logDebug);
		}
		else
		{
			Global.logger().logInfo("Debugging information disabled");
		}

		// Register all the event listeners
		this.registerDiscordListeners();

		// Create commands collection based on convention
		this.client().commands = new Collection<any,any>();

		// Register all the slash commands
		await CommandManager.register(this.client());

		// Tell Discord about the slash commands
		await CommandManager.deployDiscordSlashCommands(
			Global.settings().get("DISCORD_CLEAR_SLASH_COMMANDS").toLowerCase() == "true", 
			Global.settings().get("DISCORD_DEPLOY_GUILD_SLASH_COMMANDS").toLowerCase() == "true", 
			Global.settings().get("DISCORD_DEPLOY_GLOBAL_SLASH_COMMANDS").toLowerCase() == "true");

		// Import all listeners
		await ListenerManager.importListeners();

		// Make the connection to Discord
		this.client().login(discordKey);
	}

	private registerDiscordListeners() {
		this.client().on(Events.ClientReady, () => this.onClientReady());
		this.client().on(Events.InteractionCreate, (intr: Interaction) => this.onInteractionCreate(intr));
		this.client().on(Events.MessageCreate, (message: Message) => this.onMessageCreate(message));
		this.client().on(Events.MessageReactionAdd, 
			(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => this.onMessageReactionAdd(reaction, user));
		
	}

	async onInteractionCreate(interaction: Interaction) {
		if (!interaction.isChatInputCommand()) return;
		
		Global.logger().logInfo(interaction.toString());
	
		const command = interaction.client.commands.get(interaction.commandName);
	
		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}
	
		try {
			await command.execute(interaction);
		} catch (error) {
			console.error(error);
			await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
		}
	}

	async onClientReady() {
		Global.logger().logInfo(`Logged in as ${this.client().user.tag}!`);

		try {
			const rebooted = this.hasRebooted();
			if (rebooted != null) {
				const textChannel = this._client.channels.cache.get(rebooted.channelId) as TextChannel;
				if (textChannel != null) {
					textChannel.send(`<@${rebooted.memberId}>: I haz rebooted via system`);
				}
			}
		} catch (e) {
			Global.logger().logWarning(`Failed to do reboot processing checks, error: ${e}`);
		}
	}

	async onMessageCreate(message: Message) {
		ListenerManager.processMessageCreateListeners(message);
	}

	async onMessageReactionAdd(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
		ListenerManager.processMessageReactionAddListeners(reaction, user);
	}

	private hasRebooted(clearStatus: boolean = true): { hasRebooted: boolean, memberId: string, channelId: string} {
		let hasRebooted = false;

		try {
			const data = fs.readFileSync(Global.settings().get("REBOOT_FILE"), 'utf8');
			const memberId = data.split(':')[0];
			const channelId = data.split(':')[1];
			hasRebooted = true;

			if (clearStatus) {
				fs.unlinkSync(Global.settings().get("REBOOT_FILE"));
			}

			return { hasRebooted, memberId, channelId };
		}
		catch (e) {
			Global.logger().logError(`Failed to check for reboot, got ${e}`);
		}

		return { hasRebooted, memberId: "", channelId: "" };
	}
}
