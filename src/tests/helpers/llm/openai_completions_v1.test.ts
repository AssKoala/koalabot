import { OpenAiCompletionsV1Compatible } from "../../../helpers/llm/openai_completions_v1.js"

class OpenAiCompletionsV1Test extends OpenAiCompletionsV1Compatible {
    public constructor(model: string, maxEntries: number, maxTokens: number, systemPrompt: string) {
        super(model, maxEntries, maxTokens, systemPrompt);
    }

    getCompletion(): Promise<any> {
        return Promise.resolve("Test completion");
    }

    getCompletionText(): Promise<string> {
        return Promise.resolve("Test completion text");
    }

    public setMaxMessages(maxMessages: number): void {
        this.maxMessages = maxMessages;
    }

    public setMaxTokens(maxTokens: number): void {
        this.maxTokens = maxTokens;
    }
}

let mockApi: OpenAiCompletionsV1Test = null;
const constants = {
    MAX_MESSAGES: 10,
    MAX_TOKENS: 1000,
    SYSTEM_PROMPT: "You are a test assistant.",
    AI_MODEL: "test-model"
};

const userMessage = {
    role: "user",
    content: "This is a test message."
}

const callMessage = {
    role: "assistant",
    type: "function_call",
    call_id: "12345",
    output: "This is a test call output."
}

beforeEach(() => {
    mockApi = new OpenAiCompletionsV1Test(
        constants.AI_MODEL, 
        constants.MAX_MESSAGES, 
        constants.MAX_TOKENS, 
        constants.SYSTEM_PROMPT
    );
});

afterEach(() => {
    mockApi = null;
});

describe("OpenAiCompletionsV1Compatible", () => {
    describe("Simple Initialization", () => {
        test('Empty state', () => {
            expect(mockApi.getMaxMessages()).toBe(constants.MAX_MESSAGES);
            expect(mockApi.getMaxTokens()).toBe(constants.MAX_TOKENS);
            expect(mockApi.getSystemPrompt()).toBe(constants.SYSTEM_PROMPT);
            expect(mockApi.getAiModel()).toBe(constants.AI_MODEL);
            expect(mockApi.getMessageCount()).toBe(1); // Includes system prompt
        });
    });
    describe("Message Handling", () => {

        test('Empty state', () => {
            expect(mockApi.canAddMessage()).toBe(true);
            expect(mockApi.isFull()).toBe(false);
            expect(mockApi.popMessage()).toBeUndefined();
            expect(mockApi.shiftMessage()).toBeUndefined();
        });

        test('Add user message', () => {
            expect(mockApi.pushMessage(userMessage)).toBe(true);
            expect(mockApi.getMessageCount()).toBe(2); // Includes system prompt
            expect(mockApi.getEstimatedTokens()).toBeGreaterThan(0);
        });

        test('Overflow messages (by tokens)', () => {
            mockApi.setMaxTokens(20);
            for (let i = 0; i < constants.MAX_MESSAGES; i++) {
                const message = { role: "user", content: `Message ${i}` };
                const added = mockApi.pushMessage(message);

                if (!added) {
                    expect(mockApi.messageFits(message.content)).toBe(false);
                    break;
                }
            }
            expect(mockApi.canAddMessage()).toBe(true);
        });

        test('Overflow messages (by count)', () => {
            const newMax = 4;

            mockApi.setMaxMessages(newMax);
            
            // -1 because the system prompt counts as a message
            for (let i = 0; i < newMax - 1; i++) {
                const message = { role: "user", content: `Message ${i}` };
                const added = mockApi.pushMessage(message);

                expect(added).toBe(true);
            }
            expect(mockApi.canAddMessage()).toBe(false);
        });
        
    });
});
