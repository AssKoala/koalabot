import { DatabaseManager } from './databasemanager.js';
import { getCommonLogger } from '../logging/logmanager.js';

export class MessageCountRepository {

    /**
     * Increment message count for a user in a guild.
     */
    static async incrementMessageCount(guildId: string, userName: string): Promise<void> {
        if (!DatabaseManager.isAvailable()) return;

        try {
            await DatabaseManager.get().query(
                `INSERT INTO message_counts (guild_id, user_name, count, updated_at)
                 VALUES ($1, $2, 1, NOW())
                 ON CONFLICT (guild_id, user_name)
                 DO UPDATE SET count = message_counts.count + 1, updated_at = NOW()`,
                [guildId, userName]
            );
        } catch (e) {
            getCommonLogger().logErrorAsync(`MessageCountRepository.incrementMessageCount(): Failed, got ${e}`);
        }
    }

    /**
     * Get message count for a user in a guild.
     */
    static async getMessageCount(guildId: string, userName: string): Promise<number> {
        if (!DatabaseManager.isAvailable()) return 0;

        try {
            const result = await DatabaseManager.get().query<{ count: number }>(
                `SELECT count FROM message_counts WHERE guild_id = $1 AND user_name = $2`,
                [guildId, userName]
            );
            return result.rows.length > 0 ? result.rows[0].count : 0;
        } catch (e) {
            getCommonLogger().logErrorAsync(`MessageCountRepository.getMessageCount(): Failed, got ${e}`);
            return 0;
        }
    }

    /**
     * Get all message counts for a guild.
     * Intentionally unbounded — only called once at startup to seed the in-memory cache.
     */
    static async getAllMessageCountsForGuild(guildId: string): Promise<{ user_name: string; count: number }[]> {
        if (!DatabaseManager.isAvailable()) return [];

        try {
            const result = await DatabaseManager.get().query<{ user_name: string; count: number }>(
                `SELECT user_name, count FROM message_counts
                 WHERE guild_id = $1`,
                [guildId]
            );
            return result.rows;
        } catch (e) {
            getCommonLogger().logErrorAsync(`MessageCountRepository.getAllMessageCountsForGuild(): Failed, got ${e}`);
            return [];
        }
    }

    /**
     * Bulk upsert message counts (for initial migration).
     */
    static async bulkUpsertMessageCounts(rows: { guildId: string; userName: string; count: number }[]): Promise<void> {
        if (!DatabaseManager.isAvailable() || rows.length === 0) return;

        try {
            const batchSize = 100;
            for (let i = 0; i < rows.length; i += batchSize) {
                const batch = rows.slice(i, i + batchSize);
                const values: unknown[] = [];
                const placeholders: string[] = [];

                batch.forEach((row, idx) => {
                    const offset = idx * 3;
                    placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, NOW())`);
                    values.push(row.guildId, row.userName, row.count);
                });

                await DatabaseManager.get().query(
                    `INSERT INTO message_counts (guild_id, user_name, count, updated_at)
                     VALUES ${placeholders.join(', ')}
                     ON CONFLICT (guild_id, user_name)
                     DO UPDATE SET count = GREATEST(message_counts.count, EXCLUDED.count), updated_at = NOW()`,
                    values
                );
            }

            getCommonLogger().logInfo(`MessageCountRepository.bulkUpsertMessageCounts(): Upserted ${rows.length} rows.`);
        } catch (e) {
            getCommonLogger().logErrorAsync(`MessageCountRepository.bulkUpsertMessageCounts(): Failed, got ${e}`);
        }
    }
}
