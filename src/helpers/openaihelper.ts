import { Global } from '../global.js';
import { OpenAI } from 'openai';

class OpenAIHelper {
    static #openai = null;

    static init() {
        try {
            const openai = new OpenAI({
                apiKey: Global.settings().get(`OPENAI_API_KEY`)
            });

            OpenAIHelper.#openai = openai;
        }
        catch (e) {
            Global.logger().logError(`Failed to initialize OpenAI Object, got ${e}`);
        }
    }

    static getInterface() {
        return OpenAIHelper.#openai;
    }

}

OpenAIHelper.init();

export { OpenAIHelper }