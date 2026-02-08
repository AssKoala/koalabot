import { UserSettingsManager, UserSettingsData } from '../../app/user/usersettingsmanager.js';
import { beforeAll, describe, expect, test } from 'vitest'

let userSettingsManager: UserSettingsManager;

const jsonTestSettingsFile = "data/__tests__/test-settings.json";

beforeAll(() => {
    UserSettingsManager.init("willfail.json");
    userSettingsManager = UserSettingsManager.get();
});


describe("UserSettingsManager", () => {
    describe("Empty Tests", () => {
        test('get(username, createNew=false): empty', () => {
            expect(userSettingsManager.get("setting")).toBe(null);
        });
        test('reload(jsonFile): empty', () => {
            expect(userSettingsManager.reload("willfail.json")).toBe(false);
        });
    });
    describe("Load Tests", () => {
        test('reload(jsonFile): valid', () => {
            expect(userSettingsManager.reload(jsonTestSettingsFile)).toBe(true);
        });
    });
    describe("Data Tests", () => {
        test('get(username): existing username', () => {
            expect(userSettingsManager.get("babykoala").weatherSettings.location).toBe("Weston");
        });
        test('get(username): unknown username', () => {
            expect(userSettingsManager.get("unknown").weatherSettings.preferredUnits).toBe("rankine");
        });
        test('set(userSettingsData, false): valid', () => {
            const testData = new UserSettingsData("test", "Test Location", "kelvin");
            expect(userSettingsManager.set(testData, false)).toBe(true);
            expect(userSettingsManager.get("test").weatherSettings.preferredUnits).toBe("kelvin");
        });
    });
});