import { OpenAiCompletionsV1Compatible } from "./openai_completions_v1.js";
import { OpenAiApi } from '../../llm/api/openai.js';

export class OpenAiCompletionsV1 extends OpenAiCompletionsV1Compatible {
    
    protected getInterface() {
        return OpenAiApi.getInterface();
    }

    public async getCompletion(): Promise<any> {
        // Add in system prompt without destroying this object for reuse
        const compData = [...this.getMessageDataRaw()];
        compData.unshift({
            "role": "system",
            "content": this.getSystemPrompt()
        });

        return this.getInterface().chat.completions.create({
                    model: this.getAiModel(),
                    // @ts-expect-error todo cleanup tech debt
                    messages: compData
                });
    }

    public async getCompletionText() {
        return (await this.getCompletion()).choices[0].message.content;
    }

    // @ts-expect-error todo cleanup tech debt
    public static create(aiModel, maxMessages, maxTokens, systemPrompt =  "You are a helpful assistant.") {
        return new OpenAiCompletionsV1(aiModel, maxMessages, maxTokens, systemPrompt);
    }
}

OpenAiCompletionsV1Compatible.addCompletionsCompatibleApi("gpt-5-chat-latest", OpenAiCompletionsV1.create);
OpenAiCompletionsV1Compatible.addCompletionsCompatibleApi("chatgpt-4o-latest", OpenAiCompletionsV1.create);
OpenAiCompletionsV1Compatible.addCompletionsCompatibleApi("gpt-4o", OpenAiCompletionsV1.create);
OpenAiCompletionsV1Compatible.addCompletionsCompatibleApi("gpt-4-turbo", OpenAiCompletionsV1.create);
