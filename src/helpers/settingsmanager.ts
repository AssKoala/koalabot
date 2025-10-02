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
    private registeredSettings: Setting[] = [];

    constructor() {
        dotenv.config();
    }

    register(moduleName:string, settingName:string, defaultValue:string, description:string, required:boolean = false) {
        // .env settings are just the setting name, but module name is used for logging/docs
        if (settingName in this.registeredSettings) {
            throw RangeError(`SettingsManager.register: ${moduleName}::${settingName} already exists!`);
        } else {
            this.registeredSettings[settingName] = new Setting(moduleName, settingName, defaultValue, description, required);
        }
    }

    getAllSettings() {
        return Object.keys(this.registeredSettings);
    }

    search(searchString: string) {
        return this.getAllSettings().filter(setting => setting.toLowerCase().includes(searchString.toLowerCase()));
    }

    set(settingName: string, value: string): boolean {
        if (settingName in this.registeredSettings) {
            process.env[settingName] = value;
            return true;
        }
        return false;
    }

    get(settingName: string): string {
        if (!(settingName in this.registeredSettings)) {
            if (this.has(settingName)) {
                throw RangeError(`SettingsManager.get: ${settingName} is not registered, but has value ${process.env[settingName]} in .env!`)
            } else {
                throw RangeError(`SettingsManager.get: ${settingName} is not registered and doesn't exist!`);
            }
        }

        if (this.has(settingName)) {
            return process.env[settingName];
        }

        if (this.registeredSettings[settingName].required) {
            throw Error(`${settingName} missing. Description: ${this.registeredSettings[settingName].description}`);
        } else {
            if (process.env["DEBUG_ENABLE"] == 'true') {
                console.log(`${settingName} missing, using default: ${this.registeredSettings[settingName].defaultValue}`);
            }
        }

        return this.registeredSettings[settingName].defaultValue;
    }

    isRegistered(settingName: string): boolean {
        return (settingName in this.registeredSettings);
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

    private getSettingDocs(setting: Setting): string {
        let toRet = "";
        
        toRet = `| ${setting.name} | ${setting.defaultValue} | ${setting.required} | ${setting.description} |`;

        return toRet;
    }

    private getReadmeSettingsString(map): string {
        let toRet: string = "";

        map.forEach(([key, setting]) => {
            const docs = this.getSettingDocs(setting as Setting);
            toRet += docs + "\n";
        });

        return toRet;
    }

    getReadmeSettingsDocs(): string {
        let moduleSorted = [];
        let toRet: string = "";

        Object.entries(this.registeredSettings).forEach(([key, setting]) => {
            if (!(setting.moduleName in moduleSorted)) {
                moduleSorted[setting.moduleName] = [];
            }

            moduleSorted[setting.moduleName].push(setting);
        });

        // First output for all the global settings
        toRet += "#### Global settings" + "\n\n";
        toRet += `| Name | DefaultValue | Required | Description |\n`;
        toRet += `| ---- | ------------ | -------- | ----------- |\n`;
        toRet += this.getReadmeSettingsString(Object.entries(moduleSorted["global"])) + "\n\n";

        // Then the rest of the settings in whatever order
        Object.entries(moduleSorted).forEach(([key, settings]) => {
            if (!(key === "global")) {
                toRet += `#### ${key} settings` + "\n\n";
                toRet += `| Name | DefaultValue | Required | Description |\n`;
                toRet += `| ---- | ------------ | -------- | ----------- |\n`;
                toRet += this.getReadmeSettingsString(Object.entries(settings)) + "\n\n";
            }
        });

        return toRet;
    }
}