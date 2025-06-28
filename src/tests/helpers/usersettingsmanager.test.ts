import { UserSettingsManager } from "../../helpers/usersettingsmanager.js";
import { Global } from "../../__mocks__/global.js";
import { UserSettingsData } from '../../helpers/usersettingsmanager.js';

let userSettingsManager: UserSettingsManager;

const jsonTestSettingsFile = "test-data/test-settings.json";

beforeAll(() => {
    Global.init();
    userSettingsManager = new UserSettingsManager("willfail.json");
});

afterAll(() => {

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
        test('get(username): valid', () => {
            expect(userSettingsManager.get("babykoala").weatherSettings.location).toBe("Weston");
        });
        test('get(username, createNew=true): valid', () => {
            expect(userSettingsManager.get("unknown", true).weatherSettings.preferredUnits).toBe("rankine");
        });
        test('set(userSettingsData, false): valid', () => {
            const testData = new UserSettingsData("test", "Test Location", "kelvin");
            expect(userSettingsManager.set(testData, false)).toBe(true);
            expect(userSettingsManager.get("test").weatherSettings.preferredUnits).toBe("kelvin");
        });
    });
});