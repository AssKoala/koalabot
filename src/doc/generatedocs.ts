import { SettingsManager } from "../helpers/settingsmanager.js";
import { registerEnvironmentSettings } from "../env-settings.js";

const settingsManager: SettingsManager = new SettingsManager();
registerEnvironmentSettings(settingsManager);

console.log(settingsManager.getReadmeSettingsDocs());
