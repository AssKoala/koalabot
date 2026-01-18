import { GoogleGenAI } from "@google/genai"
import config from 'config'
import { getCommonLogger } from '../logging/logmanager.js';

class GeminiHelper {
    private static genai: GoogleGenAI;

    static init() {
        try {
            const genai = new GoogleGenAI({
                apiKey: config.get(`APIKey.gemini`)
            });

            GeminiHelper.genai = genai;
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to initialize GoogleGenAI Object, got ${e}`);
        }
    }

    static getInterface() {
        return GeminiHelper.genai;
    }
}

export { GeminiHelper }