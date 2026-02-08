import { OpenAiCompletionsV1 } from "./openai_completions_v1_impl.js";
import { GrokApi } from "../../llm/api/grok.js";

export class GrokCompletions extends OpenAiCompletionsV1 {

    protected override getInterface() {
        return GrokApi.getInterface();
    }

    public static override create(aiModel: string, maxMessages: number, maxTokens: number, systemPrompt = "You are a helpful assistant.") {
        return new GrokCompletions(aiModel, maxMessages, maxTokens, systemPrompt);
    }
}

OpenAiCompletionsV1.addCompletionsCompatibleApi("grok-2-latest", GrokCompletions.create);
