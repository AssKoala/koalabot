import { Ollama } from 'ollama'
import config from 'config';
import { getCommonLogger } from '../logging/logmanager.js';

class OllamaHelper {
    private static ollama = null;

    static init() {
        try {
            const ollama = new Ollama({ host: config.get<string>(`AiModel.Ollama.serverAddress`) });

            // @ts-ignore
            OllamaHelper.ollama = ollama;
        }
        catch (e) {
            getCommonLogger().logErrorAsync(`Failed to initialize Anthropic Object, got ${e}`);
        }
    }

    static getInterface() {
        return OllamaHelper.ollama;
    }

}

OllamaHelper.init();

export { OllamaHelper }
