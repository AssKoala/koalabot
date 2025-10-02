import { OpenAiCompletionsV1 } from "./openai_completions_v1_impl.js";
import { GrokHelper } from "../grokhelper.js";

export class GrokCompletions extends OpenAiCompletionsV1 {

    protected override getInterface() {
        return GrokHelper.getInterface();
    }

    public static override create(aiModel, maxMessages, maxTokens, systemPrompt = "You are a helpful assistant.") {
        return new GrokCompletions(aiModel, maxMessages, maxTokens, systemPrompt);
    }
}

OpenAiCompletionsV1.addCompletionsCompatibleApi("grok-2-latest", GrokCompletions.create);
