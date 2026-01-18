import Anthropic from '@anthropic-ai/sdk';
import config from 'config';
import { getCommonLogger } from '../logging/logmanager.js';

class AnthropicHelper {
    private static anthropic = null;

    static init() {
        try {
            const anthropic = new Anthropic({
                apiKey: config.get<string>(`APIKey.anthropic`)
            });

            // @ts-ignore
            AnthropicHelper.anthropic = anthropic;
        }
        catch (e) {
            getCommonLogger().logErrorAsync(`Failed to initialize Anthropic Object, got ${e}`);
        }
    }

    static getInterface() {
        return AnthropicHelper.anthropic;
    }

}

AnthropicHelper.init();

export { AnthropicHelper }
