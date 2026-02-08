import { DatabaseManager } from './databasemanager.js';
import { getCommonLogger } from '../logging/logmanager.js';

export interface UserSettingsRow {
    user_name: string;
    settings_json: Record<string, unknown>;
}

export class UserSettingsRepository {

    /**
     * Upsert user settings.
     */
    static async upsert(userName: string, settingsJson: Record<string, unknown>): Promise<void> {
        if (!DatabaseManager.isAvailable()) return;

        try {
            await DatabaseManager.get().query(
                `INSERT INTO user_settings (user_name, settings_json, updated_at)
                 VALUES ($1, $2, NOW())
                 ON CONFLICT (user_name)
                 DO UPDATE SET settings_json = $2, updated_at = NOW()`,
                [userName, JSON.stringify(settingsJson)]
            );
        } catch (e) {
            getCommonLogger().logErrorAsync(`UserSettingsRepository.upsert(): Failed, got ${e}`);
        }
    }

    /**
     * Get settings for a specific user.
     */
    static async get(userName: string): Promise<UserSettingsRow | null> {
        if (!DatabaseManager.isAvailable()) return null;

        try {
            const result = await DatabaseManager.get().query<UserSettingsRow>(
                `SELECT user_name, settings_json FROM user_settings WHERE user_name = $1`,
                [userName]
            );
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (e) {
            getCommonLogger().logErrorAsync(`UserSettingsRepository.get(): Failed, got ${e}`);
            return null;
        }
    }

    /**
     * Get all user settings.
     */
    static async getAll(): Promise<UserSettingsRow[]> {
        if (!DatabaseManager.isAvailable()) return [];

        try {
            const result = await DatabaseManager.get().query<UserSettingsRow>(
                `SELECT user_name, settings_json FROM user_settings ORDER BY user_name`
            );
            return result.rows;
        } catch (e) {
            getCommonLogger().logErrorAsync(`UserSettingsRepository.getAll(): Failed, got ${e}`);
            return [];
        }
    }

    /**
     * Check if any settings exist in the DB.
     */
    static async isEmpty(): Promise<boolean> {
        if (!DatabaseManager.isAvailable()) return true;

        try {
            const result = await DatabaseManager.get().query<{ count: string }>(
                `SELECT COUNT(*) as count FROM user_settings`
            );
            return parseInt(result.rows[0].count) === 0;
        } catch (e) {
            getCommonLogger().logErrorAsync(`UserSettingsRepository.isEmpty(): Failed, got ${e}`);
            return true;
        }
    }
}
