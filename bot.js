/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

	"Main" file for the bot that interfaces with discord's API.
*/

// Imports
import dotenv from "dotenv";
import { Common } from './common.js';

const fs = import('fs');
const path = import('path');
import { Client, Collection, Events, DataResolver, GatewayIntentBits } from 'discord.js';

// Command setup
import { sortDictData, getDictDataEntryCount } from './commands/dict.js';
import { registerCommands } from "./register-commands.js";

// Read in the environment configuration
dotenv.config();

/* Setup discord stuff */

// Create the client
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMembers,
	],
	autoreconnect: true,
});

// Store the commands in a new collection
client.commands = new Collection();
await registerCommands(client);	// Register all the commands in the client object

// Interaction command event
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	Common.logInfo(interaction);

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
});

/**
 * Informational log that we're started up
 */
client.on('ready', () => {
    Common.logInfo(`Logged in as ${client.user.tag}!`);
	Common.setDiscordClient(client);
	sortDictData();
	Common.logInfo(`Sorted ${getDictDataEntryCount()} dictionary items.`);
});

// Enable debug features
if (process.env.DEBUG_ENABLE == `true`)
{
	Common.logInfo("Enabling debug information");

	/**
	 * Debug messaging
	 */
	client.on('debug', Common.logDebug);
}
else
{
	Common.logInfo("Debugging information disabled");
}


/**
 * Respond to Discord messages
 */
client.on("messageCreate", (message) => {
	if (message.content.includes('@slimeline'))
	{
		// slimeline, skullone thing.  Refactor into its own file.
		//346696662619521026
		message.reply(`Hey <@346696662619521026>, ${message.author.username} wants you!`);
	}
	else 
	{
		Common.sendMessageToListeners(message);
	}

	if (message.author.bot && message.content.length == 0) return false;

	Common.logDiscordMessage(Common.getStandardDiscordMessageFormat(message));
});

/**
 * Error catching
 */
process.on('unhandledRejection', error => {
	console.error('Unhandled promise rejection:', error);
});

client.login( Common.getDiscordKey());
