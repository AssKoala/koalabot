import { OpenAiCompletionsV1Compatible } from "./openai_completions_v1.js";
import { AnthropicHelper } from '../anthropichelper.js';

export class AnthropicCompletions extends OpenAiCompletionsV1Compatible {
    
    public async getCompletion(): Promise<any> {
        // @ts-ignore
        return AnthropicHelper.getInterface().chat.completions.create({
            model: "claude-3-5-sonnet-20240620",
            max_tokens: this.getMaxTokens(),
            system: this.getSystemPrompt(),
            messages: this.getMessageDataRaw(),
        });
    }

    public async getCompletionText(): Promise<string> {
        return (await this.getCompletion()).content[0].text;
    }

    public static create(aiModel: string, maxMessages: number, maxTokens: number, systemPrompt = "You are a helpful assistant.") {
        return new AnthropicCompletions(aiModel, maxMessages, maxTokens, systemPrompt);
    }
}

OpenAiCompletionsV1Compatible.addCompletionsCompatibleApi("claude-3.5-sonnet", AnthropicCompletions.create);
