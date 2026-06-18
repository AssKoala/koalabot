import { GetKoalaBotSystem } from '../../api/koalabotsystem.js';
import fs from 'fs'
import config from 'config';
import crypto from 'crypto';

export class UserWeatherSettings {
    location: string;
    preferredUnits: string;

    constructor(location: string, preferredUnits: string) {
        this.location = location
        this.preferredUnits = preferredUnits
    }
}

export class UserChatSettings {
    private _customPrompt: string;
    accessor preferredAiModel: string;
    private _mdFileName: string;
    private mdFileContents: string | null = null;

    constructor(preferredAiModel: string = "", customPrompt: string = "", mdFileName: string = "") {
        this.preferredAiModel = preferredAiModel;
        this._customPrompt = customPrompt;
        this._mdFileName = mdFileName;
    }

    private getPromptsDir(): string {
        return `${GetKoalaBotSystem().getConfigVariable("Global.localDataPath")}/prompts`;
    }

    private getMdFilePath(): string {
        const mdFilePath = this._mdFileName ? `${this.getPromptsDir()}/${this._mdFileName}` : "";
        return mdFilePath;
    }

    get mdFileName(): string {
        return this._mdFileName;
    }

    set mdFileName(value: string) {
        if (value !== this._mdFileName) {
            this._mdFileName = value;
            this.mdFileContents = null; // reset cached contents when filename changes
        }
    }

    get customPrompt() : string {
        if (this._mdFileName) {
            if (this.mdFileContents) {
                return this.mdFileContents;
            }

            try {
                const mdFilePath = this.getMdFilePath();
                const fileContent = fs.readFileSync(mdFilePath, 'utf-8');
                this.mdFileContents = fileContent;  // cache the contents so we don't have to read from disk every time
                return fileContent;
            } catch (e) {
                GetKoalaBotSystem().getLogger().logError(`Failed to read custom prompt from markdown file at ${this.getMdFilePath()}, got error ${e}`);
                // safely fall to custom prompt string
            }
        }

        return this._customPrompt;
    }

    set customPrompt(value: string) {
        this._customPrompt = value;
    }

    createMdFile(mdContent: string): void {
        // validate contents
        if (!mdContent || mdContent.trim() === "") {
            throw new Error("Failed to create markdown file, content is empty or whitespace.");
        }

        // Check content length
        const maxLength = 4 * +GetKoalaBotSystem().getConfigVariable("Chat.maxSoulTokens"); // rough estimate of token to character ratio
        if (mdContent.length > maxLength) {
            throw new Error(`Failed to create markdown file, content length (${mdContent.length}) exceeds maximum allowed (${maxLength}).`);
        }

        // generate unique enough filename
        const promptsDir = this.getPromptsDir();
        const contentHash = crypto.createHash('md5').update(mdContent).digest('hex');
        this.mdFileName = `${contentHash}.md`;
        this.mdFileContents = mdContent; // cache the contents

        // create file
        try {
            if (!fs.existsSync(promptsDir)) {
                fs.mkdirSync(promptsDir, { recursive: true });
            }
            const mdFilePath = `${promptsDir}/${this._mdFileName}`;
            fs.writeFileSync(mdFilePath, mdContent, 'utf-8');
        } catch (e) {
            throw new Error(`Failed to create markdown file at ${promptsDir}`, { cause: e });
        }
    }
}

export class UserSettingsData {
    name: string;
    chatSettings: UserChatSettings;
    weatherSettings: UserWeatherSettings;

    constructor(name: string, location: string = "Johannesburg, South Africa", preferredUnits: string = "rankine", preferredAiModel: string = "", customPrompt: string = "", mdFileName: string = "") {
        this.name = name;
        this.chatSettings = new UserChatSettings(preferredAiModel, customPrompt, mdFileName);
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
            const userData = new Array<UserSettingsData>();

            this.userSettings.forEach((value: UserSettingsData, _key: string) => {
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
                    item.chatSettings?.customPrompt || "",
                    item.chatSettings?.mdFileName || ""
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