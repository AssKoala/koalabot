import { GetKoalaBotSystem } from '../../api/koalabotsystem.js';
import { DiscordStenographerMessage } from './discordstenographermessage.js';

export class MessageCache
{
    private _messages: DiscordStenographerMessage[] = [];
    private _authorMessageCount: Map<string, number> = new Map<string, number>();
    private _maxEntries: number = Number.MAX_VALUE;

    // @ts-expect-error todo cleanup tech debt
    constructor(maxEntries:number, messages: DiscordStenographerMessage[] = null) {
        this._maxEntries = maxEntries;

        if (messages != null) {
            this.replace(messages);
        }
    }

    replace(messages: DiscordStenographerMessage[]) {
        messages.forEach(message => {
            this.pushMessage(message);
        });
    }

    messages(): DiscordStenographerMessage[] {
        return this._messages;
    }

    getMessageCount(): number {
        return this._messages.length;
    }

    getMessagesCountBy(author: string): number {
        if (!this._authorMessageCount.has(author)) return -1;

        // @ts-expect-error todo cleanup tech debt
        return this._authorMessageCount.get(author);
    }

    maxEntries(): number {
        return this._maxEntries;
    }

    setMaxEntries(maxEntries: number) {
        this._maxEntries = maxEntries;
    }

    pushMessage(msg: DiscordStenographerMessage) {
        try {
            if (!this._authorMessageCount.has(msg.author)) this._authorMessageCount.set(msg.author, 0);

            this._messages.push(msg);
            // @ts-expect-error todo cleanup tech debt
            this._authorMessageCount.set(msg.author, this._authorMessageCount.get(msg.author) + 1);
            this.trimEntries();
        } catch (e) {
            GetKoalaBotSystem().getLogger().logError(`Failed to push message ${msg}, got ${e}`);
        }
    }

    popMessage()
    {
        try {
            if (this.messages().length > 0) {
                var toRet = this.messages()[0];

                // @ts-expect-error todo cleanup tech debt
                this._authorMessageCount.set(toRet.author, this._authorMessageCount.get(toRet.author) - 1);
                this._messages.shift();

                return toRet;
            }
        } catch (e) {
            GetKoalaBotSystem().getLogger().logError(`Failed to pop message, got ${e}`);
        }

        return null;
    }

    trimEntries()
    {
        try {
            while (this.messages().length > this.maxEntries()) {
                this.popMessage();
            }
        } catch (e) {
            GetKoalaBotSystem().getLogger().logError(`Failed to trim entries, got ${e}`);
        }
    }
}
