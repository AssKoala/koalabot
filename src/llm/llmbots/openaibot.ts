import { LLMMessageTracker } from '../llmmessagetracker.js'
import { DiscordBotRuntimeData } from '../../api/discordbotruntimedata.js'
import { LLMBot, LLMCompletion, LLMGeneratedImageData, LLMTokenUsage } from "../llmbot.js";
import { OpenAiApi } from '../api/openai.js';
import { Stenographer } from '../../app/stenographer/discordstenographer.js';
import { PerformanceCounter } from "../../performancecounter.js";
import * as TikToken from "tiktoken";
import config from 'config';
import { LLMInteractionMessage } from '../llminteractionmessage.js';
import * as OpenAiSdk from 'openai';

interface ImageContentType {
    type: "input_text" | "input_image";
    text?: string;
    image_url?: string;
}

export class OpenAIResponse implements LLMCompletion {
    private response: OpenAiSdk.OpenAI.Responses.Response;
    private priorTokenUsage: LLMTokenUsage | null = null;

    constructor(response: unknown) {
        this.response = response as OpenAiSdk.OpenAI.Responses.Response;
    }

    addPriorTokenUsage(usage: LLMTokenUsage | null): void {
        if (!usage) return;
        this.priorTokenUsage = usage;
    }

    getResponseRaw(): unknown {
        return this.response;
    }

    getResponseImageData(): LLMGeneratedImageData | undefined {
        try {
            // Find the image gen call
            for (let i = 0; i < this.response.output.length; ++i) {
                if (this.response.output[i].type === "image_generation_call") {
                    type OpenAiImageCompletionType = {
                        result: string;   // base64 image data
                        revised_prompt: string;
                    }
                    const imageCompletion = this.response.output[i] as unknown as OpenAiImageCompletionType;

                    const imageData = imageCompletion.result;
                    const prompt = imageCompletion.revised_prompt;

                    if (imageData.length > 0) {
                        const imageBase64 = imageData;
                        const imageBytes = Buffer.from(imageBase64, "base64");

                        return { imageBytes, prompt };
                    }
                    break;
                }
            }            
        } catch {
            return undefined;
        }
    }

    getResponseText(): string {
        try {
            for (let i = 0; i < this.response.output.length; ++i) {
                if (this.response.output[i].type === "message") {
                    const openAiMsg = this.response.output[i] as unknown as OpenAiSdk.OpenAI.Responses.EasyInputMessage;
                    const messageData = (openAiMsg.content[0] as OpenAiSdk.OpenAI.Responses.ResponseInputText).text;

                    if (messageData.length > 0) {
                        return messageData;
                    }
                }
            }
        } catch {
            console.error("Error extracting message text from response");
        }

        return "";
    }

    getTokenUsage(): LLMTokenUsage | null {
        try {
            const usage = this.response.usage;
            if (usage) {
                const base: LLMTokenUsage = {
                    promptTokens: usage.input_tokens ?? null,
                    completionTokens: usage.output_tokens ?? null
                };
                if (this.priorTokenUsage) {
                    return {
                        promptTokens: (base.promptTokens ?? 0) + (this.priorTokenUsage.promptTokens ?? 0),
                        completionTokens: (base.completionTokens ?? 0) + (this.priorTokenUsage.completionTokens ?? 0)
                    };
                }
                return base;
            }
        } catch { }
        return this.priorTokenUsage;
    }
}

export class OpenAIBot extends LLMBot {
    private readonly tokenEncoder?;

    constructor(aiModel: string, enabled: boolean = false) {
        super(aiModel, enabled);
        try {
            this.tokenEncoder = TikToken.encoding_for_model("gpt-5");   // TODO: use aiModel, but the encoding type safety is stupid
        } catch {
            throw new Error(`Failed to create tiktoken encoder for aiModel(${this.aiModel}), will fall back to estimate`);
        }
    }

    protected override hasAutomaticImageGeneration(): boolean { 
        return true;
    }

    protected async isMessageRequestForImageGeneration(runtimeData: DiscordBotRuntimeData, message: LLMInteractionMessage) {
        using perfCounter = PerformanceCounter.Create("OpenAIBot::isMessageRequestForImageGeneration(): ");

        try {
            const prompt = `Does the following statement appear to be a request for image generation, respond yes or no only`;
    
            const completion = await OpenAiApi.simpleQuery(config.get("Chat.aiModelNano"), `${prompt}: ${message.getQuestion()}`);
            const responseText = completion.choices[0].message.content!;

            return responseText.toLowerCase().includes('yes');
        } catch (e) {
            runtimeData.logger().logError(`OpenAIBot::isMessageRequestForImageGeneration(): Failed to run isMessageRequest, falling back to no. Got: ${e}`);
        }

        return false;
    }

    protected override getTokenCount(runtimeData: DiscordBotRuntimeData, message: string): number {
        try {
            if (this.tokenEncoder) {
                return this.tokenEncoder.encode(message).length;
            }
        } catch (e) {
            runtimeData.logger().logDebug(`OpenAIBot::getTokenCount(${message}): Failed to encode message, falling back to rough estimate. Got: ${e}`);
        }

        return super.getTokenCount(runtimeData, message);
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

            const role = entry.authorId == runtimeData.bot().client().user!.id ? "assistant" : "user";
            const content = entry.getStandardDiscordMessageFormat();

            const apiMessageData = {
                "role": role,
                "content": content
            };
                
            if (!tempTracker.unshiftMessage(apiMessageData)) {
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

        if (message.getQuestion()?.trim().length == 0) {
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
            "role": "user",
            "content": content
        });

        return tempTracker;
    }

    protected override async getVisionContent(promptText: string, imageUrls: string[]): Promise<unknown[]> {
        const content: ImageContentType[] = [];

        content.push({
            type: "input_text",
            text: promptText
        });
        imageUrls.forEach(imageUrl => {
            content.push({
                type: "input_image",
                image_url: imageUrl
            });
        });

        return content;
    }

    protected async getOpenAICompletion(runtimeData: DiscordBotRuntimeData, tracker: LLMMessageTracker): Promise<LLMCompletion> {
        using perfCounter = PerformanceCounter.Create("OpenAIBot::getOpenAICompletion(): ");
        runtimeData.logger().logInfo("OpenAIBot::getOpenAICompletion(): Sending request to OpenAI Responses API...");

        let tools = this.getTools() as OpenAiSdk.OpenAI.Responses.Tool[]; // Pulling the tool types is more trouble than its worth
        
        if (config.get("Chat.ImageGeneration.enable")) {
            tools = [
                { type: "image_generation" },
                ...tools
            ];
        }

        if (config.get("Chat.WebSearch.enable")) {
            tools = [
                { type: "web_search" },
                ...tools
            ];
        }

        const completion = await OpenAiApi.getInterface().responses.create({
            model: this.aiModel,
            instructions: tracker.getSystemPrompt(),
            input: tracker.getMessageDataRaw() as any,  // eslint-disable-line @typescript-eslint/no-explicit-any
            tool_choice: "auto",
            tools: tools
        });

        runtimeData.logger().logInfo("getCompletion(): Received response from OpenAI Responses API.");
        return new OpenAIResponse(completion);
    }

    protected override async getImageCompletion(runtimeData: DiscordBotRuntimeData, systemPrompt: string, promptText: string, imageInputUrls: string[] = []): Promise<LLMCompletion> {
        using perfCounter = PerformanceCounter.Create("OpenAIBot::getImageCompletion(): ");
        runtimeData.logger().logInfo("OpenAIBot::getImageCompletion(): Sending request to OpenAI Responses API...");

        const content: ImageContentType[] = [];

        content.push({
            type: "input_text",
            text: promptText
        });
        imageInputUrls.forEach(imageUrl => {
            content.push({
                type: "input_image",
                image_url: imageUrl
            });
        });

        const completion = await OpenAiApi.getInterface().responses.create({
            model: this.aiModel,
            instructions: systemPrompt,
            input: 
            [
                { role: "user", content: (content as any[]) }   // eslint-disable-line @typescript-eslint/no-explicit-any
            ],
            tool_choice: "auto",
            tools: [
                { type: "image_generation" }
            ]
        });

        runtimeData.logger().logInfo("getImageCompletion(): Received response from OpenAI Responses API.");
        return new OpenAIResponse(completion);
    }

    protected override async getCompletion(runtimeData: DiscordBotRuntimeData, _message: LLMInteractionMessage, tracker: LLMMessageTracker): Promise<LLMCompletion> { 
        using perfCounter = PerformanceCounter.Create("OpenAIBot::getCompletion(): ");

        let completion = await this.getOpenAICompletion(runtimeData, tracker);
        
        // Copy all responses into the input for future context
        completion.getResponseRaw().output.forEach((item: unknown) => {
            tracker.pushMessage(item);
        });

        // Check for and handle tool calls
        let madeFunctionCall = false;   // Completion needs to be re-run if a tool call is requested

        for (let i = 0; i < completion.getResponseRaw().output.length; ++i) {
            const toolCall = completion.getResponseRaw().output[i];

            // If its a function call, need to call the tool and pass in the output
            switch (toolCall.type) {
                case "function_call":
                    try
                    {
                        const name = toolCall.name;
                        const args = JSON.parse(toolCall.arguments);
                    
                        const result = await this.callTool(name, args);
                        madeFunctionCall = true;

                        tracker.pushMessage({
                            type: "function_call_output",
                            call_id: toolCall.call_id,
                            output: result.toString()
                        });
                    } catch (e) {
                        runtimeData.logger().logError(`OpenAIBot::getCompletion(): Failed to call tool ${toolCall.name}, got error ${e}`);
                    }
                break;

            case "image_generation_call":
                runtimeData.logger().logInfo(`OpenAIBot::getCompletion(): OpenAI returned completion with image data.`);
                break;
            
            case "web_search_call":
                runtimeData.logger().logInfo(`OpenAIBot::getCompletion(): OpenAI returned completion with web search.`);
                break;

            default:
                runtimeData.logger().logInfo(`No handler defined for tool call type: ${toolCall.type}`);
                break;
            }
        };

        // If we made a function call, need to get a new completion with the tool output
        if (madeFunctionCall) {
            const firstUsage = completion.getTokenUsage();
            completion = await this.getOpenAICompletion(runtimeData, tracker);
            (completion as OpenAIResponse).addPriorTokenUsage(firstUsage);

            // Copy all responses into the input for future context
            completion.getResponseRaw().output.forEach((item: unknown) => {
                tracker.pushMessage(item);
            });
        }
        
        return completion;
    }
}
