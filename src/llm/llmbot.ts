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
import { DiscordPlatform } from '../platform/discord/discordplatform.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import config from 'config';
import { LLMToolManager } from './llmtoolmanager.js';
import { getCommonLogger } from '../logging/logmanager.js';
import { HonchoModule } from '../modules/honcho.js';

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
    protected abstract getCompletion(_safetyTag: string, _runtimeData: DiscordBotRuntimeData, _message: LLMInteractionMessage, _tracker: LLMMessageTracker): Promise<LLMCompletion>;
    protected abstract getImageCompletion(_safetyTag: string, _runtimeData: DiscordBotRuntimeData, _systemPrompt: string, _promptText: string, _imageInputUrls: string[]): Promise<LLMCompletion>;
    protected abstract hasAutomaticImageGeneration(): boolean; 
    protected abstract isMessageRequestForImageGeneration(_runtimeData: DiscordBotRuntimeData, _message: LLMInteractionMessage): Promise<boolean>;
    protected abstract getGeneralRequestTracker(_runtimeData: DiscordBotRuntimeData, _message: LLMInteractionMessage, _systemPrompt: string, _overrideQuery?: string): Promise<LLMMessageTracker>;
    protected abstract getVisionRequestTracker(_runtimeData: DiscordBotRuntimeData, _message: LLMInteractionMessage, _systemPrompt: string, _imageUrls: string[], _overrideQuery?: string): Promise<LLMMessageTracker>;
    
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

        // Store the image in the stenographer as a base64 string
        try {
            const imageUrl = `data:image/png;base64,${imageData.imageBytes.toString("base64")}`;

            if (config.get<boolean>("Stenographer.storeImages")) {
                await Stenographer.pushMessage(new DiscordStenographerMessage(
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

        // Write the image to disk if enabled
        if (config.get<boolean>("ImageGeneration.saveImages")) {
            const hash = crypto.createHash('sha256').update(imageData.imageBytes).digest('hex');
            const saveFolder = config.get<string>("ImageGeneration.imageSavePath")
            const imageFilePath = `${saveFolder}/${hash}.png`;
            const metadataFilePath = `${saveFolder}/${hash}.xml`;
            
            try {
                runtimeData.logger().logDebug(`LLMBot::replyImage(): Creating image save path directory if it doesn't exist: ${saveFolder}`);
                await fs.mkdir(saveFolder, { recursive: true });

                runtimeData.logger().logDebug(`LLMBot::replyImage(): Saving image to path: ${imageFilePath} and metadata to path: ${metadataFilePath}`);
                fs.writeFile(imageFilePath, imageData.imageBytes);  // No await, we don't care when it gets done

                // Write the image info as xml alongside it
                const xmlContent = `<image><prompt>${imageData.prompt}</prompt><timestamp>${Date.now()}</timestamp></image>`;
                fs.writeFile(metadataFilePath, xmlContent);  // No await, we don't care when it gets done
            } catch (e) {
                runtimeData.logger().logError(`LLMBot::replyImage(): Failed to write image or metadata to save path, got error ${e}. imagePath: ${imageFilePath}, metadataPath: ${metadataFilePath}`);
            }
        }

        // reply the image to the user on discord
        try {
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
        } catch (e) {
            runtimeData.logger().logErrorAsync(`LLMBot::replyImage(): Failed to discord reply with image, got error ${e}`);
        }
    }

    private static async replyText(runtimeData: DiscordBotRuntimeData, message: LLMInteractionMessage, responseText: string) {
        runtimeData.logger().logInfo(`LLMBot::replyText(): ${message.getQuestion()}, got: ${responseText}`);

        const botId = runtimeData.bot().client().user!.id;

        // Add the response to our list of stuff
        await Stenographer.pushMessage(new DiscordStenographerMessage(
            message.getGuildId()!,
            message.getChannelId()!,
            runtimeData.bot().client().user!.username,
            botId,
            responseText,
            Date.now()
        ));

        // Honcho assistant logging
        await HonchoModule.get().pushMessageToHoncho(botId, message.getChannelId(), responseText);

        // Actually send stuff to the channel
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

    private async getImageUrlsFromMessages(messages: (Discord.Message | Discord.OmitPartialGroupDMChannel<Discord.Message<boolean>>)[]): Promise<string[]> {
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

            return this.handleUserInteraction(runtimeData, interactionMsg);
        }
    }

    private async getTracker(runtimeData: DiscordBotRuntimeData,  message: LLMInteractionMessage, systemPrompt: string, imageUrls: string[], overrideQuery?: string): Promise<LLMMessageTracker | null> {
        let newTracker: LLMMessageTracker;

        if (config.get("Chat.ImageVision.enable")   // If vision is enabled
            && imageUrls.length > 0                 // and we found some image urls in the message or the referenced message
        ) {
            runtimeData.logger().logInfo(`LLMBot::handleUserInteraction(): Attachments or embeds found, processing as vision request.`);
            
            try {
                newTracker = await this.getVisionRequestTracker(runtimeData, message, systemPrompt, imageUrls, overrideQuery);
            } catch (e) {
                runtimeData.logger().logErrorAsync(`LLMBot::handleUserInteraction(): Failed to get vision request tracker, got error ${e}`);
                await message.reply(`Failed to process vision request: ${e}`);
                return null;
            }
        } else {
            runtimeData.logger().logInfo(`LLMBot::handleUserInteraction(): Processing as general request`);
            newTracker = await this.getGeneralRequestTracker(runtimeData, message, systemPrompt, overrideQuery);
        }

        return newTracker;
    }
    
    private static _defaultSoul: string;

    private async getDefaultSystemPrompt(): Promise<string> {
        if (!LLMBot._defaultSoul) {
            try {
                LLMBot._defaultSoul = await fs.readFile(config.get<string>("Global.localDataPath") + "/" + config.get<string>("Chat.systemSoul"), "utf-8");
                if (LLMBot._defaultSoul.length / 4 > config.get<number>("Chat.maxSoulTokens")) {
                    getCommonLogger().logWarning(`LLMBot::getDefaultSystemPrompt(): System soul prompt length of ${LLMBot._defaultSoul.length} exceeds max length of ${config.get<number>("Chat.maxSoulTokens") * 4}, truncating.`);
                    LLMBot._defaultSoul = LLMBot._defaultSoul.substring(0, config.get<number>("Chat.maxSoulTokens") * 4);
                }
            } catch (e) {
                getCommonLogger().logError(`LLMBot::getDefaultSystemPrompt(): Failed to read system soul file, got error ${e}, falling back to default system prompt until next reboot.`);
                LLMBot._defaultSoul = config.get<string>("Chat.systemPrompt");
            }
        } 
        
        return LLMBot._defaultSoul;
    }

    public async handleUserInteraction(runtimeData: DiscordBotRuntimeData, message: LLMInteractionMessage) {
        using _perfCounter = PerformanceCounter.Create("LLMBot::handleUserInteraction(): ", performance.now(), runtimeData.logger(), true);
        using _autoTyper = DiscordPlatform.createTypingObject(message.getInternalData().channel);
        
        runtimeData.logger().logInfo(`LLMBot::handleUserInteraction(): Message mentions bot, processing as LLM request.`);

        try {
            const userData = UserSettingsManager.get().get(message.getUserName());
            const systemPrompt = (userData.chatSettings.customPrompt.length > 0 ? 
                                    userData.chatSettings.customPrompt 
                                    : await this.getDefaultSystemPrompt()) 
                                + "\n\n" + config.get<string>("Chat.commonPrompt");

            const safetyTag = `${runtimeData.botId()}-${message.getUserId()}-${message.getChannelId()}`;

            // Pull honcho memory if it exists 
            if (userData.chatSettings.useHoncho) {
                try {
                    const hanchoPrompt = await HonchoModule.get().getSystemPrompt(runtimeData.botId(), message.getUserId(), message.getChannelId());
                    if (hanchoPrompt.length > 0) {
                        getCommonLogger().logInfo(`LLMBot::handleUserInteraction(): Pulled honcho memory for user ${message.getUserName()} in channel ${message.getChannelId()}, length: ${hanchoPrompt.length}`);
                        systemPrompt.concat(hanchoPrompt);
                    }
                } catch (e) {
                    runtimeData.logger().logError(`LLMBot::handleUserInteraction(): Failed to pull Honcho memory for user ${message.getUserName()} in channel ${message.getChannelId()}, got error ${e}`);
                }
            }

            // Store reference to replied to message
            const referencedMessage = message.getInternalData().reference ? await message.getInternalData().fetchReference() : undefined;

            // Pull any images
            const imageUrls = await this.getImageUrlsFromMessages([referencedMessage, message.getInternalData()]);    // Get any image urls that might be in the message(s)
            
            // Will store actual response we send to the user
            let completion: LLMCompletion;

            // If the model doesn't have automatic prompting, we need to generate a proper image prompt and then call the image completion directly                
            if (!this.hasAutomaticImageGeneration() && await this.isMessageRequestForImageGeneration(runtimeData, message)) {
                runtimeData.logger().logInfo("LLMBot::handleUserInteraction(): Detected image generation request when automatic generation is not supported.");

                const tempTracker = await this.getTracker(runtimeData, 
                                                        message, 
                                                        config.get<string>("Chat.genericSystemPrompt"),     // Use the generic prompt to avoid any weird behaviors
                                                        imageUrls, 
                                                        config.get<string>("Chat.imageGenDescriptionPrompt") + message.getQuestion());

                if (!tempTracker) throw new Error("Failed to get message tracker for image generation prompt.");

                completion = await this.getCompletion(safetyTag, runtimeData, message, tempTracker);
                const imageGenPrompt = completion.getResponseText();
                completion = await this.getImageCompletion(safetyTag, runtimeData, systemPrompt, imageGenPrompt, imageUrls);
            } else {
                const tempTracker = await this.getTracker(runtimeData, message, systemPrompt, imageUrls);

                if (!tempTracker) throw new Error("Failed to get message tracker for user interaction.");
                completion = await this.getCompletion(safetyTag, runtimeData, message, tempTracker);
            }

            const imageData = completion.getResponseImageData();
            const responseText = completion.getResponseText();
        
            if (imageData) {
                runtimeData.logger().logInfo(`LLMBot::handleUserInteraction(): Results contain image data, responding with image.`);
                await LLMBot.replyImage(runtimeData, message, imageData);
            } else if (responseText) {
                runtimeData.logger().logInfo(`LLMBot::handleUserInteraction() Results contain text, replying with text.`);
                await LLMBot.replyText(runtimeData, message, responseText);
            } else {
                throw new Error(`Response has neither text or image data or there was an error retrieving it.`);
            }
        } catch (e) {
            const errMsg = `Failed to process message, got error ${e}`;
            runtimeData.logger().logErrorAsync(`LLMBot::handleUserInteraction(): ${errMsg}`);
            await message.reply(errMsg);
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

        let llmBot = undefined;
        
        // Check if the user is overring the model in the request
        if (message.content.startsWith("/")) {
            try {
                const overrideModel = message.content.split(" ")[0].substring(1);
                if (this.llmBots.has(overrideModel)) {
                    runtimeData.logger().logInfo(`LLMBotManager::onDiscordMessageCreate(): User has overridden AI model in message with ${overrideModel}, using that instead of preferred model ${preferredAiModel}`);
                    llmBot = this.llmBots.get(overrideModel);
                    // Strip the override command from the message content for downstream processing
                    message.content = message.content.substring(overrideModel.length + 2);
                } else {
                    runtimeData.logger().logInfo(`LLMBotManager::onDiscordMessageCreate(): User has overridden AI model in message with ${overrideModel}, but no bot is registered for that model, falling back to preferred model ${preferredAiModel}`);
                }
            } catch (e) {
                runtimeData.logger().logWarning(`LLMBotManager::onDiscordMessageCreate(): Failed to process override model, got error ${e}`);
            }
            
        }

        // Assuming no override, let's use the preferred model
        if (!llmBot) {
            llmBot = LLMBotManager.getLLMBot(preferredAiModel);
        }
        
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
