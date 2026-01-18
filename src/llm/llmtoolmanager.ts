// TODO remove the imports and make this dynamic
import { LlmDictTool } from "./tools/dicttool.js";

type LLMFunctionCallTool = (args:any) => Promise<string>;
export interface LLMTool {
    definition: any;
    call: LLMFunctionCallTool;
}

export class LLMToolManager {
    private static instance = new LLMToolManager();

    private toolMap: Map<string, LLMTool> = new Map();

    public static registerDefaults(): void {
        LLMToolManager.registerTool(LlmDictTool.dictTool.name, LlmDictTool.dictTool, LlmDictTool.execute);
    }

    public static registerTool(name: string, definition: any, tool: LLMFunctionCallTool): void {
        LLMToolManager.instance.toolMap.set(name, { definition: definition, call: tool });
    }

    public static async callTool(name: string, args: any): Promise<string> {
        const tool = LLMToolManager.instance.toolMap.get(name);
        if (tool) {
            return tool.call(args);
        } else {
            throw new Error(`Tool ${name} not found`);
        }
    }

    public static hasTool(name: string): boolean {
        return LLMToolManager.instance.toolMap.has(name);
    }

    public static getToolDefinitions(): any[] {
        const definitions: any[] = [];
        LLMToolManager.instance.toolMap.forEach((tool, name) => {
            definitions.push(tool.definition);
        });
        return definitions;
    }
}
