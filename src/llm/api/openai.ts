import { OpenAI } from 'openai';
import config from 'config';
import { getCommonLogger } from '../../logging/logmanager.js';

export class OpenAiApi {
    private static openai: OpenAI;

    static init() {
        try {
            const openai = new OpenAI({
                apiKey: config.get(`APIKey.openai`)
            });

            OpenAiApi.openai = openai;
        }
        catch (e) {
            getCommonLogger().logErrorAsync(`Failed to initialize OpenAI Object, got ${e}`);
        }
    }

    static getInterface() {
        return OpenAiApi.openai;
    }

    static async simpleQuery(aiModel: string, query: string) {
        const completion = await this.getInterface().chat.completions.create({
            model: aiModel,
            messages: [
                { "role": "system", "content": config.get("Chat.systemPrompt") },
                { "role": "user", "content": query }
            ]
        });

        return completion;
    }
}
