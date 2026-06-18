import { OpenAI } from 'openai';
import config from 'config';
import { getCommonLogger } from '../../logging/logmanager.js';

export class OpenAiApi {
    private static openai: OpenAI;
    private static openaiOss: OpenAI | undefined;   // HACK.GptOssBaseUrl

    static init() {
        try {
            const openai = new OpenAI({
                apiKey: config.get(`APIKey.openai`)
            });

            OpenAiApi.openai = openai;

            // BEGIN HACK.GptOssBaseUrl
            if (config.has(`Developer.Hacks.openAiOssBaseUrl`)) {
                const openaiOss = new OpenAI({
                    apiKey: config.get(`Developer.Hacks.openAiOssApiKey`),
                    baseURL: config.get(`Developer.Hacks.openAiOssBaseUrl`)
                });

                OpenAiApi.openaiOss = openaiOss;
            }
            // END HACK.GptOssBaseUrl
        }
        catch (e) {
            getCommonLogger().logErrorAsync(`Failed to initialize OpenAI Object, got ${e}`);
        }
    }

    static getInterface(aiModel?: string): OpenAI {
        // BEGIN HACK.GptOssBaseUrl
        if (aiModel && aiModel.includes("gpt-oss") && OpenAiApi.openaiOss) {
            return OpenAiApi.openaiOss;
        }
        // END HACK.GptOssBaseUrl
        return OpenAiApi.openai;
    }

    static async simpleQuery(aiModel: string, query: string) {
        const completion = await this.getInterface(aiModel).chat.completions.create({
            model: aiModel,
            messages: [
                { "role": "system", "content": config.get("Chat.systemPrompt") },
                { "role": "user", "content": query }
            ]
        });

        return completion;
    }
}
