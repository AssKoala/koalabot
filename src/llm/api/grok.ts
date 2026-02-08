import { OpenAI } from 'openai';
import { OpenAiApi } from './openai.js';
import config from 'config';
import { getCommonLogger } from '../../logging/logmanager.js';

export class GrokApi {
    private static grok: OpenAI;

    static init() {
        try {
            const grok = new OpenAI({
                apiKey: config.get(`APIKey.grok`),
                baseURL: "https://api.x.ai/v1",
            });

            GrokApi.grok = grok;
        }
        catch (e) {
            getCommonLogger().logErrorAsync(`Failed to initialize OpenAI Object, got ${e}`);
        }
    }

    static getInterface() {
        return GrokApi.grok!;
    }

    static async simpleQuery(aiModel: string, query: string) {
        return OpenAiApi.simpleQuery(aiModel, query);
    }
}
