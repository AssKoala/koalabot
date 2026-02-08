import { DiscordReactionAddListener } from "../api/discordmessagelistener.js";
import { EmbedBuilder } from 'discord.js';
import { ListenerManager } from "../listenermanager.js"
import { DiscordBotRuntimeData } from "../api/discordbotruntimedata.js";
import * as Discord from 'discord.js';

type ReactionType = Discord.MessageReaction | Discord.PartialMessageReaction;
type UserType = Discord.User | Discord.PartialUser;

class DeleteBotMessageReactionListener implements DiscordReactionAddListener {
    async onDiscordMessageReactionAdd(runtimeData: DiscordBotRuntimeData, reaction: ReactionType, user: UserType) {
        // Ignore bot's reactions
		if (user.bot) return;

		// Check if the reaction is '❌' emoji and it's the bot's message
		if (reaction.emoji.name === '❌' && reaction.message!.author!.id === runtimeData.bot().client().user!.id) {
			let username = '';

			try {
				const _reactedUser = reaction.users.cache.every((entry) => {
					username = entry.globalName!;
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
