import { GeminiApi } from "../../llm/api/gemini.js";
import { LLMBot, LLMCompletion, LLMGeneratedImageData } from "../llmbot.js";
import { DiscordBotRuntimeData } from '../../api/discordbotruntimedata.js'
import { LLMMessageTracker } from '../llmmessagetracker.js'
import { Stenographer } from "../../app/stenographer/discordstenographer.js";
import { PerformanceCounter } from "../../performancecounter.js";
import { FsUtils } from "../../sys/fs.js";
import config from 'config'
import * as GoogleGenAI from "@google/genai"
import mime from 'mime';
import { getCommonLogger } from "../../logging/logmanager.js";
import { LLMInteractionMessage } from "../llminteractionmessage.js";

export class GeminiResponse implements LLMCompletion {
    private readonly response: GoogleGenAI.GenerateContentResponse;
    private imagePrompt: string;

    constructor(response: GoogleGenAI.GenerateContentResponse, imagePrompt: string = "") {
        this.response = response;
        this.imagePrompt = imagePrompt;
    }

    getResponseImageData(): LLMGeneratedImageData | undefined {
        try {
            let _text = "";
            let imageBytes;

            for (const part of this.response!.candidates![0]!.content!.parts!) {
                if (part.text) {
                    _text = part.text;
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
        } catch (e) {
            getCommonLogger().logError(`GeminiResponse::getResponseImageData(): Failed to parse image data from response, returning undefined. Error: ${e}`);
        }
        
        return undefined;
    }

    getResponseRaw() {
        return this.response;
    }

    getResponseText(): string {
        try {
            return this.response.text!;
        } catch (e) {
            getCommonLogger().logError(`GeminiResponse::getResponseText(): Failed to get response text, returning empty string. Error: ${e}`);
            return "";
        }
    }
}

class DownloadedImage {
    buffer: Buffer;
    mimeType: string;

    constructor(buffer: Buffer, mimeType: string) {
        this.buffer = buffer;
        this.mimeType = mimeType;
    }
}

export class GeminiBot extends LLMBot {
    constructor(aiModel: string, enabled: boolean = false) {
        super(aiModel, enabled);
    }

    protected override async getGeneralRequestTracker(runtimeData: DiscordBotRuntimeData, message: LLMInteractionMessage, systemPrompt: string): Promise<LLMMessageTracker> {
        const tempTracker = new LLMMessageTracker(
                                config.get("Chat.maxMessages"),
                                config.get("Chat.maxTokenCount"),
                                systemPrompt,
                                this.getTokenCountFunction(runtimeData));
                                    
        // Regular chat request
        // Stenographer runs before all others, this includes the user's question as the most recent message
        Stenographer.getChannelMessages(message.getChannelId()).slice().reverse().every(entry => {
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

    protected override async getVisionRequestTracker(runtimeData: DiscordBotRuntimeData, message: LLMInteractionMessage, systemPrompt: string, imageUrls: string[]): Promise<LLMMessageTracker>
    {
        if (imageUrls.length > config.get<number>("Chat.ImageVision.maxImages")) {
            throw new Error(`Too many images provided (${imageUrls.length}), Chat.ImageVision.maxImages is currently ${config.get("Chat.ImageVision.maxImages")}.`);
        }

        if (message.getQuestion().trim().length == 0) {
            throw new Error(`No prompt text provided with image(s), please provide a prompt describing what you want.`);
        }

        const tempTracker = new LLMMessageTracker(
                                config.get("Chat.maxMessages"),
                                config.get("Chat.maxTokenCount"),
                                systemPrompt,
                                this.getTokenCountFunction(runtimeData));
        // Get all images
        const images: string[] = [];

        imageUrls.forEach(url => {
            images.push(url);
        });

        const content = await this.getVisionContent(message.getQuestion(), images);

        // Push all to tracker
        tempTracker.unshiftMessage({
            contents: content,
        }, true);

        return tempTracker;
    }

    private async downloadImages(imageUrls: string[]): Promise<DownloadedImage[]> {
        const downloads: Promise<Buffer | undefined>[] = [];
        const mimeTypes: (string|null)[] = [];

        imageUrls.forEach(url => {
            downloads.push(FsUtils.downloadToBuffer(url));
            mimeTypes.push(mime.getType(url.split('?')[0]));
        });

        const downloadedImages: DownloadedImage[] = [];
        for (let i = 0; i < downloads.length; i++) {
            const buf = await downloads[i] as unknown as Buffer;
            const mimeType = mimeTypes[i];

            if (buf && mimeType) {
                downloadedImages.push(new DownloadedImage(buf, mimeType));
            }
        };

        return downloadedImages;
    }

    protected override async getVisionContent(promptText: string, imageUrls: string[]): Promise<unknown[]> {
        const downloads: Promise<Buffer | undefined>[] = [];
        const mimeTypes: (string|null)[] = [];

        imageUrls.forEach(url => {
            downloads.push(FsUtils.downloadToBuffer(url));
            mimeTypes.push(mime.getType(url.split('?')[0]));
        });

        type InlineDataType = {
            data: string,
            mimeType: string,
        };

        const inlineData: InlineDataType[] = [];
        for (let i = 0; i < downloads.length; i++) {
            const buf = await downloads[i] as unknown as Buffer;
            const mimeType = mimeTypes[i];

            if (buf && mimeType) {
                const base64data = buf.toString('base64');
                inlineData.push({
                    data: base64data,
                    mimeType: mimeType
                });
            }
        };

        const uploadFunc = GeminiApi.getInterface().files.upload;
        type UploadedFileType = Awaited<ReturnType<typeof uploadFunc>>;

        const uploadedFiles: UploadedFileType[] = [];

        // We start at 1 so we always send index 0 as the inline data and the rest as uploads
        for (let i = 1; i < inlineData.length; i++) {
            const uploadedFile = await uploadFunc({
                file: inlineData[i].data,
                config: { mimeType: mimeTypes[i]! },
            });
            uploadedFiles.push(uploadedFile);
        }

        let contents: unknown[] = [];

        uploadedFiles.forEach((uploadedFile) => {
            if (uploadedFile.uri && uploadedFile.mimeType) {
                contents.push(GoogleGenAI.createPartFromUri(uploadedFile.uri, uploadedFile.mimeType));
            }
        });

        contents = [
            ...contents,
            {
                inlineData: inlineData[0],
            },
            {
                text: promptText
            }
        ];

        return contents;
    }

    protected override async getCompletion(runtimeData: DiscordBotRuntimeData, _message: LLMInteractionMessage, tracker: LLMMessageTracker): Promise<LLMCompletion> {
        const genai = GeminiApi.getInterface();
    
        // We need to strip off the last element to use for the chat itself
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prompt = tracker.popMessage() as any;
        let geminiResponse: GeminiResponse;

        if (prompt && prompt.contents && prompt?.contents.length > 0) {
            // Vision request
            const response = await genai.models.generateContent({
                model: this.aiModel,
                contents: prompt.contents,
                config: {
                    systemInstruction: tracker.getSystemPrompt()
                },
            });

            geminiResponse = new GeminiResponse(response);
        } else {
            const chat = genai.chats.create({
                model: this.aiModel,
                history: tracker.getMessageDataRaw() as GoogleGenAI.Content[],
                config: {
                    systemInstruction: tracker.getSystemPrompt()
                },
            });

            const response = await chat.sendMessage({
                message: prompt!.parts![0].text!
            });

            geminiResponse = new GeminiResponse(response);
        }

        return geminiResponse;
    }

    protected override async getImageCompletion(runtimeData: DiscordBotRuntimeData, systemPrompt: string, promptText: string, _imageInputUrls: string[]): Promise<LLMCompletion> {
        const genai = GeminiApi.getInterface();

        const response = await genai.models.generateContent({
            model: config.get("AiModel.Gemini.imageAiModel"),
            contents: promptText,
            config: {
                systemInstruction: systemPrompt
            },
        });

        return new GeminiResponse(response, promptText);
    }

    protected override hasAutomaticImageGeneration(): boolean {
        return false;
    }

    protected override async isMessageRequestForImageGeneration(runtimeData: DiscordBotRuntimeData, message: LLMInteractionMessage): Promise<boolean> {
        using perfCounter = PerformanceCounter.Create("GeminiBot::isMessageRequestForImageGeneration(): ");

        try {
            const genai = GeminiApi.getInterface();
            const prompt = `Does the following statement appear to be a request for image generation, respond yes or no only`;

            const response = await genai.models.generateContent({
                model: this.aiModel,
                contents: `${prompt}: ${message.getQuestion()}`
            });

            return response.text!.toLowerCase().includes('yes');
        } catch (e) {
            runtimeData.logger().logError(`OpenAIBot::isMessageRequestForImageGeneration(): Failed to run isMessageRequest, falling back to no. Got ${e}`);
        }

        return false;
    }
}
