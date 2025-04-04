import { Global } from '../global.js';
import Anthropic from '@anthropic-ai/sdk';

class AnthropicHelper {
    private static anthropic = null;

    static init() {
        try {
            const anthropic = new Anthropic({
                apiKey: Global.settings().get(`ANTHROPIC_API_KEY`)
            });

            AnthropicHelper.anthropic = anthropic;
        }
        catch (e) {
            Global.logger().logErrorAsync(`Failed to initialize Anthropic Object, got ${e}`);
        }
    }

    static getInterface() {
        return AnthropicHelper.anthropic;
    }

}

AnthropicHelper.init();

export { AnthropicHelper }
