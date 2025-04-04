import { Global } from '../global.js'
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
    #userSettings: Map<string, UserSettingsData>;
    #settingsJsonFile: string;
    
    constructor(settingsJsonFile: string) {
        this.#userSettings = new Map<string, UserSettingsData>();
        this.#settingsJsonFile = settingsJsonFile;
        this.reload();
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
            if (this.#userSettings.has(username)) {
                return this.#userSettings.get(username);
            }
            else if (createNew) {
                return new UserSettingsData(username);
            } else {
                return null;
            }
        }
        catch (e)
        {
            Global.logger().logErrorAsync(`Failed to get user data, got exception: ${e}`);
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
            this.#userSettings.set(userSettingsData.name, userSettingsData);

            if (flush) {
                this.flush();
            }

            return true;
        }
        catch (e) {
            Global.logger().logErrorAsync(`Failed to set user data, got exception ${e}`);
            return false;
        }
    }

    /**
     * Flush the user data to disk in JSON format
     */
    async flush() : Promise<boolean> {
        try {
            let userData = new Array<UserSettingsData>();

            this.#userSettings.forEach((value: UserSettingsData, key: string) => {
                userData.push(value);
            });

            const jsonString = JSON.stringify(userData, null, 2);

            fs.writeFile(this.#settingsJsonFile, jsonString, err => {
                if (err) {
                    Global.logger().logErrorAsync(`Error flushing user data file to ${this.#settingsJsonFile}, got ${err}`);
                    return false;
                } else {
                    Global.logger().logInfo(`Successfully wrote user data to ${this.#settingsJsonFile}`);
                    return true;
                }
            });
        } catch (e) {
            Global.logger().logErrorAsync(`Failed to flush user data to disk, got error ${e}`);
            return false;
        }
    }

    reload() : boolean {
        try {
            const data = fs.readFileSync(this.#settingsJsonFile, { encoding: "utf8", flag: "r" });
            const jsonData = JSON.parse(data);

            jsonData.forEach((item) => {
                this.#userSettings.set(item.name, new UserSettingsData(item.name, item.weatherSettings.location, item.weatherSettings.preferredUnits));
            });

            return true;
        } catch (e) {
            Global.logger().logErrorAsync(`Failed to reload user data from ${this.#settingsJsonFile}, got ${e}`);
            return false;
        }
    }
}