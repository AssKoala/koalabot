import * as DiscordInteractionMessages from './interactionmessages/discordinteractionmessageimpl.js';
import * as Discord from 'discord.js';

export interface LLMInteractionMessage {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getInternalData(): any; // Use of this function is intentionally platform specific so any needs to converted to the instance type
    
    getChannelId(): string;
    getGuildId(): string;
    getUserId(): string;
    getUserName(): string;
    getSystemPrompt(): string;
    getQuestion(): string;
    getMaxTokens(): number;
    getAiModel(): string;
    getMaxMessages(): number;
    getResponsePrefix(): string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply(_content: any): Promise<any>; // replies can have platform specific behaviors
}

export class LLMInteractionMessageFactory {
    public static createFromDiscordMessage(message: Discord.Message): LLMInteractionMessage {
        return new DiscordInteractionMessages.DiscordInteractionMessageImplDiscordMessage(message);
    }

    public static createFromDiscordChatInputCommandInteraction(interaction: Discord.ChatInputCommandInteraction): LLMInteractionMessage {
        return new DiscordInteractionMessages.DiscordInteractionMessageImplDiscordChatInputCommandInteraction(interaction);
    }
}
