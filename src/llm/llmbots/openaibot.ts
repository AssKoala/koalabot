import { LLMMessageTracker } from '../llmmessagetracker.js'
import { DiscordBotRuntimeData } from '../../api/discordbotruntimedata.js'
import { LLMBot, LLMCompletion, LLMGeneratedImageData } from "../llmbot.js";
import { OpenAIHelper } from '../../helpers/openaihelper.js';
import { Stenographer } from '../../app/stenographer/discordstenographer.js';
import { PerformanceCounter } from "../../performancecounter.js";
import * as TikToken from "tiktoken";
import config from 'config';
import * as Discord from 'discord.js';

export class OpenAIResponse implements LLMCompletion {
    private response: any;

    constructor(response: any) {
        this.response = response;
    }

    getResponseRaw(): any {
        return this.response;
    }

    getResponseImageData(): LLMGeneratedImageData | undefined {
        try {
            const imageCompletion = this.response.output
                    .filter((output: any) => output.type === "image_generation_call");

            const imageData = imageCompletion[0].result;
            const prompt = imageCompletion[0].revised_prompt;

            if (imageData.length > 0) {
                const imageBase64 = imageData;
                const imageBytes = Buffer.from(imageBase64, "base64");

                return { imageBytes, prompt };
            }
        } catch {
            return undefined;
        }
    }

    getResponseText(): string {
        try {
            const messageData = this.response.output.filter((output: any) => output.type === "message")[0].content[0].text;

            if (messageData.length > 0) {
                return messageData;
            }
        } catch {
            console.error("Error extracting message text from response");
        }

        return "";
    }
}

export class OpenAIBot extends LLMBot {
    private readonly tokenEncoder?;

    constructor(aiModel: string, enabled: boolean = false) {
        super(aiModel, enabled);
        try {
            this.tokenEncoder = TikToken.encoding_for_model("gpt-5");   // TODO: use aiModel, but the encoding type safety is stupid
        } catch (e) {
            throw new Error(`Failed to create tiktoken encoder for aiModel(${this.aiModel}), will fall back to estimate`);
            this.tokenEncoder = undefined;
        }
    }

    protected override hasAutomaticImageGeneration(): boolean { 
        return true;
    }

    protected async isMessageRequestForImageGeneration(runtimeData: DiscordBotRuntimeData, message: Discord.Message) {
        using perfCounter = PerformanceCounter.Create("OpenAIBot::isMessageRequestForImageGeneration(): ");

        try {
            const prompt = `Does the following statement appear to be a request for image generation, respond yes or no only`;
    
            const completion = await OpenAIHelper.simpleQuery(config.get("Chat.aiModelNano"), `${prompt}: ${message.content}`);
            const responseText = completion.choices[0].message.content!;

            return responseText.toLowerCase().includes('yes');
        } catch (e) {
            runtimeData.logger().logError("OpenAIBot::isMessageRequestForImageGeneration(): Failed to run isMessageRequest, falling back to no.");
        }

        return false;
    }

    protected override getTokenCount(runtimeData: DiscordBotRuntimeData, message: string): number {
        try {
            if (this.tokenEncoder) {
                return this.tokenEncoder.encode(message).length;
            }
        } catch (e) {
            runtimeData.logger().logInfo("OpenAIBot::getTokenCount(${message}): Failed to encode message, falling back to rough estimate.");
        }

        return super.getTokenCount(runtimeData, message);
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

    protected override getVisionContent(promptText: string, imageUrls: string[]): any[] {
        const content: any[] = [];

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

        let tools = this.getTools();
        
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

        const completion = await OpenAIHelper.getInterface().responses.create({
            model: this.aiModel,
            instructions: tracker.getSystemPrompt(),
            input: tracker.getMessageDataRaw() as any, 
            tool_choice: "auto",
            tools: tools
        });

        runtimeData.logger().logInfo("getCompletion(): Received response from OpenAI Responses API.");
        return new OpenAIResponse(completion);
    }

    protected override async getImageCompletion(runtimeData: DiscordBotRuntimeData, systemPrompt: string, promptText: string, imageInputUrls: string[] = []): Promise<LLMCompletion> {
        using perfCounter = PerformanceCounter.Create("OpenAIBot::getImageCompletion(): ");
        runtimeData.logger().logInfo("OpenAIBot::getImageCompletion(): Sending request to OpenAI Responses API...");

        const content: any[] = [];

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

        const completion = await OpenAIHelper.getInterface().responses.create({
            model: this.aiModel,
            instructions: systemPrompt,
            input: [{ role: "user", content: content }],
            tool_choice: "auto",
            tools: [
                { type: "image_generation" }
            ]
        });

        runtimeData.logger().logInfo("getImageCompletion(): Received response from OpenAI Responses API.");
        return new OpenAIResponse(completion);
    }

    protected override async getCompletion(runtimeData: DiscordBotRuntimeData, tracker: LLMMessageTracker): Promise<LLMCompletion> { 
        using perfCounter = PerformanceCounter.Create("OpenAIBot::getCompletion(): ");

        let completion = await this.getOpenAICompletion(runtimeData, tracker);
        
        // Copy all responses into the input for future context
        completion.getResponseRaw().output.forEach((item: any) => {
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
                try {
                    runtimeData.logger().logInfo(`OpenAIBot::getCompletion(): OpenAI returned completion with web search.`);
                } catch (e) {

                }
                break;

            default:
                runtimeData.logger().logInfo(`No handler defined for tool call type: ${toolCall.type}`);
                break;
            }
        };

        // If we made a function call, need to get a new completion with the tool output
        if (madeFunctionCall) {
            completion = await this.getOpenAICompletion(runtimeData, tracker);

            // Copy all responses into the input for future context
            completion.getResponseRaw().output.forEach((item: any) => {
                tracker.pushMessage(item);
            });
        }
        
        return completion;
    }
}
