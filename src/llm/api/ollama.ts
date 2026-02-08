import { Ollama } from 'ollama'
import config from 'config';
import { getCommonLogger } from '../../logging/logmanager.js';

export class OllamaApi {
    private static ollama = null;

    static init() {
        try {
            const ollama = new Ollama({ host: config.get<string>(`AiModel.Ollama.serverAddress`) });

            // @ts-expect-error todo cleanup tech debt
            OllamaApi.ollama = ollama;
        }
        catch (e) {
            getCommonLogger().logErrorAsync(`Failed to initialize Anthropic Object, got ${e}`);
        }
    }

    static getInterface() {
        return OllamaApi.ollama;
    }

    static async simpleQuery(aiModel: string, query: string) {
        throw new Error("Method not implemented.");
    }
}

