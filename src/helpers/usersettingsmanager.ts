import { GetKoalaBotSystem, KoalaBotSystem } from '../api/koalabotsystem.js';
import fs from 'fs'

export class UserWeatherSettings {
    location: string;
    preferredUnits: string;

    constructor(location: string, preferredUnits: string) {
        this.location = location
        this.preferredUnits = preferredUnits
    }
}

export class UserSettingsData {
    name: string;
    weatherSettings: UserWeatherSettings;

    constructor(name: string, location: string = "Johannesburg, South Africa", preferredUnits: string = "rankine") {
        this.name = name;
        this.weatherSettings = new UserWeatherSettings(location, preferredUnits);
    }
}

export class UserSettingsManager {
    private userSettings: Map<string, UserSettingsData>;
    private settingsJsonFile: string;
    
    constructor(settingsJsonFile: string) {
        this.userSettings = new Map<string, UserSettingsData>();
        this.settingsJsonFile = settingsJsonFile;
        this.reload(this.settingsJsonFile);
    }

    /**
     * 
     * @param {string} username - username to lookup
     * @param {boolean} createNew - If true, creates a default entry for the username if one doesn't already exist
     * @return {UserSettingsData} username's UserSettingsData object, null if not found and createNew set to false
     */
    get(username: string, createNew: boolean = false) : UserSettingsData {
        try {
            // If the user's data already exists, return that
            if (this.userSettings.has(username)) {
                // @ts-ignore
                return this.userSettings.get(username);
            }
            else if (createNew) {
                return new UserSettingsData(username);
            } else {
                // @ts-ignore
                return null;
            }
        }
        catch (e)
        {
            GetKoalaBotSystem().getLogger().logError(`Failed to get user data, got exception: ${e}`);
            // @ts-ignore
            return null;
        }
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
    // @ts-ignore
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

    // @ts-ignore
    reload(jsonFile) : boolean {
        try {
            const data = fs.readFileSync(jsonFile, { encoding: "utf8", flag: "r" });
            const jsonData = JSON.parse(data);

            // @ts-ignore
            jsonData.forEach((item) => {
                this.userSettings.set(item.name, new UserSettingsData(item.name, item.weatherSettings.location, item.weatherSettings.preferredUnits));
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