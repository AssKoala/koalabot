import config from 'config';
import { DatabaseManager } from './databasemanager.js';
import { UserSettingsRepository, UserSettingsRow } from './usersettingsrepository.js';
import { getCommonLogger } from '../logging/logmanager.js';
import { UserSettingsData } from '../app/user/usersettingsmanager.js';

type UserSettingsPersistHook = (userSettingsData: UserSettingsData) => void;

interface UserSettingsJsonShape {
    weatherSettings?: {
        location?: string;
        preferredUnits?: string;
    };
    chatSettings?: {
        preferredAiModel?: string;
        customPrompt?: string;
    };
}

export interface UserSettingsSyncStore {
    has(username: string): boolean;
    getAllSettings(): UserSettingsData[];
    setInMemoryOnly(userSettingsData: UserSettingsData): boolean;
    setPersistenceHook(persistHook: UserSettingsPersistHook | null): void;
}

export class UserSettingsDbSync {
    static attachPersistence(store: UserSettingsSyncStore): void {
        store.setPersistenceHook((userSettingsData: UserSettingsData) => {
            this.persistUserSettings(userSettingsData).catch(() => {});
        });
    }

    static async syncStartup(store: UserSettingsSyncStore): Promise<void> {
        if (!DatabaseManager.isAvailable()) return;

        try {
            const isEmpty = await UserSettingsRepository.isEmpty();

            if (isEmpty) {
                await this.migrateFromInMemory(store);
                return;
            }

            await this.mergeFromDatabase(store);
            this.reSyncInMemoryToDatabase(store);
        } catch (e) {
            getCommonLogger().logErrorAsync(`UserSettingsDbSync: Failed to sync startup data, got ${e}`);
        }
    }

    private static async migrateFromInMemory(store: UserSettingsSyncStore): Promise<void> {
        const allSettings = store.getAllSettings();
        if (allSettings.length === 0) return;

        for (const data of allSettings) {
            await this.persistUserSettings(data);
        }

        getCommonLogger().logInfo(`UserSettingsDbSync: Migrated ${allSettings.length} user settings to database.`);
    }

    private static async mergeFromDatabase(store: UserSettingsSyncStore): Promise<void> {
        const rows = await UserSettingsRepository.getAll();
        let loadedCount = 0;

        for (const row of rows) {
            if (store.has(row.user_name)) continue;

            const newData = this.toUserSettingsData(row);
            if (store.setInMemoryOnly(newData)) {
                loadedCount++;
            }
        }

        getCommonLogger().logInfo(`UserSettingsDbSync: Loaded ${loadedCount} user settings from database (${rows.length - loadedCount} already in JSON).`);
    }

    private static reSyncInMemoryToDatabase(store: UserSettingsSyncStore): void {
        for (const data of store.getAllSettings()) {
            this.persistUserSettings(data).catch(() => {});
        }
    }

    private static async persistUserSettings(userSettingsData: UserSettingsData): Promise<void> {
        if (!DatabaseManager.isAvailable()) return;

        await UserSettingsRepository.upsert(userSettingsData.name, {
            weatherSettings: userSettingsData.weatherSettings,
            chatSettings: userSettingsData.chatSettings
        });
    }

    private static toUserSettingsData(row: UserSettingsRow): UserSettingsData {
        const json = row.settings_json as UserSettingsJsonShape;

        return new UserSettingsData(
            row.user_name,
            json.weatherSettings?.location || "Johannesburg, South Africa",
            json.weatherSettings?.preferredUnits || "rankine",
            json.chatSettings?.preferredAiModel || config.get<string>('Chat.aiModel'),
            json.chatSettings?.customPrompt || ""
        );
    }
}
