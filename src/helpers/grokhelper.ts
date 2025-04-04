import { Global } from '../global.js';
import { OpenAI } from 'openai';

class GrokHelper {
    private static grok = null;

    static init() {
        try {
            const grok = new OpenAI({
                apiKey: Global.settings().get(`GROK_API_KEY`),
                baseURL: "https://api.x.ai/v1",
            });

            GrokHelper.grok = grok;
        }
        catch (e) {
            Global.logger().logErrorAsync(`Failed to initialize OpenAI Object, got ${e}`);
        }
    }

    static getInterface() {
        return GrokHelper.grok;
    }
}

GrokHelper.init();

export { GrokHelper }