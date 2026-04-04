import { LLMMessageTracker } from '../llmmessagetracker.js'
import { DiscordBotRuntimeData } from '../../api/discordbotruntimedata.js'
import { LLMCompletion, LLMGeneratedImageData } from "../llmbot.js";
import { createXai } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { PerformanceCounter } from "../../performancecounter.js";
import config from 'config';
import { GrokApi } from '../../llm/api/grok.js';
import { OpenAIBot } from './openaibot.js';
import { LLMInteractionMessage } from '../llminteractionmessage.js';
import { getCommonLogger } from '../../logging/logmanager.js';
import { NetUtils } from '../../sys/net.js';

class GrokImageData implements LLMGeneratedImageData {
    imageBytes: Buffer;
    prompt: string;

    constructor(prompt: string, image: Buffer) {
        this.imageBytes = image;
        this.prompt = prompt;
    }
}

export class GrokResponse implements LLMCompletion {
    private response: unknown;
    private imageData: LLMGeneratedImageData | undefined;

    constructor(completion: unknown, imageData: LLMGeneratedImageData | undefined = undefined) {
        this.response = completion;
        this.imageData = imageData;
    }

    getResponseRaw(): unknown {
        return this.response;
    }

    getResponseImageData(): LLMGeneratedImageData | undefined {
        return this.imageData;
    }

    getResponseText(): string {
        try {
            interface GrokTextResponse {
                text: string;
            }

            const messageData = (this.response as GrokTextResponse).text;

            if (messageData.length > 0) {
                return messageData;
            }
        } catch { 
            getCommonLogger().logError("GrokResponse::getResponseText(): Failed to parse response text from Grok response.");
        }

        return "";
    }
}

export class GrokBot extends OpenAIBot {
    private readonly xai;
    
    constructor(aiModel: string, enabled: boolean = false) {
        super(aiModel, enabled);
        this.xai = createXai({
            apiKey: config.get<string>("APIKey.grok")
        });
    }

    protected override hasAutomaticImageGeneration(): boolean { 
        return false;
    }

    protected override async getImageCompletion(runtimeData: DiscordBotRuntimeData, systemPrompt: string, promptText: string, imageInputUrls: string[]): Promise<LLMCompletion> {
        if (imageInputUrls.length > 0) {
            runtimeData.logger().logWarning("GrokBot::getImageCompletion(): Grok does not currently support image inputs for generation.");
        }

        const completion = await GrokApi.getInterface().images.generate({
            model: config.get<string>("AiModel.Grok.imageAiModel"),
            prompt: promptText,
        });

        const imageBuf = await NetUtils.downloadFromUrl(completion.data![0].url!, completion.data![0].revised_prompt!);
        if (!imageBuf) {
            throw new Error("GrokBot::getImageCompletion(): Failed to download generated image from Grok.");
        }

        const imageData = new GrokImageData(promptText, imageBuf);
        return new GrokResponse(completion, imageData);
    }

    protected override async getVisionContent(promptText: string, imageUrls: string[]): Promise<unknown[]> {
        interface ImageContentType {
            type: "text" | "image";
            text?: string;
            image?: URL;
        }

        const content: ImageContentType[] = [];

        content.push({
            type: "text",
            text: promptText
        });
        imageUrls.forEach(imageUrl => {
            content.push({
                type: "image",
                image: new URL(imageUrl)
            });
        });

        return content;
    }

    protected override async getOpenAICompletion(runtimeData: DiscordBotRuntimeData, tracker: LLMMessageTracker): Promise<GrokResponse> {
        using perfCounter = PerformanceCounter.Create("GrokBot::getOpenAICompletion(): ");
        runtimeData.logger().logInfo("GrokBot::getOpenAICompletion(): Sending request to OpenAI Responses API...");

        const completion = await generateText({
            model:  this.xai(this.aiModel),
            system: tracker.getSystemPrompt(),
            prompt: tracker.getMessageDataRaw() as any, // eslint-disable-line @typescript-eslint/no-explicit-any 
        });

        runtimeData.logger().logInfo("GrokBot::getCompletion(): Received response from Grok OpenAI Completions Endpoint.");
        return new GrokResponse(completion);
    }

    protected override async getCompletion(runtimeData: DiscordBotRuntimeData, _message: LLMInteractionMessage, tracker: LLMMessageTracker) { 
        using perfCounter = PerformanceCounter.Create("GrokBot::getCompletion(): ");

        const completion = await this.getOpenAICompletion(runtimeData, tracker);
        
        // Copy response for future context
        tracker.pushMessage(completion.getResponseRaw());

        // TODO Image gen support
        // TODO Tool support
        
        return completion;
    }
}
