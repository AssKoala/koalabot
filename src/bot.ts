/*
	"Main" file for the bot that interfaces with discord's API.
*/

// Imports
import { KoalaBotSystemDiscord } from "./bot/KoalaBotSystemDiscord.js";

// LLM Chat Bot (TODO MOVE)
import { OpenAIHelper } from './helpers/openaihelper.js';
import { GrokHelper } from "./helpers/grokhelper.js";
import { GeminiHelper } from "./helpers/geminihelper.js";
import { LLMBotManager } from './llm/llmbot.js';
import { OpenAIBot } from './llm/llmbots/openaibot.js';
import { GrokBot } from './llm/llmbots/grokbot.js';
import { GeminiBot } from "./llm/llmbots/geminibot.js";

import config from 'config';
import { LogManager } from './logging/logmanager.js';

import { DiscordBot } from './platform/discord/discordbot.js'

export class Bot {
    private discordBot!: DiscordBot;
	client() { return this.discordBot.client(); }

	private _koalaBotSystem?: KoalaBotSystemDiscord = undefined;
	koalaBotSystem(): KoalaBotSystemDiscord {
		return this._koalaBotSystem!;
	}

    private static instance: Bot;
    public static get(): Bot { return Bot.instance; }
    public static async init() {
        Bot.instance = new Bot();
        return Bot.instance.init();
    }

	private constructor() {        
	}

	async init() {      
        // Create the discord bot
        this.discordBot = new DiscordBot(LogManager.get().commonLogger);
        await this.discordBot.init(config.get<string>("Discord.token"));

        // Initialize low level systems
        OpenAIHelper.init();
        GrokHelper.init();
        GeminiHelper.init();

        // Create the discord system
        this._koalaBotSystem = new KoalaBotSystemDiscord(LogManager.get().commonLogger);
	}

    public login() {
        this.client().login(config.get<string>("Discord.token"));
    }

    public createSubBots() {
        const availableModels = config.get<string>("Chat.AiModels.availableModels").split(",");
        const enabledModels = config.get<string>("Chat.AiModels.enabledModels").split(",");

        for (const model of availableModels) {
            let llmBot: OpenAIBot | GrokBot | GeminiBot | null = null;

            if (model.startsWith("gpt-5")) {
                llmBot = new OpenAIBot(model);
            } else if (model.startsWith("grok-4")) {
                llmBot = new GrokBot(model);
            } else if (model.startsWith("gemini")) {
                llmBot = new GeminiBot(model);
            } else {
                LogManager.get().commonLogger.logWarning(`Bot::createSubBots(): Unknown LLM model ${model}, skipping registration.`);
                continue;
            }

            LLMBotManager.registerLLMBot(model, llmBot);

            // Enable or disable based on config
            const isEnabled = enabledModels.includes(model);
            LLMBotManager.setLLMBotEnabled(model, isEnabled);
        }
    }
}
