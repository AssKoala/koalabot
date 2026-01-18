//import * as TikToken from "tiktoken";
import * as Discord from 'discord.js';

export type MessageDataType =
{
    role?: string,
    content?: any,
    type?: string,
    call_id?: string,
    output?: string,
    author?: string,
    image_url?: string,
    parts?: {text: string}[]
};

// const encoder = TikToken.encoding_for_model("gpt-5")

// // Get the number of tokens based on the official api counting
// export function getEstimatedTokens(aiModel: string, message: string): number {
//     try {
//         return encoder.encode(message).length;
//     } catch (e) {
//         console.log("tiktoken encode failed, falling back to rough estimate for token count.");
//         return message.length / 4;
//     }   
// }

export type LLMMessageTrackerGetTokenCountFunction = (message: string) => number;

export class LLMMessageTracker {
    private messageData: MessageDataType[] = [];
    private messageTokens: number = 0;
    private systemPrompt!: string;
    private systemTokens: number = 0;
    private maxTokens: number;
    private maxMessages: number;
    private getTokens: LLMMessageTrackerGetTokenCountFunction = LLMMessageTracker.defaultGetTokenCountFunction;

    static defaultGetTokenCountFunction(message: string): number {
        return Math.ceil(message.length / 4);
    }

    constructor(maxMessages: number = 2048, maxTokens: number = 8192, systemPrompt: string = "", tokenCountFunction: LLMMessageTrackerGetTokenCountFunction = LLMMessageTracker.defaultGetTokenCountFunction) {
        this.maxTokens = maxTokens;
        this.maxMessages = maxMessages;
        this.setSystemPrompt(systemPrompt);
        this.getTokens = tokenCountFunction;
    }

    public getMaxTokens(): number {
        return this.maxTokens;
    }

    public getMaxMessages(): number {
        return this.maxMessages;
    }

    public getSystemPrompt(): string {
        return this.systemPrompt;
    }

    public setSystemPrompt(prompt: string): void {
        this.systemPrompt = prompt;
        this.systemTokens = this.getTokens(prompt);
    }

    public getEstimatedTokens(): number {
        return this.messageTokens + this.systemTokens;
    }

    public getMessageDataRaw() {
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
        const messageTokens = this.getTokens(message);

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

    public pushDiscordMessage(message: Discord.Message) {
        return `${message.author.displayName}<@${message.author.id}>: ${message.content}`;
    }

    public pushMessage(message: MessageDataType, makeSpace: boolean = false): boolean {
        let content = ("content" in message) ? message.content : message.image_url;
        if (!content) { content = ""; }
        const messageTokens = this.getTokens(content);
        
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

    public unshiftMessage(message: MessageDataType, allowEmpty: boolean = false): boolean {
        // TODO: Actually count tokens based on image size, this violates the max tokens config variable right now
        const content = message.image_url || message.content;

        if (content) {            
            const messageTokens = this.getTokens(content);

            if (!this.messageFits(content)) return false;

            this.messageTokens += messageTokens;
            this.messageData.unshift(message);
        } else if (allowEmpty) {
            this.messageData.unshift(message);
        }

        return true;
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