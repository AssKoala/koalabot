//import * as TikToken from "tiktoken";
import * as Discord from 'discord.js';

// export type MessageDataType =
// {
//     // general
//     author?: string,

//     // openai / grok
//     role?: string,
//     content?: unknown,
//     type?: string,
//     call_id?: string,
//     output?: string,
//     image_url?: string,
    
//     // gemini
//     parts?: {text: string}[],
//     inlineData?: unknown[],
//     contents?: unknown,
// };

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

// Internal Types
type MessageBasicType = {
    content?: unknown;
    image_url?: string;
}

export class LLMMessageTracker {
        
    private messageData: unknown[] = [];
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

    public popMessage(): unknown | undefined {
        return this.messageData.pop();
    }

    public shiftMessage(): unknown | undefined {
        return this.messageData.shift();
    }

    public pushDiscordMessage(message: Discord.Message) {
        return `${message.author.displayName}<@${message.author.id}>: ${message.content}`;
    }

    public pushMessage(message: unknown, makeSpace: boolean = false): boolean {
        const messageBasic = message as MessageBasicType;

        let content = ("content" in messageBasic) ? messageBasic.content : messageBasic.image_url;
        if (!content) { content = ""; }
        const messageTokens = this.getTokens(content as string);
        
        while (!this.messageFits(content as string) && this.messageData.length > 0) {
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

    public unshiftMessage(message: unknown, allowEmpty: boolean = false): boolean {
        // TODO: Actually count tokens based on image size, this violates the max tokens config variable right now
        const content = (message as MessageBasicType).image_url || (message as MessageBasicType).content;

        if (content) {            
            const messageTokens = this.getTokens(content as string);

            if (!this.messageFits(content as string)) return false;

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