import { LLMInteractionMessage } from "../llminteractionmessage.js";
import * as Discord from "discord.js";
import config from "config";
import { KoalaSlashCommandRequest } from "../../koala-bot-interface/koala-slash-command.js";

export class DiscordInteractionMessageImplDiscordMessage implements LLMInteractionMessage {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply(content: any): Promise<any> {
        return this.getInternalData().reply(content);
    }

    getInternalData() {
        return this.internalData;
    }

    getChannelId(): string {
        return this.getInternalData().channelId;
    }

    getGuildId(): string {
        return this.getInternalData().guildId ?? "";
    }

    getUserId(): string {
        return this.getInternalData().author.id;
    }

    getUserName(): string {
        return this.getInternalData().author.username;
    }

    getSystemPrompt(): string {
        return config.get("Chat.systemPrompt");
    }

    getQuestion(): string {
        return this.getInternalData().content;
    }

    getMaxTokens(): number {
        return parseInt(config.get("Chat.maxTokenCount"));
    }

    getAiModel(): string {
        return config.get("Chat.aiModel");
    }

    getMaxMessages(): number {
        return parseInt(config.get("Chat.maxMessages"));
    }

    getResponsePrefix(): string {
        return "";
    }

    // Internal data representation
    private internalData: Discord.Message;

    constructor(message: Discord.Message) {
        this.internalData = message;
    }
}

export class DiscordInteractionMessageImplDiscordChatInputCommandInteraction implements LLMInteractionMessage {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply(content: any): Promise<any> {
        return this.getInternalData().editReply(content);
    }    

    getInternalData() {
        return this.slashCommandRequest.platformData;
    }

    getChannelId(): string {
        return this.slashCommandRequest.getOptionValueString("override_channel_id", this.getInternalData().channelId);
    }

    getGuildId(): string {
        return this.getInternalData().guildId ?? "";
    }

    getUserId(): string {
        return this.getInternalData().member!.user.id;
    }

    getUserName(): string {
        return this.getInternalData().member!.user.username;
    }

    getSystemPrompt(): string {
        return this.slashCommandRequest.getOptionValueString('ai_prompt', config.get("Chat.systemPrompt"))
    }

    getQuestion(): string {
        return `${this.getUserName()}: ${this.slashCommandRequest.getOptionValueString('response')}`;
    }

    getMaxTokens(): number {
        return this.slashCommandRequest.getOptionValueNumber('token_count', parseInt(config.get("Chat.maxTokenCount")));
    }

    getAiModel(): string {
        return this.slashCommandRequest.getOptionValueString('ai_model', config.get("Chat.aiModel"));
    }

    getMaxMessages(): number {
        return parseInt(config.get("Chat.maxMessages"));
    }

    getResponsePrefix(): string {
        return `Query "${this.getQuestion()}":`;
    }

    // Internal data representation
    private readonly slashCommandRequest: KoalaSlashCommandRequest;

    constructor(message: Discord.ChatInputCommandInteraction) {
        this.slashCommandRequest = KoalaSlashCommandRequest.fromDiscordInteraction(message);
    }
}