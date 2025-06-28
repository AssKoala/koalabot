import { SettingsManager } from "../../helpers/settingsmanager.js";

let settingsManager: SettingsManager;

beforeAll(() => {
    settingsManager = new SettingsManager();
});

/* Empty Tests */
describe('SettingsManagar', () => {
    const RegisteredVarName = "TEST_VAR";

    describe("Empty Tests", () => {
        test('getAllSettings(): empty', () => {
            expect(settingsManager.getAllSettings().length).toBe(0);    
        });
        test('get(settingName): empty', () => {
            expect(() => {settingsManager.get("UNREGISTERED")}).toThrow(RangeError);
        });
        test('has(settingName): empty', () => {
            expect(settingsManager.has("U")).toBe(false);
        });
        test('search("TEST_VAR"): empty', () => {
            expect(settingsManager.search(RegisteredVarName).length).toBe(0);
        });
        test('set(settingName, value): empty', () => {
            expect(settingsManager.set(RegisteredVarName, "testValue")).toBe(false);
        });
    });

    describe('Registration', () => {
        test('register(moduleName, settingName, defaultValue, description, required): valid', () => {
            settingsManager.register("global", RegisteredVarName, 'testValue', "Test desc", false);
            expect(settingsManager.isRegistered(RegisteredVarName)).toBe(true);
        });
        test('register(moduleName, settingName, defaultValue, description, required): duplicate', () => {
            expect(() => {
                settingsManager.register("global", RegisteredVarName, 'testValue', "Test desc", false)
            }).toThrow(RangeError);
        });
        test('search("TEST_VAR"): valid', () => {
            expect(settingsManager.search(RegisteredVarName).length).toBe(1);
        });
    });
});
