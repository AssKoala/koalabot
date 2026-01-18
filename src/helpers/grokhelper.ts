import { OpenAI } from 'openai';
import config from 'config';
import { getCommonLogger } from '../logging/logmanager.js';

class GrokHelper {
    private static grok: OpenAI;

    static init() {
        try {
            const grok = new OpenAI({
                apiKey: config.get(`APIKey.grok`),
                baseURL: "https://api.x.ai/v1",
            });

            // @ts-ignore
            GrokHelper.grok = grok;
        }
        catch (e) {
            getCommonLogger().logErrorAsync(`Failed to initialize OpenAI Object, got ${e}`);
        }
    }

    static getInterface() {
        return GrokHelper.grok!;
    }
}

export { GrokHelper }