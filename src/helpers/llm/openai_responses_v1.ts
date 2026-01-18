import { OpenAIHelper } from '../openaihelper.js';
import { OpenAiCompletionsV1Compatible, MessageDataType } from './openai_completions_v1.js';
import { ImageDownloadedFileInfo, SystemHelpers } from '../systemhelpers.js';
import { LlmDictTool } from '../../llm/tools/dicttool.js';

export interface GeneratedImageData {
    imageBytes: Buffer;
    revisedPrompt: string;
}

export class OpenAIResponsesV1CompatibleResponse {
    private response: any;
    private api: OpenAIResponsesV1Compatible;

    // @ts-ignore
    constructor(api, response) {
        this.response = response;
        this.api = api;
    }

    public getResponse(): any {
        return this.response;
    }

    public getApi() {
        return this.api;
    }

    public getImageData(): GeneratedImageData | undefined {
        try {
            const imageCompletion = this.response.output
                    // @ts-ignore
                    .filter((output) => output.type === "image_generation_call");

            const imageData = imageCompletion[0].result;
            const revisedPrompt = imageCompletion[0].revised_prompt;

            if (imageData.length > 0) {
                const imageBase64 = imageData;
                const imageBytes = Buffer.from(imageBase64, "base64");

                return { imageBytes, revisedPrompt };
            }
        } catch {
            return undefined;
        }
    }

    public getMessageText(): string {
        try {
            // @ts-ignore
            const messageData = this.response.output.filter((output) => output.type === "message")[0].content[0].text;

            if (messageData.length > 0) {
                return messageData;
            }
        } catch {
            
        }

        return "";
    }
}

export abstract class OpenAIResponsesV1Compatible extends OpenAiCompletionsV1Compatible {
     public abstract override getCompletion(): Promise<OpenAIResponsesV1CompatibleResponse>;
}

export class OpenAIResponsesV1 extends OpenAiCompletionsV1Compatible {

    public async getCompletion(): Promise<OpenAIResponsesV1CompatibleResponse> {
        // @ts-ignore
        const completion = await OpenAIHelper.getInterface().responses.create({
            model: this.getAiModel(),
            instructions: this.getSystemPrompt(),
            input: this.getMessageDataRaw(),
            tool_choice: "auto",
            tools: [
                { type: "image_generation" },
                LlmDictTool.dictTool
            ]
        });

        return new OpenAIResponsesV1CompatibleResponse(this, completion);
    }

    public async getCompletionText(): Promise<string> {
        const completion = await this.getCompletion();
        return completion.getMessageText();
    }

    public static create(aiModel: string, maxMessages: number, maxTokens: number, systemPrompt = "You are a helpful assistant."): OpenAIResponsesV1Compatible {
        return new OpenAIResponsesV1(aiModel, maxMessages, maxTokens, systemPrompt);
    }
}

OpenAiCompletionsV1Compatible.addCompletionsCompatibleApi("gpt-5.2", OpenAIResponsesV1.create);
OpenAiCompletionsV1Compatible.addCompletionsCompatibleApi("gpt-5.1", OpenAIResponsesV1.create);
OpenAiCompletionsV1Compatible.addCompletionsCompatibleApi("gpt-5", OpenAIResponsesV1.create);
