import { LLMMessageTracker, LLMMessageTrackerGetTokenCountFunction } from './llmmessagetracker.js'
import { DiscordBotRuntimeData } from '../api/discordbotruntimedata.js'
import { DiscordMessageCreateListener } from '../api/discordmessagelistener.js';
import { ListenerManager } from '../listenermanager.js';
import * as Discord from 'discord.js';
import { Stenographer } from '../app/stenographer/discordstenographer.js';
import { DiscordStenographerMessage } from "../app/stenographer/discordstenographermessage.js";
import { UserSettingsManager } from '../app/user/usersettingsmanager.js';
import { PerformanceCounter } from '../performancecounter.js';
import { LLMInteractionMessage, LLMInteractionMessageFactory } from './llminteractionmessage.js';

import config from 'config';
import { LLMToolManager } from './llmtoolmanager.js';
import { getCommonLogger } from '../logging/logmanager.js';

export interface LLMGeneratedImageData {
    imageBytes: Buffer;
    prompt: string;
}

export interface LLMCompletion {
    getResponseRaw(): any;  // eslint-disable-line @typescript-eslint/no-explicit-any
    getResponseImageData(): LLMGeneratedImageData | undefined;
    getResponseText(): string;
}

export class LLMChatInteraction {
    private llmMessageTracker: LLMMessageTracker;

    constructor() {
        this.llmMessageTracker = new LLMMessageTracker();
    }

    public setSystemPrompt(prompt: string) {
        this.llmMessageTracker.setSystemPrompt(prompt);
    }
}

export abstract class LLMBot implements DiscordMessageCreateListener {
    private enabled: boolean = false;
    public readonly aiModel: string;
    
    constructor(aiModel: string, enabled: boolean = false) {
        this.aiModel = aiModel;
        this.enabled = enabled;
    }

    public isEnabled(): boolean {
        return this.enabled;
    }
    
    public setEnabled(enabled: boolean) {
        this.enabled = enabled;
    }

    protected trackers: Map<string, LLMMessageTracker> = new Map();

    protected getTokenCount(runtimeData: DiscordBotRuntimeData, message: string): number {
        return LLMMessageTracker.defaultGetTokenCountFunction(message);
    }

    protected getTokenCountFunction(runtimeData: DiscordBotRuntimeData): LLMMessageTrackerGetTokenCountFunction {
        return (msg: string): number => {
            return this.getTokenCount(runtimeData, msg);
        };
    }

    protected abstract getVisionContent(_promptText: string, _imageUrls: string[]): Promise<unknown[]>;
    protected abstract getCompletion(_runtimeData: DiscordBotRuntimeData, _message: LLMInteractionMessage, _tracker: LLMMessageTracker): Promise<LLMCompletion>;
    protected abstract getImageCompletion(_runtimeData: DiscordBotRuntimeData, _systemPrompt: string, _promptText: string, _imageInputUrls: string[]): Promise<LLMCompletion>;
    protected abstract hasAutomaticImageGeneration(): boolean; 
    protected abstract isMessageRequestForImageGeneration(_runtimeData: DiscordBotRuntimeData, _message: LLMInteractionMessage): Promise<boolean>;
    protected abstract getGeneralRequestTracker(_runtimeData: DiscordBotRuntimeData, _message: LLMInteractionMessage, _systemPrompt: string): Promise<LLMMessageTracker>;
    protected abstract getVisionRequestTracker(_runtimeData: DiscordBotRuntimeData, _message: LLMInteractionMessage, _systemPrompt: string, _imageUrls: string[]): Promise<LLMMessageTracker>;
    
    protected async callTool(toolName: string, args: unknown): Promise<string> {
        return LLMToolManager.callTool(toolName, args);
    }

    protected getTools(): unknown[] {
        return LLMToolManager.getToolDefinitions();
    }

    public static splitText(message: string, maxMessageLength = 2000): string[] {
        if (message.length <= maxMessageLength) {
            return [message];
        } else {
            const count = Math.ceil(message.length / maxMessageLength);
            const messages: string[] = [];

            for (let i = 0, c = 0; i < count; ++i, c += maxMessageLength) {
                messages[i] = message.slice(c, c + maxMessageLength);
            }

            return messages;
        }
    }

    public static getQuestion(message: Discord.Message) {
        return message.content;
    }

    public static async replyImage(runtimeData: DiscordBotRuntimeData, message: LLMInteractionMessage, imageData: LLMGeneratedImageData) {                    
        const TITLE_MAX_LEN = config.get<number>("Discord.attachmentTitleMaxLength");
        const DESCR_MAX_LEN = config.get<number>("Discord.attachmentDescriptionMaxLength");

        try {
            const imageUrl = `data:image/png;base64,${imageData.imageBytes.toString("base64")}`;

            if (config.get<boolean>("Stenographer.storeImages")) {
                Stenographer.pushMessage(new DiscordStenographerMessage(
                    message.getGuildId(),
                    message.getChannelId(),
                    runtimeData.bot().client().user!.username,
                    runtimeData.bot().client().user!.id,
                    imageData.prompt,
                    Date.now(),
                    imageUrl
                ));
            }
        } catch (e) {
            runtimeData.logger().logError(`LLMBot::replyImage(): Failed to store image message in stenographer, got: ${e}`);
        }

		const image = new Discord.AttachmentBuilder(imageData.imageBytes, {
            name: 'image.png',
            description: imageData.prompt.substring(0, DESCR_MAX_LEN)
        });

        const embed = new Discord.EmbedBuilder();
        embed.setTitle(message.getQuestion()
                .replace(`<@${runtimeData.botId()}>`,'')    // strip bot name
                .replace('/chat','')                        // strip command name
                .trim().substring(0, TITLE_MAX_LEN));

        if (config.get("Chat.enableLongDescription")) {
            const text = "-# " + imageData.prompt;
            embed.setDescription(text.substring(0, DESCR_MAX_LEN));
        }

        embed.setImage(`attachment://image.png`);

        await message.reply({ embeds: [embed], files: [image] });
    }

    private static async replyText(runtimeData: DiscordBotRuntimeData, message: LLMInteractionMessage, responseText: string) {
        runtimeData.logger().logInfo(`LLMBot::replyText(): ${message.getQuestion()}, got: ${responseText}`);

        // Add the response to our list of stuff
        Stenographer.pushMessage(new DiscordStenographerMessage(
            message.getGuildId()!,
            message.getChannelId()!,
            runtimeData.bot().client().user!.username,
            runtimeData.bot().client().user!.id,
            responseText,
            Date.now()
        ));

        try {
            const pChannel = runtimeData.bot().client().channels.cache.get(message.getChannelId());

            const messages = LLMBot.splitText(responseText);
            await message.reply(messages[0]);

            const channel = await pChannel;
            if (channel) {
                for (let i = 1; i < messages.length; i++) {
                    if ('send' in channel) {
                        await channel.send(messages[i]);
                    } else {
                        runtimeData.logger().logErrorAsync(`LLMBot::replyText(): Failed to send split message, message channel lacks send method`);
                        return;
                    }
                }
            }
        } catch (e) {
            runtimeData.logger().logErrorAsync(`LLMBot::replyText(): Failed to reply to message, got error ${e}`);
        }
    }

    private async getIfImageUrl(url: string): Promise<string> {
        try {
            const res = await fetch(url);
            const buf = await res.blob();

            if (buf.type.startsWith("image/")) return url;
        } catch (e) { 
            getCommonLogger().logError(`LLMBot::getIfImageUrl(): Failed to fetch url ${url}, got error ${e}`);
        }

        return "";
    }

    private getUrlsFromString(content: string): string[] {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = content.match(urlRegex);
        return urls || [];
    }

    private async getImageUrlsFromMessages(messages: (Discord.Message | Discord.OmitPartialGroupDMChannel<Discord.Message<boolean>> | LLMInteractionMessage | undefined)[]): Promise<string[]> {
        const imageUrls: string[] = [];
        const promises: Promise<string>[] = [];

        messages.forEach(message => {
            if (!message) return;

            if ('attachments' in message) {
                message.attachments.forEach(attachment => {
                    if (attachment.contentType?.startsWith("image/")) {
                        imageUrls.push(attachment.url);
                    }
                });
            }
            
            if ('embeds' in message) {
                message.embeds.forEach(embed => {
                    if (embed.image) {
                        imageUrls.push(embed.image.url);
                    }
                });
            }

            let content = "";
            if ('content' in message) {
                content = message.content;
            } else if ('getQuestion' in message) {
                content = message.getQuestion();
            }
            
            if (content) {
                const urls = this.getUrlsFromString(content);

                if (urls) {
                    for (let i = 0; i < urls.length; i++) {
                        promises.push(this.getIfImageUrl(urls[i]));
                    }
                }
            }
        });

        await Promise.all(promises).then(results => {
            for (let i = 0; i < results.length; i++) {
                if (results[i]) {
                    imageUrls.push(results[i]);
                }
            }
        });            

        return imageUrls;
    }

    public async onDiscordMessageCreate(runtimeData: DiscordBotRuntimeData, message: Discord.Message) {
        const botId = runtimeData.bot().client().user!.id;
        
        if (!message.author.bot && message.mentions.has(botId)) {
            const interactionMsg = LLMInteractionMessageFactory.createFromDiscordMessage(message);

            // Send typing indicator
            try {
                const channel = await runtimeData.bot().client().channels.cache.get(interactionMsg.getChannelId());
                if (channel && 'sendTyping' in channel) {
                    channel.sendTyping();
                }
                runtimeData.logger().logInfo("LLMBot::handleUserInteraction(): Sent typing indicator");
            } catch (e) {
                runtimeData.logger().logError(`LLMBot::handleUserInteraction(): Failed to get channel to send typing indicator, got: ${e}`);
            }

            return this.handleUserInteraction(runtimeData, interactionMsg);
        }
    }

    public async handleUserInteraction(runtimeData: DiscordBotRuntimeData, message: LLMInteractionMessage) {
        using _perfCounter = PerformanceCounter.Create("LLMBot::handleUserInteraction(): ", performance.now(), runtimeData.logger(), true);

        try {
            const userData = UserSettingsManager.get().get(message.getUserName());

            runtimeData.logger().logInfo(`LLMBot::handleUserInteraction(): Message mentions bot, processing as LLM request.`);

            const systemPrompt = userData.chatSettings.customPrompt.length > 0 ? 
                                    userData.chatSettings.customPrompt 
                                    : config.get<string>("Chat.systemPrompt");

            // Store reference to replied to message
            const referencedMessage = message.getInternalData().reference ? await message.getInternalData().fetchReference() : undefined;

            // Call the LLM to get a response
            let completion;
            const imageUrls = await this.getImageUrlsFromMessages([referencedMessage, message]);    // Get any image urls that might be in the message(s)

            if (!this.hasAutomaticImageGeneration() && await this.isMessageRequestForImageGeneration(runtimeData, message)) {
                runtimeData.logger().logInfo("LLMBot::handleUserInteraction(): Detected image generation request when automatic generation is not supported.");
                try {
                    completion = await this.getImageCompletion(runtimeData, systemPrompt, message.getQuestion(), imageUrls);
                } catch (e) {
                    runtimeData.logger().logError(`LLMBot::handleUserInteraction(): Failed to generate image, got ${e}`);
                    message.reply(`Failed to generate image, got error ${e}`);
                    return;
                }
            } else {
                // Fill out context information
                let tempTracker: LLMMessageTracker;

                if (config.get("Chat.ImageVision.enable")   // If vision is enabled
                    && imageUrls.length > 0                 // and we found some image urls in the message or the referenced message
                ) {
                    runtimeData.logger().logInfo(`LLMBot::handleUserInteraction(): Attachments or embeds found, processing as vision request.`);
                    
                    try {
                        tempTracker = await this.getVisionRequestTracker(runtimeData, message, systemPrompt, imageUrls);
                    } catch (e) {
                        runtimeData.logger().logErrorAsync(`LLMBot::handleUserInteraction(): Failed to get vision request tracker, got error ${e}`);
                        message.reply(`Failed to process vision request: ${e}`);
                        return;
                    }
                } else {
                    runtimeData.logger().logInfo(`LLMBot::handleUserInteraction(): Processing as general request`);
                    tempTracker = await this.getGeneralRequestTracker(runtimeData, message, systemPrompt);
                }

                try {
                    completion = await this.getCompletion(runtimeData, message, tempTracker);
                } catch (e) {
                    const errMsg = `Failed to get ${this.aiModel} completion, got error ${e}`;
                    runtimeData.logger().logErrorAsync(`LLMBot::handleUserInteraction(): ${errMsg}`);
                    message.reply(errMsg);
                    return;
                }
            }

            const imageData = completion.getResponseImageData();
            const responseText = completion.getResponseText();
        
            if (imageData) {
                runtimeData.logger().logInfo(`LLMBot::handleUserInteraction(): Results contain image data, responding with image.`);
                LLMBot.replyImage(runtimeData, message, imageData);
            } else if (responseText) {
                runtimeData.logger().logInfo(`LLMBot::handleUserInteraction() Results contain text, replying with text.`);
                LLMBot.replyText(runtimeData, message, responseText);
            } else {
                const errMsg = `Response has neither text or image data or there was an error retrieving it.`;
                runtimeData.logger().logError(`LLMBot::handleUserInteraction() ${errMsg}`);
                message.reply(errMsg);
            }
        } catch (e) {
            const errMsg = `LLMBot::handleUserInteraction(): Failed to process message, got error ${e}`;
            runtimeData.logger().logErrorAsync(`LLMBot::handleUserInteraction(): ${errMsg}`);
            message.reply(errMsg);
        }
    }
}

export class LLMBotManager implements DiscordMessageCreateListener {
    private llmBots: Map<string, LLMBot> = new Map();
    
    private static instance: LLMBotManager = new LLMBotManager();
    private constructor() {
        ListenerManager.registerMessageCreateListener(this);
    }

    async onDiscordMessageCreate(runtimeData: DiscordBotRuntimeData, message: Discord.Message): Promise<void> {
        const userData = UserSettingsManager.get().get(message.author.username);
        const preferredAiModel = userData.chatSettings.preferredAiModel || config.get<string>("Chat.aiModel");

        const llmBot = LLMBotManager.getLLMBot(preferredAiModel);
        
        // If we have a bot for this model and its enabled, chain the message to it
        if (llmBot && llmBot.isEnabled()) {
            return llmBot.onDiscordMessageCreate(runtimeData, message);
        }
    }

    public static registerLLMBot(aiModel: string, llmBot: LLMBot) {
        this.instance.llmBots.set(aiModel, llmBot);
    }

    public static getLLMBot(aiModel: string) {
        const factory = LLMBotManager.instance;
        return factory.llmBots.get(aiModel);
    }

    public static setLLMBotEnabled(aiModel: string, enabled: boolean) {
        if (!this.instance.llmBots.has(aiModel)) {
            throw new Error("LLM Bot not registered, cannot be enabled.");
        }

        this.instance.llmBots.get(aiModel)?.setEnabled(enabled);
    }
}
