import { Global } from '../global.js';
import { Ollama } from 'ollama'

class OllamaHelper {
    private static ollama = null;

    static init() {
        try {
            const ollama = new Ollama({ host: Global.settings().get(`OLLAMA_SERVER_ADDRESS`) });

            OllamaHelper.ollama = ollama;
        }
        catch (e) {
            Global.logger().logErrorAsync(`Failed to initialize Anthropic Object, got ${e}`);
        }
    }

    static getInterface() {
        return OllamaHelper.ollama;
    }

}

OllamaHelper.init();

export { OllamaHelper }
