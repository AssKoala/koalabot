import { DiscordBotRuntimeData } from '../api/DiscordBotRuntimeData.js'
import { Message, MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';

export interface DiscordMessageCreateListener {
    onMessageCreate(runtimeData: DiscordBotRuntimeData, message: Message): Promise<void>;
}

export interface DiscordReactionAddListener {
    onMessageReactionAdd(runtimeData: DiscordBotRuntimeData, reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void>;
}
