import { DiscordReactionAddListener } from "../api/discordmessagelistener.js";
import { EmbedBuilder } from 'discord.js';
import { ListenerManager } from "../listenermanager.js"

class DeleteBotMessageReactionListener implements DiscordReactionAddListener {
    async onMessageReactionAdd(runtimeData, reaction, user) {
        // Ignore bot's reactions
		if (user.bot) return;

		// Check if the reaction is '❌' emoji and it's the bot's message
		if (reaction.emoji.name === '❌' && reaction.message.author.id === runtimeData.bot().client().user.id) {
			let username = '';

			try {
				const reactedUser = reaction.users.cache.every((entry) => {
					username = entry.globalName;
					return false;
				});
			} catch (e) {
				runtimeData.logger().logError(`Failed to react to user, got ${e}`);
			}

			try {
				// Delete the message
				await reaction.message.edit({ files: [], embeds: [new EmbedBuilder().setTitle(`Deleted by ${username}.`)] });
			} catch (e) {
				runtimeData.logger().logError(`Failed to delete the message, got ${e}`);
			}
		}
    }
}

ListenerManager.registerMessageReactionAddListener(new DeleteBotMessageReactionListener());
