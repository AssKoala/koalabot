import { LLMToolManager } from "./llmtoolmanager.js";

export class LLMManager {
    private static instance: LLMManager;

    public static init() {
        LLMManager.instance = new LLMManager();
    }

    public static get() {
        return LLMManager.instance;
    }

    private constructor() {
        LLMToolManager.registerDefaults();
    }
}