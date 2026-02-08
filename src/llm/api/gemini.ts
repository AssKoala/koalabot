import { GoogleGenAI } from "@google/genai"
import config from 'config'
import { getCommonLogger } from '../../logging/logmanager.js';

export class GeminiApi {
    private static genai: GoogleGenAI;

    static init() {
        try {
            const genai = new GoogleGenAI({
                apiKey: config.get(`APIKey.gemini`)
            });

            this.genai = genai;
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to initialize GoogleGenAI Object, got ${e}`);
        }
    }

    static getInterface() {
        return this.genai;
    }

    static async simpleQuery(aiModel: string, query: string) { 
        const completion = await GeminiApi.getInterface().models.generateContent({
            model: aiModel,
            config: {
                systemInstruction: config.get("Chat.systemPrompt")
            },
            contents: query
        });

        return completion;
    }
}
