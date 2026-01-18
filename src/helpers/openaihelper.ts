import { OpenAI } from 'openai';
import config from 'config';
import { getCommonLogger } from '../logging/logmanager.js';

class OpenAIHelper {
    private static openai: OpenAI;

    static init() {
        try {
            const openai = new OpenAI({
                apiKey: config.get(`APIKey.openai`)
            });

            OpenAIHelper.openai = openai;
        }
        catch (e) {
            getCommonLogger().logErrorAsync(`Failed to initialize OpenAI Object, got ${e}`);
        }
    }

    static getInterface() {
        return OpenAIHelper.openai;
    }

    static async simpleQuery(aiModel: string, query: string) {
        const completion = await OpenAIHelper.getInterface().chat.completions.create({
            model: aiModel,
            messages: [
                { "role": "user", "content": query }
            ]
        });

        return completion;
    }

}

export { OpenAIHelper }