import { KoalaBotSystem } from "../../api/koalabotsystem.js";
import { MockKoalaBotSystem } from "../../__mocks__/api/mockkoalabotsystem.js";
import { describe, expect, test } from 'vitest'

export function GetKoalaBotSystem(): KoalaBotSystem {
    return new MockKoalaBotSystem();
}

describe("KoalaBotSystem", () => {
    describe("Empty Tests", () => {
        test('fake test', () => {
            expect(false).toBe(false);
        });
    });    
});