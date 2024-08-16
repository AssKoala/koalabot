/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

	"Main" file for the bot that interfaces with discord's API.
*/

// Imports
import { Global } from './global.js';
import { Logger } from './logging/logger.js';
import { 
	Client, Collection, Events, EmbedBuilder, 
	GatewayIntentBits, Message, Interaction, PartialMessageReaction, 
	MessageReaction, TextChannel, User, PartialUser 
} from 'discord.js';
import fs from 'fs'

// Command setup
import { CommandManager } from "./commandmanager.js";

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
					textChannel.send(`<@${rebooted.memberId}>: https://www.asskoala.duckdns.org/bot/resurrection.gif`);
				}
			}
		} catch (e) {
			Global.logger().logWarning(`Failed to do reboot processing checks, error: ${e}`);
		}
	}

	private swankSwitchEnabled: boolean = false;

	async onMessageCreate(message: Message) {
		/ * Swank switch */
		if (message.content.includes("TOGGLE SWANK SWITCH")) {
			if (message.author.id != "914567674602856508") {
				this.swankSwitchEnabled = !this.swankSwitchEnabled;
				message.reply(`Swank switch is now ${this.swankSwitchEnabled}`);
			} else {
				message.reply(`Only literally every other user can toggle the switch`);
			}
		}

		if (this.swankSwitchEnabled && message.author.id == "914567674602856508" && message.channelId == "1172663840215945278") {
			await message.reply("This user's messages have been flagged as highly likely to be incorrect and/or false.");
		}
		/ * Swank switch */

		if (message.content.includes('@slimeline'))
		{
			// slimeline, skullone thing.  Refactor into its own file.
				//346696662619521026
				message.reply(`Hey <@346696662619521026>, ${message.author.username} wants you!`);
		}
		else 
		{
			this.sendMessageToListeners(message);
		}
	
		if (message.author.bot && message.content.length == 0) return;
	
		Global.logger().logDiscordMessage(Logger.getStandardDiscordMessageFormat(message));
	}

	async onMessageReactionAdd(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
		// Ignore bot's reactions
		if (user.bot) return;

		// Check if the reaction is '❌' emoji and it's the bot's message
		if (reaction.emoji.name === '❌' && reaction.message.author.id === this.client().user.id) {
			let username = '';

			try {
				const reactedUser = reaction.users.cache.every((entry) => {
					username = entry.globalName;
					return false;
				});
			} catch (e) {
				Global.logger().logError(`Failed to react to user, got ${e}`);
			}

			try {
				// Delete the message
				await reaction.message.edit({ files: [], embeds: [new EmbedBuilder().setTitle(`Deleted by ${username}.`)] });
			} catch (e) {
				Global.logger().logError(`Failed to delete the message, got ${e}`);
			}
		}
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

	private listenerList = [];

	registerMessageListener(listen_func) {
        this.listenerList.push(listen_func);
    }

	private sendMessageToListeners(message: Message) {
        this.listenerList.forEach(listener_func => {
            try {
                listener_func(message);
            } catch (e) {
                Global.logger().logError(`Failed to send message to ${listener_func}, got ${e}`);
            }
        });
    }    
}
