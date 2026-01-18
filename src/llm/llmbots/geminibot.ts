import { GeminiHelper } from "../../helpers/geminihelper.js";
import { LLMBot, LLMCompletion, LLMGeneratedImageData } from "../llmbot.js";
import { DiscordBotRuntimeData } from '../../api/discordbotruntimedata.js'
import { LLMMessageTracker, LLMMessageTrackerGetTokenCountFunction } from '../llmmessagetracker.js'
import { Stenographer } from "../../app/stenographer/discordstenographer.js";
import { PerformanceCounter } from "../../performancecounter.js";
import * as Discord from 'discord.js'
import config from 'config'
import * as GoogleGenAI from "@google/genai"

export class GeminiResponse implements LLMCompletion {
    private readonly response: GoogleGenAI.GenerateContentResponse;
    private imagePrompt: string;

    constructor(response: GoogleGenAI.GenerateContentResponse, imagePrompt: string = "") {
        this.response = response;
        this.imagePrompt = imagePrompt;
    }

    getResponseImageData(): LLMGeneratedImageData | undefined {
        try {
            let text = "";
            let imageBytes;

            for (const part of this.response!.candidates![0]!.content!.parts!) {
                if (part.text) {
                    text = part.text;
                } else if (part.inlineData) {
                    const imageData = part.inlineData.data!;
                    const buffer = Buffer.from(imageData, "base64");
                    imageBytes = buffer;
                }
            }

            if (imageBytes) {
                return {
                    prompt: this.imagePrompt,
                    imageBytes: imageBytes!
                }
            }
        } catch {

        }
        
        return undefined;
    }

    getResponseRaw() {
        return this.response;
    }

    getResponseText(): string {
        try {
            return this.response.text!;
        } catch {
            return "";
        }
    }
}

export class GeminiBot extends LLMBot {
    constructor(aiModel: string, enabled: boolean = false) {
        super(aiModel, enabled);
    }

    protected override async getGeneralRequestTracker(runtimeData: DiscordBotRuntimeData, message: Discord.Message, systemPrompt: string): Promise<LLMMessageTracker> {
        const tempTracker = new LLMMessageTracker(
                                config.get("Chat.maxMessages"),
                                config.get("Chat.maxTokenCount"),
                                systemPrompt,
                                this.getTokenCountFunction(runtimeData));
                                    
        // Regular chat request
        // Stenographer runs before all others, this includes the user's question as the most recent message
        Stenographer.getChannelMessages(message.channelId).slice().reverse().every(entry => {
            if (entry.imageUrl.length != 0) return true;    // Skip any images

            const role = entry.authorId == runtimeData.bot().client().user!.id ? "model" : "user";
            const content = entry.getStandardDiscordMessageFormat();

            const apiMessageData = {
                "role": role,
                "parts": [{ text: content}]
            };
                
            if (!tempTracker.unshiftMessage(apiMessageData, true)) {
                return false; // If we can't fit the message, stop processing
            }

            return true;
        });

        return tempTracker;
    }

    protected override getVisionContent(promptText: string, imageUrls: string[]): any[] {
        throw new Error("not implemented");
    }

    protected override async getCompletion(runtimeData: DiscordBotRuntimeData, tracker: LLMMessageTracker): Promise<LLMCompletion> {
        const genai = GeminiHelper.getInterface();
    
        // We need to strip off the last element to use for the chat itself
        const prompt = tracker.popMessage();

        const chat = genai.chats.create({
            model: this.aiModel,
            history: tracker.getMessageDataRaw()
        });

        const response = await chat.sendMessage({
            message: prompt!.parts![0].text!
        });

        return new GeminiResponse(response);
    }

    protected override async getImageCompletion(runtimeData: DiscordBotRuntimeData, systemPrompt: string, promptText: string, imageInputUrls: string[]): Promise<LLMCompletion> {
        const genai = GeminiHelper.getInterface();

        const response = await genai.models.generateContent({
            model: config.get("AiModel.Gemini.imageAiModel"),
            contents: promptText
        });

        return new GeminiResponse(response, promptText);
    }

    protected override hasAutomaticImageGeneration(): boolean {
        return false;
    }

    protected override async isMessageRequestForImageGeneration(runtimeData: DiscordBotRuntimeData, message: Discord.Message): Promise<boolean> {
        using perfCounter = PerformanceCounter.Create("GeminiBot::isMessageRequestForImageGeneration(): ");

        try {
            const genai = GeminiHelper.getInterface();
            const prompt = `Does the following statement appear to be a request for image generation, respond yes or no only`;

            const response = await genai.models.generateContent({
                model: this.aiModel,
                contents: `${prompt}: ${message.content}`
            });

            return response.text!.toLowerCase().includes('yes');
        } catch (e) {
            runtimeData.logger().logError("OpenAIBot::isMessageRequestForImageGeneration(): Failed to run isMessageRequest, falling back to no.");
        }

        return false;
    }
}
