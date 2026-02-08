import { KoalaBotSystem } from "../../api/koalabotsystem.js";
import { DiscordMessageCreateListener, WordListener } from "../../api/discordmessagelistener.js";
import { describe, expect, test } from 'vitest'

export class MockKoalaBotSystem implements KoalaBotSystem {
    // @ts-expect-error todo cleanup tech debt
    getConfigVariable(key: string)
    { return null; }

    // @ts-expect-error todo cleanup tech debt
    getLogger()
    { return null; }

    registerDiscordMessageCreateListener(listener: DiscordMessageCreateListener)
    {}

    registerWordListener(listener: WordListener, word: string)
    {}
}

export function GetKoalaBotSystem(): KoalaBotSystem {
    // @ts-expect-error todo cleanup tech debt
    return null;
}

describe("KoalaBotSystem", () => {
    describe("Empty Tests", () => {
        test('fake test', () => {
            //expect(userSettingsManager.get("setting")).toBe(false);
            expect(false).toBe(false);
        });
    });    
});