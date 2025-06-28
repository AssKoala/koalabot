import { KoalaBotSystem } from "../../api/koalabotsystem.js";
import { DiscordMessageCreateListener, WordListener } from "../../api/discordmessagelistener.js";

export class MockKoalaBotSystem implements KoalaBotSystem {
    getEnvironmentVariable(key: string)
    { return null; }

    getLogger()
    { return null; }

    registerDiscordMessageCreateListener(listener: DiscordMessageCreateListener)
    {}

    registerWordListener(listener: WordListener, word: string)
    {}
}

export function GetKoalaBotSystem(): KoalaBotSystem {
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