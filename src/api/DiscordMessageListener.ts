import { DiscordBotRuntimeData } from '../api/DiscordBotRuntimeData.js'
import { Message, MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';

export interface DiscordMessageCreateListener {
    onMessageCreate(runtimeData: DiscordBotRuntimeData, message: Message): Promise<void>;
}

export interface DiscordReactionAddListener {
    onMessageReactionAdd(runtimeData: DiscordBotRuntimeData, reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void>;
}

export interface TrackedWord {
    word: string;           // human readable word
    matches: string[];      // list of regexes that match the word
}

export interface WordListener {
    onWordDetected(runtimeData: DiscordBotRuntimeData, word: TrackedWord, message: Message): Promise<void>;
}
