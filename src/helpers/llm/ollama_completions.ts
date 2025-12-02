import { OpenAiCompletionsV1Compatible } from "./openai_completions_v1.js";
import { OllamaHelper } from "../ollamahelper.js";

export class OllamaCompletions extends OpenAiCompletionsV1Compatible {
    
    public async getCompletion(): Promise<any> {
        // @ts-ignore
        return OllamaHelper.getInterface().chat.completions.create({
            model: this.getAiModel,
            messages: this.getMessageDataRaw(),
            system: this.getSystemPrompt(),
            max_tokens: this.getMaxTokens()
        });
    }

    public async getCompletionText(): Promise<string> {
        return (await this.getCompletion()).message.content;
    }

    public static create(aiModel: string, maxMessages: number, maxTokens: number, systemPrompt = "You are a helpful assistant.") {
        return new OllamaCompletions(aiModel, maxMessages, maxTokens, systemPrompt);
    }
}

OpenAiCompletionsV1Compatible.addCompletionsCompatibleApi("ollama", OllamaCompletions.create);
