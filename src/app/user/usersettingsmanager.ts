import { GetKoalaBotSystem } from '../../api/koalabotsystem.js';
import fs from 'fs'
import config from 'config';
import { DatabaseManager } from '../../db/databasemanager.js';
import { UserSettingsRepository } from '../../db/usersettingsrepository.js';
import { getCommonLogger } from '../../logging/logmanager.js';

export class UserWeatherSettings {
    location: string;
    preferredUnits: string;

    constructor(location: string, preferredUnits: string) {
        this.location = location
        this.preferredUnits = preferredUnits
    }
}

export class UserChatSettings {
    customPrompt: string;
    preferredAiModel: string;

    constructor(preferredAiModel: string = "", customPrompt: string = "") {
        this.preferredAiModel = preferredAiModel;
        this.customPrompt = customPrompt;
    }
}

export class UserSettingsData {
    name: string;
    chatSettings: UserChatSettings;
    weatherSettings: UserWeatherSettings;

    constructor(name: string, location: string = "Johannesburg, South Africa", preferredUnits: string = "rankine", preferredAiModel: string = "", customPrompt: string = "") {
        this.name = name;
        this.chatSettings = new UserChatSettings(preferredAiModel, customPrompt);
        this.weatherSettings = new UserWeatherSettings(location, preferredUnits);
    }
}

export class UserSettingsManager {
    private static instance: UserSettingsManager;
    public static init(settingsJsonFile: string) {
        UserSettingsManager.instance = new UserSettingsManager(settingsJsonFile);
    }
    public static get(): UserSettingsManager {
        return UserSettingsManager.instance!;
    }

    private userSettings: Map<string, UserSettingsData>;
    private settingsJsonFile: string;
    
    private constructor(settingsJsonFile: string) {
        this.userSettings = new Map<string, UserSettingsData>();
        this.settingsJsonFile = settingsJsonFile;
        this.reload(this.settingsJsonFile);
    }

    /**
     * Load user settings from DB. If DB has data, use it.
     * If DB is empty but JSON file had data, migrate JSON data to DB.
     * Called after construction (async).
     */
    async loadFromDatabase(): Promise<void> {
        if (!DatabaseManager.isAvailable()) return;

        try {
            const isEmpty = await UserSettingsRepository.isEmpty();

            if (isEmpty && this.userSettings.size > 0) {
                // Migrate JSON data to DB
                for (const [_name, data] of this.userSettings) {
                    await UserSettingsRepository.upsert(data.name, {
                        weatherSettings: data.weatherSettings,
                        chatSettings: data.chatSettings
                    });
                }
                getCommonLogger().logInfo(`UserSettingsManager: Migrated ${this.userSettings.size} user settings to database.`);
            } else if (!isEmpty) {
                // Load from DB, but don't overwrite users already loaded from JSON.
                // JSON is always written on every set(), so if the user changed settings
                // while the DB was down, the JSON file has fresher data.
                const rows = await UserSettingsRepository.getAll();
                let loadedCount = 0;
                for (const row of rows) {
                    if (this.userSettings.has(row.user_name)) continue; // JSON data is fresher

                    const json = row.settings_json as any;
                    const newData = new UserSettingsData(
                        row.user_name,
                        json.weatherSettings?.location || "Johannesburg, South Africa",
                        json.weatherSettings?.preferredUnits || "rankine",
                        json.chatSettings?.preferredAiModel || config.get<string>('Chat.aiModel'),
                        json.chatSettings?.customPrompt || ""
                    );
                    this.userSettings.set(row.user_name, newData);
                    loadedCount++;
                }
                getCommonLogger().logInfo(`UserSettingsManager: Loaded ${loadedCount} user settings from database (${rows.length - loadedCount} already in JSON).`);

                // Re-sync JSON-loaded settings back to DB (in case they were changed during outage)
                for (const [_name, data] of this.userSettings) {
                    UserSettingsRepository.upsert(data.name, {
                        weatherSettings: data.weatherSettings,
                        chatSettings: data.chatSettings
                    }).catch(() => {});
                }
            }
        } catch (e) {
            getCommonLogger().logErrorAsync(`UserSettingsManager: Failed to load from database, got ${e}`);
        }
    }

    /**
     * 
     * @param {string} username - username to lookup
     * @return {UserSettingsData} username's UserSettingsData object, automatically created with defaults if username not found
     */
    get(username: string) : UserSettingsData {
        // If the user's data already exists, return that
        if (this.userSettings.has(username)) {
            return this.userSettings.get(username)!;
        }
        else {
            const newData = new UserSettingsData(username);
            this.set(newData, false);   // No need to flush a default object
            return newData;
        } 
    }

    has(username: string) : boolean {
        return this.userSettings.has(username);
    }

    /**
     * 
     * @param {string} userData - user data object to use
     * @param {boolean} flush - flush user data to disk after setting
     * @return {boolean} true on success, false otherwise
     */
    set(userSettingsData: UserSettingsData, flush: boolean = false) : boolean {
        try {
            this.userSettings.set(userSettingsData.name, userSettingsData);

            if (flush) {
                this.flush();
            }

            // Fire-and-forget DB persistence
            if (DatabaseManager.isAvailable()) {
                UserSettingsRepository.upsert(userSettingsData.name, {
                    weatherSettings: userSettingsData.weatherSettings,
                    chatSettings: userSettingsData.chatSettings
                }).catch(() => {});
            }

            return true;
        }
        catch (e) {
            GetKoalaBotSystem().getLogger().logError(`Failed to set user data, got exception ${e}`);
            return false;
        }
    }

    /**
     * Flush the user data to disk in JSON format
     */
    // @ts-expect-error todo cleanup tech debt
    async flush() : Promise<boolean> {
        try {
            let userData = new Array<UserSettingsData>();

            this.userSettings.forEach((value: UserSettingsData, key: string) => {
                userData.push(value);
            });

            const jsonString = JSON.stringify(userData, null, 2);

            fs.writeFile(this.settingsJsonFile, jsonString, err => {
                if (err) {
                    GetKoalaBotSystem().getLogger().logError(`Error flushing user data file to ${this.settingsJsonFile}, got ${err}`);
                    return false;
                } else {
                    GetKoalaBotSystem().getLogger().logInfo(`Successfully wrote user data to ${this.settingsJsonFile}`);
                    return true;
                }
            });
        } catch (e) {
            GetKoalaBotSystem().getLogger().logError(`Failed to flush user data to disk, got error ${e}`);
            return false;
        }
    }

    // @ts-expect-error todo cleanup tech debt
    reload(jsonFile) : boolean {
        try {
            const data = fs.readFileSync(jsonFile, { encoding: "utf8", flag: "r" });
            const jsonData = JSON.parse(data);

            // @ts-expect-error todo cleanup tech debt
            jsonData.forEach((item) => {
                if (!item.name) { 
                    GetKoalaBotSystem().getLogger().logWarning(`UserSettingsManager::reload(): Skipping invalid user settings entry without name field.`);
                    return true; 
                } // Skip invalid entries

                const newData = new UserSettingsData(item.name,
                    item.weatherSettings?.location || "Johannesburg, South Africa",
                    item.weatherSettings?.preferredUnits || "rankine",
                    item.chatSettings?.preferredAiModel || config.get<string>('Chat.aiModel'),
                    item.chatSettings?.customPrompt || ""
                );
                
                this.userSettings.set(item.name, newData);
            });

            return true;
        } catch (e) {
            try {
                GetKoalaBotSystem().getLogger().logError(`Failed to reload user data from ${jsonFile}, got ${e}`);
            } catch (e) {
                console.error(`Failed to reload user data from ${jsonFile}, got ${e}`);
            }
            
            return false;
        }
    }
}