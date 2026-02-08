import { DatabaseManager } from './databasemanager.js';
import { getCommonLogger } from '../logging/logmanager.js';

export class LeaderboardRepository {

    /**
     * Upsert a word count for a user in a guild.
     */
    static async upsertWordCount(guildId: string, userName: string, word: string, count: number): Promise<void> {
        if (!DatabaseManager.isAvailable()) return;

        try {
            await DatabaseManager.get().query(
                `INSERT INTO leaderboard_stats (guild_id, user_name, word, count, updated_at)
                 VALUES ($1, $2, $3, $4, NOW())
                 ON CONFLICT (guild_id, user_name, word)
                 DO UPDATE SET count = $4, updated_at = NOW()`,
                [guildId, userName, word, count]
            );
        } catch (e) {
            getCommonLogger().logErrorAsync(`LeaderboardRepository.upsertWordCount(): Failed, got ${e}`);
        }
    }

    /**
     * Increment a word count by 1 for a user in a guild.
     */
    static async incrementWordCount(guildId: string, userName: string, word: string): Promise<void> {
        if (!DatabaseManager.isAvailable()) return;

        try {
            await DatabaseManager.get().query(
                `INSERT INTO leaderboard_stats (guild_id, user_name, word, count, updated_at)
                 VALUES ($1, $2, $3, 1, NOW())
                 ON CONFLICT (guild_id, user_name, word)
                 DO UPDATE SET count = leaderboard_stats.count + 1, updated_at = NOW()`,
                [guildId, userName, word]
            );
        } catch (e) {
            getCommonLogger().logErrorAsync(`LeaderboardRepository.incrementWordCount(): Failed, got ${e}`);
        }
    }

    /**
     * Get all leaderboard stats for a guild and word, ordered by count descending.
     */
    static async getLeaderboard(guildId: string, word: string): Promise<{ user_name: string; count: number }[]> {
        if (!DatabaseManager.isAvailable()) return [];

        try {
            const result = await DatabaseManager.get().query<{ user_name: string; count: number }>(
                `SELECT user_name, count FROM leaderboard_stats
                 WHERE guild_id = $1 AND word = $2
                 ORDER BY count DESC`,
                [guildId, word]
            );
            return result.rows;
        } catch (e) {
            getCommonLogger().logErrorAsync(`LeaderboardRepository.getLeaderboard(): Failed, got ${e}`);
            return [];
        }
    }

    /**
     * Get all word counts for a specific user in a guild.
     */
    static async getUserStats(guildId: string, userName: string): Promise<{ word: string; count: number }[]> {
        if (!DatabaseManager.isAvailable()) return [];

        try {
            const result = await DatabaseManager.get().query<{ word: string; count: number }>(
                `SELECT word, count FROM leaderboard_stats
                 WHERE guild_id = $1 AND user_name = $2`,
                [guildId, userName]
            );
            return result.rows;
        } catch (e) {
            getCommonLogger().logErrorAsync(`LeaderboardRepository.getUserStats(): Failed, got ${e}`);
            return [];
        }
    }

    /**
     * Bulk upsert leaderboard stats (for initial migration from in-memory data).
     */
    static async bulkUpsert(rows: { guildId: string; userName: string; word: string; count: number }[]): Promise<void> {
        if (!DatabaseManager.isAvailable() || rows.length === 0) return;

        try {
            // Batch in groups of 100 to avoid overly large queries
            const batchSize = 100;
            for (let i = 0; i < rows.length; i += batchSize) {
                const batch = rows.slice(i, i + batchSize);
                const values: unknown[] = [];
                const placeholders: string[] = [];

                batch.forEach((row, idx) => {
                    const offset = idx * 4;
                    placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, NOW())`);
                    values.push(row.guildId, row.userName, row.word, row.count);
                });

                await DatabaseManager.get().query(
                    `INSERT INTO leaderboard_stats (guild_id, user_name, word, count, updated_at)
                     VALUES ${placeholders.join(', ')}
                     ON CONFLICT (guild_id, user_name, word)
                     DO UPDATE SET count = GREATEST(leaderboard_stats.count, EXCLUDED.count), updated_at = NOW()`,
                    values
                );
            }

            getCommonLogger().logInfo(`LeaderboardRepository.bulkUpsert(): Upserted ${rows.length} rows.`);
        } catch (e) {
            getCommonLogger().logErrorAsync(`LeaderboardRepository.bulkUpsert(): Failed, got ${e}`);
        }
    }

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
            getCommonLogger().logErrorAsync(`LeaderboardRepository.incrementMessageCount(): Failed, got ${e}`);
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
            getCommonLogger().logErrorAsync(`LeaderboardRepository.getMessageCount(): Failed, got ${e}`);
            return 0;
        }
    }

    /**
     * Get all leaderboard stats for a guild (all words, all users).
     */
    static async getAllForGuild(guildId: string): Promise<{ user_name: string; word: string; count: number }[]> {
        if (!DatabaseManager.isAvailable()) return [];

        try {
            const result = await DatabaseManager.get().query<{ user_name: string; word: string; count: number }>(
                `SELECT user_name, word, count FROM leaderboard_stats
                 WHERE guild_id = $1`,
                [guildId]
            );
            return result.rows;
        } catch (e) {
            getCommonLogger().logErrorAsync(`LeaderboardRepository.getAllForGuild(): Failed, got ${e}`);
            return [];
        }
    }

    /**
     * Get all message counts for a guild.
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
            getCommonLogger().logErrorAsync(`LeaderboardRepository.getAllMessageCountsForGuild(): Failed, got ${e}`);
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

            getCommonLogger().logInfo(`LeaderboardRepository.bulkUpsertMessageCounts(): Upserted ${rows.length} rows.`);
        } catch (e) {
            getCommonLogger().logErrorAsync(`LeaderboardRepository.bulkUpsertMessageCounts(): Failed, got ${e}`);
        }
    }
}
