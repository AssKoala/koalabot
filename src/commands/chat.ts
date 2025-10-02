/*
    AI chatbot functionality
*/

import { KoalaSlashCommandRequest } from '../koala-bot-interface/koala-slash-command.js';

import * as Discord from 'discord.js';
import { AttachmentBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandBuilder, ChatInputCommandInteraction, Message } from 'discord.js';
import { Stenographer, DiscordStenographerMessage } from '../helpers/discordstenographer.js';
import { DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js'
import { DiscordBotRuntimeData } from '../api/discordbotruntimedata.js'

// Import all the modules we support (TODO make it a config)
import { OpenAiCompletionsV1Compatible } from '../helpers/llm/openai_completions_v1.js';
import { OpenAIResponsesV1Compatible, OpenAIResponsesV1CompatibleResponse } from '../helpers/llm/openai_responses_v1.js';
import "../helpers/llm/anthropic_completions.js";
import "../helpers/llm/grok_completions.js";
import "../helpers/llm/ollama_completions.js";
import "../helpers/llm/openai_completions_v1.js";
import "../helpers/llm/openai_completions_v1_impl.js";
import "../helpers/llm/openai_responses_v1.js";
import { rm } from 'node:fs/promises';

import { LlmDictTool } from '../helpers/llm/tools/dicttool.js';

abstract class ChatResponse {
    botId;
    botName: string;
    guildId;
    channelId;
    userId;
    useGuildLogs: boolean;
    userName: string;
    prompt: string;
    question: string;
    maxTokens: number;
    ai_model: string;
    maxMessages: number;
    responsePrepend: string = '';
    stripBotNameFromResponse: boolean = false;

    protected abstract replyInternal(runtimeData: DiscordBotRuntimeData, message: string): Promise<void>;
    
    async reply(runtimeData: DiscordBotRuntimeData, message: string) {
        await this.replyInternal(runtimeData, message);
    }

    public abstract replyGeneric(data: any): Promise<void>;
}

class SlashCommandResponse extends ChatResponse {
    private _interaction;

    constructor(interaction) {
        super();

        this._interaction = interaction;
    }
    
    protected async replyInternal(runtimeData, message) {
        runtimeData.helpers().editAndSplitReply(this._interaction, message);
    }

    public replyGeneric(data) {
        return this._interaction.editReply(data);
    }
}

class MentionMessageResponse extends ChatResponse {
    private _message;

    constructor(message: Message) {
        super();

        this._message = message;
    }

    protected async replyInternal(runtimeData, message: string) {
        const splitMessage = runtimeData.helpers().splitMessage(message);
        
        if (!Array.isArray(splitMessage)) {
            this._message.reply(message);    
        } else {
            this._message.reply(splitMessage[0]);

            for (let i = 1; i < splitMessage.length; i++) {
                this._message.channel.send(splitMessage[i]);
            }
        }
    }

    public replyGeneric(data) {
        return this._message.reply(data);
    }
}

enum AiApi {
    OpenAI,
    Anthropic,
    Ollama,
    Grok
}

class ChatCommand extends DiscordBotCommand implements DiscordMessageCreateListener {
    
    static getTokens(msg): number {
        return msg.length / 4;
    }

    private callTool(name: string, args: any) {
        this.runtimeData().logger().logInfo(`Calling tool: ${name} with args: ${JSON.stringify(args)}`);

        switch (name) {
            case "get_dict_definition":
                return LlmDictTool.getDictDefinition(args.term);
                break;
            default:
                throw new Error("Unknown tool: " + name);
        }
    }

    private async replyText(requestData, responseText) {
        this.runtimeData().logger().logInfo(`Asked: ${requestData.question}, got: ${responseText}`);

        // Add the response to our list of stuff
        Stenographer.pushMessage(new DiscordStenographerMessage(
            requestData.guildId,
            requestData.channelId,
            requestData.botName,
            requestData.botId,
            responseText,
            Date.now
        ));
        
        if (requestData.stripBotNameFromResponse) {
            this.runtimeData().logger().logInfo(`Stripping bot name from response.`);
            responseText = responseText.replace(`${requestData.botName}<@${requestData.botId}>:`,'');
        }

        await requestData.reply(this.runtimeData(), `${requestData.responsePrepend} ${responseText}`);
    }

    private async handleInternal(requestData: ChatResponse, aiApi: AiApi) {
        try {    
            try {
                const createFunc = OpenAiCompletionsV1Compatible.getCompletionsCompatibleApi(requestData.ai_model);

                if (createFunc == null) {
                    throw new Error(`No compatible API found for model ${requestData.ai_model}`);
                }

                const api = createFunc(
                    requestData.ai_model,
                    requestData.maxMessages,
                    requestData.maxTokens,
                    `You are named ${requestData.botName}<@${requestData.botId}> in a chat room where users talk to each other in a username: text format. ${requestData.prompt}}`
                );
                
                // Push the user question
                {
                    const userQuestion = { "role": "user", "content": requestData.question };
                    api.pushMessage(userQuestion);
                }

                // Get the messages from the rest of the channel or guild
                let messages;

                if (requestData.useGuildLogs) {
                    messages = Stenographer.getGuildMessages(requestData.guildId)
                } else {
                    messages = Stenographer.getChannelMessages(requestData.channelId);
                }

                messages.slice().reverse().every(entry => {
                    const msg = entry.getStandardDiscordMessageFormat();

                    let apiMessageData;
    
                    if (entry.authorId == requestData.botId) {
                        apiMessageData = { "role": "assistant", "content": msg };
                    }
                    else {
                        apiMessageData = { "role": "user", "content": msg };
                    }
                    
                    if (!api.unshiftMessage(apiMessageData)) {
                        return false; // If we can't fit the message, stop processing
                    }
    
                    return true;
                });
    
                // Add the question to the list of messages after we've scanned the rest of the messages
                Stenographer.pushMessage(new DiscordStenographerMessage(
                    requestData.guildId,
                    requestData.channelId,
                    requestData.userName,
                    requestData.userId,
                    requestData.question,
                    Date.now
                ));
    
                let responseText = undefined;

                if (api.getAiModel() == "gpt-5") {
                    this.runtimeData().logger().logInfo(`ChatCommand::handleInternal() Using OpenAIResponsesV1Compatible for model ${api.getAiModel()}`);

                    const apiv2 = api as OpenAIResponsesV1Compatible;
                    let completion = await apiv2.getCompletion();

                    let madeFunctionCall: boolean = false;

                    // Copy all the messages into the input
                    completion.getResponse().output.forEach((item) => {
                        completion.getApi().pushMessage(item, true);
                    });

                    completion.getResponse().output.forEach((toolCall) => {
                        // If its a function call, need to call the tool and pass in the output
                        if (toolCall.type == "function_call") {
                            const name = toolCall.name;
                            const args = JSON.parse(toolCall.arguments);
                            
                            const result = this.callTool(name, args);
                            madeFunctionCall = true;

                            completion.getApi().pushMessage({
                                type: "function_call_output",
                                call_id: toolCall.call_id,
                                output: result.toString()
                            }, true);
                        }
                    });

                    if (madeFunctionCall) {
                        this.runtimeData().logger().logInfo(`ChatCommand::handleInternal() Made function call, getting new completion...`);
                        try {
                            completion = await completion.getApi().getCompletion();
                        } catch (e) {
                            completion = undefined;
                        }
                    }

                    // We know its a responses API call
                    const imageData = completion.getImageData();
                    responseText = completion.getMessageText();

                    if (imageData != undefined) {
                        /* Image defined, we have an image
                            - Download the image to a temp file
                            - Reply with the image as an embed
                            - Delete the temp file

                        */
                        this.runtimeData().logger().logInfo(`ChatCommand::handleInternal() Results contain image data, responding with image.`);

                        const imageDownloadInfo = await SystemHelpers.downloadBufferToFile(imageData.imageBytes, this.runtimeData().settings().get("TEMP_PATH"));
                        const file = new AttachmentBuilder(imageDownloadInfo.fullpath);

                        const TITLE_MAX_LEN = 256;
                        const DESCR_MAX_LEN = 4096;

                        const embed = new Discord.EmbedBuilder();
                        embed.setTitle(requestData.question.trim().substring(0, TITLE_MAX_LEN));
                        if (this.runtimeData().settings().get("CHAT_ENABLE_LONG_DESCRIPTION") == 'true') {
                            embed.setDescription(imageData.revisedPrompt.substring(0, DESCR_MAX_LEN));
                        }
                        embed.setImage(`attachment://${imageDownloadInfo.filename}`);

                        await requestData.replyGeneric({ embeds: [embed], files: [file] });
                        await rm(imageDownloadInfo.fullpath);
                    }
                } else if (responseText == undefined) {
                    responseText = await api.getCompletionText();
                }

                if (responseText) {
                    this.runtimeData().logger().logInfo(`ChatCommand::handleInternal() Results contain text, replying with text.`);
                    this.replyText(requestData, responseText);
                }

            } catch (e) {
                const errorMsg = `Exception getting chat reply to ${requestData.question}, got error ${e}`;
                this.runtimeData().logger().logErrorAsync(errorMsg);
                await requestData.reply(this.runtimeData(), errorMsg);
            }
        }
        catch (e) {
            await requestData.reply(this.runtimeData(), `ChatCommand::handleInternal() exception getting chat reply, got error ${e}`);
        }
    }

    async handle(interaction: ChatInputCommandInteraction): Promise<void>  {
        using perfCounter = this.runtimeData().getPerformanceCounter("handleChatCommand(): ");

        try {
            this.runtimeData().logger().logInfo(`ChatCommand::handle() start processing slash command from ${interaction.user.username} in channel ${interaction.channelId}`);

            const slashCommandRequest = KoalaSlashCommandRequest.fromDiscordInteraction(interaction);

            const requestData = new SlashCommandResponse(interaction);

            requestData.botId = this.runtimeData().bot().client().user.id;
            requestData.botName = this.runtimeData().bot().client().user.username;
            requestData.channelId = slashCommandRequest.getOptionValueString("override_channel_id", interaction.channelId);
            requestData.guildId = interaction.guildId;
            requestData.useGuildLogs = slashCommandRequest.getOptionValueBoolean("use_guild_log", true);
            requestData.userId = interaction.member.user.id;
            requestData.userName = interaction.member.user.username;
            requestData.prompt = slashCommandRequest.getOptionValueString('ai_prompt', this.runtimeData().settings().get("CHAT_PROMPT_INSTRUCTIONS"));
            requestData.question = `${interaction.member.user.username}: ${slashCommandRequest.getOptionValueString('response')}`;
            requestData.maxTokens = slashCommandRequest.getOptionValueNumber('token_count', parseInt(this.runtimeData().settings().get("GPT_TOKEN_COUNT")));
            requestData.ai_model = slashCommandRequest.getOptionValueString('ai_model', this.runtimeData().settings().get("CHAT_DEFAULT_MODEL"));
            requestData.maxMessages = parseInt(this.runtimeData().settings().get("GPT_MAX_MESSAGES")) || 2048;
            requestData.responsePrepend = `Query \"${requestData.question}\":`;

            let aiApi: AiApi;

            // Throw error if anthropic key isn't defined and trying to use claude
            if (requestData.ai_model.includes('claude')) {
                aiApi = AiApi.Anthropic;

                if (!this.runtimeData().settings().has("ANTHROPIC_API_KEY")) {
                    await this.runtimeData().logger().logErrorAsync(`Cannot use Claude without ANTHROPIC_API_KEY`, interaction, true);
                }
            } else if (requestData.ai_model.includes('gpt') || requestData.ai_model.includes('o1')) {
                aiApi = AiApi.OpenAI;

                if (!this.runtimeData().settings().has("OPENAI_API_KEY")) {  // Same for ChatGPT
                    await this.runtimeData().logger().logErrorAsync(`Cannot use ChatGPT without OPENAI_API_KEY`, interaction, true);
                }
            } else if (requestData.ai_model.includes('llama')) {
                aiApi = AiApi.Ollama;
            } else if (requestData.ai_model.includes('grok')) {
                aiApi = AiApi.Grok;

                if (!this.runtimeData().settings().has("GROK_API_KEY")) {  // Same for Grok
                    await this.runtimeData().logger().logErrorAsync(`Cannot use ChatGPT without GROK_API_KEY`, interaction, true);
                }
            }

            await this.handleInternal(requestData, aiApi);
        } catch (e) {
            await this.runtimeData().logger().logErrorAsync(`ChatCommand::handle() exception getting chat reply, got error ${e}`, interaction, true);
        }
    }

    private async sendTypingIndicator(channelId): Promise<void> {
        const channel: any = await this.runtimeData().bot().client().channels.cache.get(channelId);
        
        try {
            channel.sendTyping();
        } catch (e) {
            this.runtimeData().logger().logErrorAsync(`ChatCommand::onMessageCreate() error sending typing indicator, got ${e}`);
        }
    }

    async onMessageCreate(runtimeData: DiscordBotRuntimeData, message: Message): Promise<void> {
        using perfCounter = this.runtimeData().getPerformanceCounter("handleChatCommand(): ");

        try {
            if (!message.author.bot && message.mentions.has(this.runtimeData().bot().client().user.id)) {
                this.runtimeData().logger().logInfo(`ChatCommand::onMessageCreate() start message processing from ${message.author.username} in channel ${message.channelId}`);

                this.sendTypingIndicator(message.channelId);

                const requestData = new MentionMessageResponse(message);

                requestData.botId = runtimeData.bot().client().user.id;
                requestData.botName = runtimeData.bot().client().user.username;
                requestData.channelId = message.channelId;
                requestData.guildId= message.guildId;
                requestData.useGuildLogs = false;
                requestData.userId = message.author.id;
                requestData.userName = message.author.username;
                requestData.prompt = this.runtimeData().settings().get("CHAT_PROMPT_INSTRUCTIONS");
                requestData.question = message.content.replace(`<@${requestData.botId}>`,'');
                requestData.maxTokens = parseInt(this.runtimeData().settings().get("GPT_TOKEN_COUNT"));
                requestData.ai_model = this.runtimeData().settings().get("CHAT_DEFAULT_MODEL");
                requestData.maxMessages = parseInt(this.runtimeData().settings().get("GPT_MAX_MESSAGES")) || 2048;
                requestData.stripBotNameFromResponse = true;

                await this.handleInternal(requestData, AiApi.OpenAI);
            }
        } catch (e) {
            this.runtimeData().logger().logErrorAsync(`Chat::onMessageCreate() error, got ${e}`);
        }
    }

    get(): SlashCommandOptionsOnlyBuilder {
        const chatCommand = new SlashCommandBuilder()
                        .setName(this.name())
                        .setDescription(`Chat with ${this.runtimeData().settings().get("BOT_NAME")}`)
                        .addStringOption((option) =>
                            option
                                .setName('response')
                                .setDescription(`Response to ${this.runtimeData().settings().get("BOT_NAME")}`)
                                .setRequired(true),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('token_count')
                                .setDescription('Max Tokens to use (This costs money assholes)')
                                .addChoices(
                                    { name: 'extra_low', value: '8192' },
                                    { name: 'default', value: '24576' },
                                    { name: 'high', value: '73728' },
                                    { name: 'max', value: '128000' },
                                )
                                .setRequired(false),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('ai_model')
                                .setDescription('AI Model to use')
                                .addChoices(
                                    { name: 'gpt-5-chat-latest', value: 'gpt-5-chat-latest' },
                                    { name: 'gpt-4o', value: 'gpt-4o' },
                                    { name: 'chatgpt-4o-latest', value: 'chatgpt-4o-latest' },
                                    { name: 'gpt-4-turbo', value: 'gpt-4-turbo' },
                                    { name: 'claude-3.5-sonnet', value: 'claude-3.5-sonnet' },
                                    { name: 'ollama', value: 'ollama' },
                                    { name: 'grok-2-latest', value: 'grok-2-latest' },
                                )
                                .setRequired(false),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('ai_prompt')
                                .setDescription('Prompt to tell the robot how to behave, e.g. You are a helpful assistant.')
                                .setRequired(false),
                        )
                        .addBooleanOption((option) => 
                            option
                                .setName('use_guild_log')
                                .setDescription(`Use logs from all channels in server, not just channel. Default is true for /chat, false for @${this.runtimeData().settings().get("BOT_NAME")}`)
                                .setRequired(false),
                        )
                        .addStringOption((option) => 
                            option
                                .setName('override_channel_id')
                                .setDescription(`Use logs from specific channel when guild (whole server) logs are disabled.`)
                                .setRequired(false),
                        )

                        ;
        return chatCommand;
    }

} 

import { ListenerManager } from '../listenermanager.js';
import { DiscordMessageCreateListener } from '../api/discordmessagelistener.js';
import { SystemHelpers } from '../helpers/systemhelpers.js';

const chatInstance = new ChatCommand('chat');
registerDiscordBotCommand(chatInstance);
ListenerManager.registerMessageCreateListener(chatInstance);
