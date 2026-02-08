// TODO remove the imports and make this dynamic
import { LlmDictTool } from "./tools/dicttool.js";
import { getCommonLogger } from "../logging/logmanager.js";

type LLMFunctionCallTool = (args:unknown) => Promise<string>;

export interface LLMTool {
    definition: unknown;
    call: LLMFunctionCallTool;
}

export class LLMToolManager {
    private static instance = new LLMToolManager();

    private toolMap: Map<string, LLMTool> = new Map();

    public static registerDefaults(): void {
        LLMToolManager.registerTool(LlmDictTool.dictTool.name, LlmDictTool.dictTool, LlmDictTool.execute);
    }

    public static registerTool(name: string, definition: unknown, tool: LLMFunctionCallTool): void {
        LLMToolManager.instance.toolMap.set(name, { definition: definition, call: tool });
    }

    public static async callTool(name: string, args: unknown): Promise<string> {
        const tool = LLMToolManager.instance.toolMap.get(name);
        if (tool) {
            try {
                return tool.call(args);
            } catch (e) {
                getCommonLogger().logError(`Error calling tool ${name}: ${e}`);
                return "";
            }
            
        } else {
            throw new Error(`Tool ${name} not found`);
        }
    }

    public static hasTool(name: string): boolean {
        return LLMToolManager.instance.toolMap.has(name);
    }

    public static getToolDefinitions(): unknown[] {
        const definitions: unknown[] = [];
        LLMToolManager.instance.toolMap.forEach((tool, _name) => {
            definitions.push(tool.definition);
        });
        return definitions;
    }
}
