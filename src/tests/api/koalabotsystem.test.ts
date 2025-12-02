import { KoalaBotSystem } from "../../api/koalabotsystem.js";
import { DiscordMessageCreateListener, WordListener } from "../../api/discordmessagelistener.js";

export class MockKoalaBotSystem implements KoalaBotSystem {
    // @ts-ignore
    getEnvironmentVariable(key: string)
    { return null; }

    // @ts-ignore
    getLogger()
    { return null; }

    registerDiscordMessageCreateListener(listener: DiscordMessageCreateListener)
    {}

    registerWordListener(listener: WordListener, word: string)
    {}
}

export function GetKoalaBotSystem(): KoalaBotSystem {
    // @ts-ignore
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