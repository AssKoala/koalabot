import Anthropic from '@anthropic-ai/sdk';
import config from 'config';
import { getCommonLogger } from '../../logging/logmanager.js';

export class AnthropicApi {
    private static anthropic = null;

    static init() {
        try {
            const anthropic = new Anthropic({
                apiKey: config.get<string>(`APIKey.anthropic`)
            });

            // @ts-expect-error todo cleanup tech debt
            AnthropicApi.anthropic = anthropic;
        }
        catch (e) {
            getCommonLogger().logErrorAsync(`Failed to initialize Anthropic Object, got ${e}`);
        }
    }

    static getInterface() {
        return AnthropicApi.anthropic;
    }

    static async simpleQuery(aiModel: string, query: string) {
        throw new Error("Method not implemented.");
    }

}

AnthropicApi.init();
