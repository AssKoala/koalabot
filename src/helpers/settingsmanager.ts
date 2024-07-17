import dotenv from 'dotenv';

class Setting {
    readonly moduleName: string;
    readonly name: string;
    readonly defaultValue: string;
    readonly description: string;
    readonly required: boolean;

    constructor(moduleName, name, defaultValue, description, required) {
        this.moduleName = moduleName;
        this.name = name;
        this.defaultValue = defaultValue;
        this.description = description;
        this.required = required;
    }
}

export class SettingsManager {
    #registeredSettings: Setting[] = [];

    constructor() {
        dotenv.config();
    }

    register(moduleName:string, settingName:string, defaultValue:string, description:string, required:boolean = false) {
        // .env settings are just the setting name, but module name is used for logging/docs
        if (settingName in this.#registeredSettings) {
            throw Error(`SettingsManager.register: ${moduleName}::${settingName} already exists!`);
        } else {
            this.#registeredSettings[settingName] = new Setting(moduleName, settingName, defaultValue, description, required);
        }
    }

    get(settingName: string): string {
        if (!(settingName in this.#registeredSettings)) {
            throw Error(`SettingsManager.get ${settingName} is not registered!`);
        }

        if (this.has(settingName)) {
            return process.env[settingName];
        }

        const errorMsg = `${settingName} missing.  ${this.#registeredSettings[settingName].description}`;
        if (this.#registeredSettings[settingName].required) {
            throw Error(errorMsg);
        } else {
            console.log(errorMsg);
        }

        return undefined || this.#registeredSettings[settingName].defaultValue;
    }

    has(settingName): boolean {
        return (settingName in process.env);
    }

    getDiscordKey(): string {
        return this.get("DISCORD_TOKEN");
    }

    getDiscordAppId(): string {
        return this.get("DISCORD_APP_ID"); 
    }

    getDiscordGuildIdList(): string[]
    {
        return this.get("DISCORD_GUILD_ID").split(',');
    }
}