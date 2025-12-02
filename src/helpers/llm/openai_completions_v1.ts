import { get_encoding, encoding_for_model, TiktokenModel } from "tiktoken";

export type MessageDataType =
{
    role?: string,
    content?: string
    type?: string,
    call_id?: string,
    output?: string,
};

export type ApiCreateFunction = (aiModel: string, maxMessages: number, maxTokens: number, systemPrompt?: string) => OpenAiCompletionsV1Compatible;

export abstract class OpenAiCompletionsV1Compatible {
    private static completionsCompatibleApis: Map<string, ApiCreateFunction> = new Map();

    public static addCompletionsCompatibleApi(aiModel: string, createFunc: ApiCreateFunction) {
        this.completionsCompatibleApis.set(aiModel, createFunc);
    }

    public static getCompletionsCompatibleApi(aiModel: string): ApiCreateFunction {
        // @ts-ignore
        return this.completionsCompatibleApis.get(aiModel);
    }

    public static getEstimatedTokens(aiModel: string, message: string): number {
        return message.length / 4;
    }

    // Everyone just needs to implement this
    abstract getCompletion(): Promise<any>;
    abstract getCompletionText(): Promise<string>;

    // Shared methods for all LLMs that are compatible with the OpenAI Completions API v1
    protected messageData: MessageDataType[] = [];
    protected messageTokens: number = 0;
    // @ts-ignore
    protected systemPrompt: string;
    protected systemTokens: number = 0;
    protected maxTokens: number;
    protected maxMessages: number;
    protected aiModel: string;

    // @ts-ignore
    protected constructor(aiModel, maxMessages, maxTokens, systemPrompt) {
        this.aiModel = aiModel;
        this.maxTokens = maxTokens;
        this.maxMessages = maxMessages;
        this.setSystemPrompt(systemPrompt);
    }

    public getMaxTokens(): number {
        return this.maxTokens;
    }

    public getMaxMessages(): number {
        return this.maxMessages;
    }

    public getAiModel(): string {
        return this.aiModel;
    }

    public getSystemPrompt(): string {
        return this.systemPrompt;
    }

    // @ts-ignore
    public setSystemPrompt(prompt): void {
        this.systemPrompt = prompt;
        this.systemTokens = OpenAiCompletionsV1Compatible.getEstimatedTokens(this.getAiModel(), prompt);
    }

    public getEstimatedTokens(): number {
        return this.messageTokens + this.systemTokens;
    }

    protected getMessageDataRaw() {
        return this.messageData;
    }

    public isFull(): boolean {
        return this.getMessageCount() >= this.maxMessages 
            || this.getEstimatedTokens() >= this.maxTokens;
    }

    public canAddMessage(): boolean {
        return this.getMessageCount() < this.maxMessages;
    }

    public messageFits(message: string): boolean {
        const messageTokens = OpenAiCompletionsV1Compatible.getEstimatedTokens(this.getAiModel(), message);

        if (this.getMessageCount() + 1 > this.maxMessages) {
            return false; // Too many messages
        }

        if (this.getEstimatedTokens() + messageTokens >= this.maxTokens) {
            return false; // Too many tokens
        }

        return true;
    }

    public popMessage(): MessageDataType | undefined {
        return this.messageData.pop();
    }

    public shiftMessage(): MessageDataType | undefined {
        return this.messageData.shift();
    }

    public pushMessage(message: MessageDataType, makeSpace: boolean = false): boolean {
        let content = ("content" in message) ? message.content : message.output;
        if (!content) { content = ""; }
        const messageTokens = OpenAiCompletionsV1Compatible.getEstimatedTokens(this.getAiModel(), content);
        
        while (!this.messageFits(content) && this.messageData.length > 0) {
            if (makeSpace) {
                this.messageData.shift();
            } else {
                return false;
            }
        }

        this.messageTokens += messageTokens;
        this.messageData.push(message);
        return true;
    }

    public unshiftMessage(message: MessageDataType): boolean {
        // @ts-ignore
        const messageTokens = OpenAiCompletionsV1Compatible.getEstimatedTokens(this.getAiModel(), message.content);

        // @ts-ignore
        if (this.messageFits(message.content)) {
            this.messageTokens += messageTokens;
            this.messageData.unshift(message);
            return true; 
        }

        return false;
    }

    public getMessageCount(): number {
        let tally = 0;

        // Don't forget to include system prompt
        if (this.getSystemPrompt()) {
            tally++;
        }

        return this.messageData.length + tally;
    }
}
