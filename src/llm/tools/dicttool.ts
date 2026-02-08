import { Dict } from "../../commands/dict.js";

export interface LlmDictToolArgs {
    term: string;
}

export class LlmDictTool {
    public static readonly name = "get_dict_definition";
    public static readonly dictTool = {
        "type": "function",
        "name": LlmDictTool.name,
        "description": "Retrieves a quote or definition and who added it for a slang word or phrase from the chat room dictionary.  Users might sometimes say DICT followed by the slang phrase or word they want to look up.",
        "parameters": {
            "type": "object",
            "properties": {
                "term": {
                    "type": "string",
                    "description": "Word or phrase to get the definition for. If the term is not found, an empty string will be returned."
                }
            },
            "required": ["term"],
            "additionalProperties": false
        },
        "strict": true
    }

    public static getDictDefinition(term: string): string {
        const result = Dict.findDictionaryEntry(term);

        if (result) {
            return `${result.author} added the following definition for "${term}": ${result.definition}`;
        }

        return "";
    }

    public static async execute(args: unknown): Promise<string> {
        const llmDictArgs = args as LlmDictToolArgs;
        
        if (!llmDictArgs.term) {
            throw new Error("LlmDictTool: Missing required argument 'term'");
        }

        const term: string = llmDictArgs.term;
        const definition = LlmDictTool.getDictDefinition(term);
        return definition;
    }
}
