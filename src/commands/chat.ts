/*
    AI chatbot functionality
*/

import { KoalaSlashCommandRequest } from '../koala-bot-interface/koala-slash-command.js';

import { SlashCommandOptionsOnlyBuilder, SlashCommandBuilder, ChatInputCommandInteraction, Message } from 'discord.js';
import { OpenAIHelper } from '../helpers/openaihelper.js';
import { AnthropicHelper } from '../helpers/anthropichelper.js';
import { OllamaHelper } from '../helpers/ollamahelper.js';
import { Stenographer, DiscordStenographerMessage } from '../helpers/discordstenographer.js';
import { DiscordBotCommand, registerDiscordBotCommand } from '../api/DiscordBotCommand.js'
import { DiscordBotRuntimeData } from '../api/DiscordBotRuntimeData.js'

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
            this._message.reply(`Response too long, split below`);

            splitMessage.forEach(msg => {
                this._message.channel.send(msg);
            });
        }
    }
}

enum AiApi {
    OpenAI,
    Anthropic,
    Ollama
}

class ChatCommand extends DiscordBotCommand implements DiscordMessageCreateListener {
    
    static getTokens(msg): number {
        return msg.length / 4;
    }

    private async handleInternal(requestData: ChatResponse, aiApi: AiApi) {
        try {    
            try {
                let messageData = [];
    
                const systemPrompt = `You are named ${requestData.botName}<@${requestData.botId}> in a chat room where users talk to each other in a username: text format. ${requestData.prompt}}`;

                if (aiApi == AiApi.OpenAI || aiApi == AiApi.Ollama) {
                    messageData.push({
                        "role": "system",
                        "content": systemPrompt
                    });
                }
    
                const userQuestion = { "role": "user", "content": requestData.question };
    
                // start with the header and footer accounted for
                let tokens = ChatCommand.getTokens(userQuestion.content);
                if (aiApi == AiApi.OpenAI) tokens += ChatCommand.getTokens(messageData[0].content);
    
                let messages;

                if (requestData.useGuildLogs) {
                    messages = Stenographer.getGuildMessages(requestData.guildId)
                } else {
                    messages = Stenographer.getChannelMessages(requestData.channelId);
                }

                messages.slice().reverse().every(entry => {
                    const msg = entry.getStandardDiscordMessageFormat();
    
                    const msgTokens = ChatCommand.getTokens(msg);
                    tokens += msgTokens;
    
                    if (tokens > requestData.maxTokens || messageData.length >= requestData.maxMessages)
                        return false;
    
                    if (entry.authorId == requestData.botId) {
                        messageData.unshift({ "role": "assistant", "content": msg });
                    }
                    else {
                        messageData.unshift({ "role": "user", "content": msg });
                    }
    
                    return true;
                });
    
                messageData.push(userQuestion);
    
                // Add the question to the list of messages
                Stenographer.pushMessage(new DiscordStenographerMessage(
                    requestData.guildId,
                    requestData.channelId,
                    requestData.userName,
                    requestData.userId,
                    requestData.question,
                    Date.now
                ));
    
                // Trim message data length based on maximum length of array
                //  This is checked earlier, but this catches any additional
                //  messages that might be added before actually making the
                //  call to the completion.
                while (messageData.length > requestData.maxMessages) messageData.shift();
    
                let responseText = "";

                switch (aiApi) {
                    case AiApi.OpenAI:
                    {
                        const completion = await OpenAIHelper.getInterface().chat.completions.create({
                            model: requestData.ai_model,
                            messages: messageData
                        });
            
                        responseText = completion.choices[0].message.content;
                    }
                    break;

                    case AiApi.Anthropic:
                    {
                        const completion = await AnthropicHelper.getInterface().messages.create({
                            model: "claude-3-5-sonnet-20240620",
                            max_tokens: requestData.maxTokens,
                            system: systemPrompt,
                            messages: messageData,
                        });
    
                        responseText = completion.content[0].text;
                    }
                    break;

                    case AiApi.Ollama:
                    {
                        if (OllamaHelper.getInterface() == null) {
                            throw new Error(`Cannot connect to Ollama server at ${this.runtimeData().settings().get(`OLLAMA_SERVER_ADDRESS`)}`);
                        }
                        
                        const completion = await OllamaHelper.getInterface().chat({
                            model: "llama3.1",
                            messages: messageData,
                        });
    
                        responseText = completion.message.content;
                    }
                    break;

                    default:
                        throw new Error("API Not yet implemented");
                }
                
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
            } catch (e) {
                const errorMsg = `Exception getting chat reply to ${requestData.question}, got error ${e}`;
                this.runtimeData().logger().logError(errorMsg);
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
            const slashCommandRequest = KoalaSlashCommandRequest.fromDiscordInteraction(interaction);

            const requestData = new SlashCommandResponse(interaction);

            requestData.botId = this.runtimeData().bot().client().user.id;
            requestData.botName = this.runtimeData().bot().client().user.username;
            requestData.channelId = interaction.channelId;
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
                    await this.runtimeData().logger().logError(`Cannot use Claude without ANTHROPIC_API_KEY`, interaction, true);
                }
            } else if (requestData.ai_model.includes('gpt') || requestData.ai_model.includes('o1')) {
                aiApi = AiApi.OpenAI;

                if (!this.runtimeData().settings().has("OPENAI_API_KEY")) {  // Same for ChatGPT
                    await this.runtimeData().logger().logError(`Cannot use ChatGPT without OPENAI_API_KEY`, interaction, true);
                }
            } else if (requestData.ai_model.includes('llama')) {
                aiApi = AiApi.Ollama;
            }

            await this.handleInternal(requestData, aiApi);
        } catch (e) {
            await this.runtimeData().logger().logError(`ChatCommand::handle() exception getting chat reply, got error ${e}`, interaction, true);
        }
    }

    async onMessageCreate(runtimeData: DiscordBotRuntimeData, message: Message): Promise<void> {
        using perfCounter = this.runtimeData().getPerformanceCounter("handleChatCommand(): ");

        try {
            if (!message.author.bot && message.mentions.has(this.runtimeData().bot().client().user.id)) {
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
            this.runtimeData().logger().logError(`Chat::onMessageCreate() error, got ${e}`);
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
                                    { name: 'gpt-4o', value: 'gpt-4o' },
                                    { name: 'chatgpt-4o-latest', value: 'chatgpt-4o-latest' },
                                    { name: 'gpt-4-turbo', value: 'gpt-4-turbo' },
                                    { name: 'claude-3.5-sonnet', value: 'claude-3.5-sonnet' },
                                    { name: 'ollama', value: 'ollama' },
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

                        ;
        return chatCommand;
    }

} 

import { ListenerManager } from '../listenermanager.js';
import { DiscordMessageCreateListener } from '../api/DiscordMessageListener.js';

const chatInstance = new ChatCommand('chat');
registerDiscordBotCommand(chatInstance);
ListenerManager.registerMessageCreateListener(chatInstance);
