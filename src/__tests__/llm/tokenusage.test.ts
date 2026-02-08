import { vi, describe, test, expect, beforeEach } from 'vitest';

// =============================================================================
// Mock all heavy dependencies that the LLM bot source files pull in.
// vi.mock() calls are hoisted by Vitest, so order here doesn't matter.
// Paths are relative from this test file to the modules as imported by source.
// =============================================================================

// -- Shared dependencies (used by llmbot.ts, openaibot.ts, grokbot.ts, geminibot.ts) --
vi.mock('../../llm/llmmessagetracker.js', () => ({
    LLMMessageTracker: vi.fn(),
}));
vi.mock('../../api/discordbotruntimedata.js', () => ({
    DiscordBotRuntimeData: vi.fn(),
}));
vi.mock('../../api/discordmessagelistener.js', () => ({
    DiscordMessageCreateListener: vi.fn(),
}));
vi.mock('../../app/stenographer/discordstenographer.js', () => ({
    Stenographer: { getChannelMessages: vi.fn().mockReturnValue([]) },
}));
vi.mock('../../app/stenographer/discordstenographermessage.js', () => ({
    DiscordStenographerMessage: vi.fn(),
}));
vi.mock('../../performancecounter.js', () => ({
    PerformanceCounter: { Create: vi.fn() },
}));
vi.mock('../../llm/llminteractionmessage.js', () => ({
    LLMInteractionMessage: vi.fn(),
    LLMInteractionMessageFactory: { createFromDiscordMessage: vi.fn() },
}));
vi.mock('../../llm/interactionmessages/discordinteractionmessageimpl.js', () => ({}));
vi.mock('../../llm/llmtoolmanager.js', () => ({
    LLMToolManager: { callTool: vi.fn(), getToolDefinitions: vi.fn().mockReturnValue([]) },
}));
vi.mock('../../llm/tools/dicttool.js', () => ({
    LlmDictTool: vi.fn(),
}));
vi.mock('../../commands/dict.js', () => ({
    Dict: vi.fn(),
}));
vi.mock('../../listenermanager.js', () => ({
    ListenerManager: { registerMessageCreateListener: vi.fn() },
    ListenerPriority: {},
}));
vi.mock('../../app/user/usersettingsmanager.js', () => ({
    UserSettingsManager: { get: vi.fn().mockReturnValue({ get: vi.fn() }) },
}));
vi.mock('../../logging/logmanager.js', () => ({
    getCommonLogger: () => ({
        logInfo: vi.fn(),
        logErrorAsync: vi.fn(),
        logError: vi.fn(),
        logDebug: vi.fn(),
        logWarning: vi.fn(),
    }),
}));
vi.mock('../../db/databasemanager.js', () => ({
    DatabaseManager: { isAvailable: () => false },
}));
vi.mock('../../db/llmusagerepository.js', () => ({
    LLMUsageRepository: { insert: vi.fn() },
}));
vi.mock('config', () => ({
    default: { get: vi.fn(), has: vi.fn() },
}));
vi.mock('discord.js', () => ({
    default: {},
    AttachmentBuilder: vi.fn(),
    EmbedBuilder: vi.fn(),
}));

// -- OpenAI-specific --
vi.mock('../../llm/api/openai.js', () => ({
    OpenAiApi: { getInterface: vi.fn(), simpleQuery: vi.fn() },
}));
vi.mock('openai', () => ({
    default: { OpenAI: { Responses: {} } },
    OpenAI: { Responses: {} },
}));
vi.mock('tiktoken', () => ({
    encoding_for_model: vi.fn().mockReturnValue({ encode: vi.fn().mockReturnValue([]) }),
}));

// -- Grok-specific --
vi.mock('@ai-sdk/xai', () => ({
    createXai: vi.fn(),
}));
vi.mock('ai', () => ({
    generateText: vi.fn(),
}));
vi.mock('../../llm/api/grok.js', () => ({
    GrokApi: { getInterface: vi.fn() },
}));

// -- Gemini-specific --
vi.mock('../../llm/api/gemini.js', () => ({
    GeminiApi: { getInterface: vi.fn() },
}));
vi.mock('@google/genai', () => ({
    default: {},
    createPartFromUri: vi.fn(),
    GenerateContentResponse: vi.fn(),
}));
vi.mock('mime', () => ({
    default: { getType: vi.fn() },
}));
vi.mock('../../sys/fs.js', () => ({
    FsUtils: { downloadToBuffer: vi.fn() },
}));

// -- KoalaBot interface (imported by discordinteractionmessageimpl) --
vi.mock('../../koala-bot-interface/koala-slash-command.js', () => ({
    KoalaSlashCommandRequest: vi.fn(),
}));

// =============================================================================
// Import AFTER all mocks are defined
// =============================================================================
import { OpenAIResponse } from '../../llm/llmbots/openaibot.js';
import { GrokResponse } from '../../llm/llmbots/grokbot.js';
import { GeminiResponse } from '../../llm/llmbots/geminibot.js';

// =============================================================================
// OpenAIResponse tests
// =============================================================================
describe('OpenAIResponse', () => {
    describe('getTokenUsage()', () => {
        test('returns token counts when usage has both fields', () => {
            const response = new OpenAIResponse({
                usage: { input_tokens: 100, output_tokens: 50 },
            });

            expect(response.getTokenUsage()).toEqual({
                promptTokens: 100,
                completionTokens: 50,
            });
        });

        test('returns null values when usage exists but tokens are undefined', () => {
            const response = new OpenAIResponse({
                usage: {},
            });

            expect(response.getTokenUsage()).toEqual({
                promptTokens: null,
                completionTokens: null,
            });
        });

        test('returns null when response has no usage property', () => {
            const response = new OpenAIResponse({});

            expect(response.getTokenUsage()).toBeNull();
        });

        test('returns null when usage is explicitly undefined', () => {
            const response = new OpenAIResponse({ usage: undefined });

            expect(response.getTokenUsage()).toBeNull();
        });

        test('returns null when usage is null', () => {
            const response = new OpenAIResponse({ usage: null });

            expect(response.getTokenUsage()).toBeNull();
        });

        test('accumulates tokens with priorTokenUsage', () => {
            const response = new OpenAIResponse({
                usage: { input_tokens: 100, output_tokens: 50 },
            });
            response.addPriorTokenUsage({ promptTokens: 200, completionTokens: 30 });

            expect(response.getTokenUsage()).toEqual({
                promptTokens: 300,
                completionTokens: 80,
            });
        });

        test('treats null current tokens as 0 when accumulating with priorTokenUsage', () => {
            const response = new OpenAIResponse({
                usage: {},
            });
            response.addPriorTokenUsage({ promptTokens: 200, completionTokens: 30 });

            expect(response.getTokenUsage()).toEqual({
                promptTokens: 200,
                completionTokens: 30,
            });
        });

        test('treats null prior tokens as 0 when accumulating', () => {
            const response = new OpenAIResponse({
                usage: { input_tokens: 100, output_tokens: 50 },
            });
            response.addPriorTokenUsage({ promptTokens: null, completionTokens: null });

            expect(response.getTokenUsage()).toEqual({
                promptTokens: 100,
                completionTokens: 50,
            });
        });

        test('returns null fields when both current and prior tokens are null', () => {
            const response = new OpenAIResponse({
                usage: {},
            });
            response.addPriorTokenUsage({ promptTokens: null, completionTokens: null });

            expect(response.getTokenUsage()).toEqual({
                promptTokens: null,
                completionTokens: null,
            });
        });

        test('returns priorTokenUsage when current response has no usage', () => {
            const response = new OpenAIResponse({});
            response.addPriorTokenUsage({ promptTokens: 200, completionTokens: 30 });

            expect(response.getTokenUsage()).toEqual({
                promptTokens: 200,
                completionTokens: 30,
            });
        });

        test('returns null when no usage and no priorTokenUsage', () => {
            const response = new OpenAIResponse({});

            expect(response.getTokenUsage()).toBeNull();
        });
    });

    describe('addPriorTokenUsage()', () => {
        test('does nothing when passed null', () => {
            const response = new OpenAIResponse({
                usage: { input_tokens: 100, output_tokens: 50 },
            });
            response.addPriorTokenUsage(null);

            // Should return base usage without accumulation
            expect(response.getTokenUsage()).toEqual({
                promptTokens: 100,
                completionTokens: 50,
            });
        });

        test('sets priorTokenUsage when passed valid usage', () => {
            const response = new OpenAIResponse({
                usage: { input_tokens: 10, output_tokens: 5 },
            });
            response.addPriorTokenUsage({ promptTokens: 90, completionTokens: 45 });

            expect(response.getTokenUsage()).toEqual({
                promptTokens: 100,
                completionTokens: 50,
            });
        });
    });
});

// =============================================================================
// GrokResponse tests
// =============================================================================
describe('GrokResponse', () => {
    describe('getTokenUsage()', () => {
        test('returns token counts when usage exists', () => {
            const response = new GrokResponse({
                usage: { promptTokens: 100, completionTokens: 50 },
            });

            expect(response.getTokenUsage()).toEqual({
                promptTokens: 100,
                completionTokens: 50,
            });
        });

        test('returns null when response has no usage', () => {
            const response = new GrokResponse({});

            expect(response.getTokenUsage()).toBeNull();
        });

        test('returns null when usage is undefined', () => {
            const response = new GrokResponse({ usage: undefined });

            expect(response.getTokenUsage()).toBeNull();
        });

        test('returns null values when usage exists but token counts are undefined', () => {
            const response = new GrokResponse({
                usage: {},
            });

            expect(response.getTokenUsage()).toEqual({
                promptTokens: null,
                completionTokens: null,
            });
        });

        test('returns partial values when only promptTokens is present', () => {
            const response = new GrokResponse({
                usage: { promptTokens: 100 },
            });

            expect(response.getTokenUsage()).toEqual({
                promptTokens: 100,
                completionTokens: null,
            });
        });

        test('returns partial values when only completionTokens is present', () => {
            const response = new GrokResponse({
                usage: { completionTokens: 50 },
            });

            expect(response.getTokenUsage()).toEqual({
                promptTokens: null,
                completionTokens: 50,
            });
        });
    });
});

// =============================================================================
// GeminiResponse tests
// =============================================================================
describe('GeminiResponse', () => {
    describe('getTokenUsage()', () => {
        test('returns token counts when usageMetadata exists', () => {
            const response = new GeminiResponse({
                usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
            } as any);

            expect(response.getTokenUsage()).toEqual({
                promptTokens: 100,
                completionTokens: 50,
            });
        });

        test('returns null when response has no usageMetadata', () => {
            const response = new GeminiResponse({} as any);

            expect(response.getTokenUsage()).toBeNull();
        });

        test('returns null when usageMetadata is undefined', () => {
            const response = new GeminiResponse({ usageMetadata: undefined } as any);

            expect(response.getTokenUsage()).toBeNull();
        });

        test('returns null values when usageMetadata exists but token counts are undefined', () => {
            const response = new GeminiResponse({
                usageMetadata: {},
            } as any);

            expect(response.getTokenUsage()).toEqual({
                promptTokens: null,
                completionTokens: null,
            });
        });

        test('returns partial values when only promptTokenCount is present', () => {
            const response = new GeminiResponse({
                usageMetadata: { promptTokenCount: 100 },
            } as any);

            expect(response.getTokenUsage()).toEqual({
                promptTokens: 100,
                completionTokens: null,
            });
        });

        test('returns partial values when only candidatesTokenCount is present', () => {
            const response = new GeminiResponse({
                usageMetadata: { candidatesTokenCount: 50 },
            } as any);

            expect(response.getTokenUsage()).toEqual({
                promptTokens: null,
                completionTokens: 50,
            });
        });
    });
});
