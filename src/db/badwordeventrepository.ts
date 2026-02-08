import { DatabaseManager } from './databasemanager.js';
import { getCommonLogger } from '../logging/logmanager.js';

export interface BadWordEventRow {
    id: number;
    channel_id: string;
    badword: string;
    user_id: string;
    user_name: string;
    timestamp: number;
}

export class BadWordEventRepository {

    /**
     * Insert a bad word event.
     */
    static async insert(channelId: string, badword: string, userId: string, userName: string, timestamp: number): Promise<void> {
        if (!DatabaseManager.isAvailable()) return;

        try {
            await DatabaseManager.get().query(
                `INSERT INTO badword_events (channel_id, badword, user_id, user_name, timestamp, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [channelId, badword, userId, userName, timestamp]
            );
        } catch (e) {
            getCommonLogger().logErrorAsync(`BadWordEventRepository.insert(): Failed, got ${e}`);
        }
    }

    /**
     * Get all events for a specific bad word in a channel, ordered by timestamp.
     */
    static async getEvents(channelId: string, badword: string): Promise<BadWordEventRow[]> {
        if (!DatabaseManager.isAvailable()) return [];

        try {
            const result = await DatabaseManager.get().query<BadWordEventRow>(
                `SELECT id, channel_id, badword, user_id, user_name, timestamp
                 FROM badword_events
                 WHERE channel_id = $1 AND badword = $2
                 ORDER BY timestamp ASC`,
                [channelId, badword]
            );
            return result.rows;
        } catch (e) {
            getCommonLogger().logErrorAsync(`BadWordEventRepository.getEvents(): Failed, got ${e}`);
            return [];
        }
    }

    /**
     * Bulk insert events (for migration from JSON files).
     */
    static async bulkInsert(events: { channelId: string; badword: string; userId: string; userName: string; timestamp: number }[]): Promise<void> {
        if (!DatabaseManager.isAvailable() || events.length === 0) return;

        const client = await DatabaseManager.get().connect();
        try {
            await client.query('BEGIN');

            const batchSize = 100;
            for (let i = 0; i < events.length; i += batchSize) {
                const batch = events.slice(i, i + batchSize);
                const values: unknown[] = [];
                const placeholders: string[] = [];

                batch.forEach((event, idx) => {
                    const offset = idx * 5;
                    placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, NOW())`);
                    values.push(event.channelId, event.badword, event.userId, event.userName, event.timestamp);
                });

                await client.query(
                    `INSERT INTO badword_events (channel_id, badword, user_id, user_name, timestamp, created_at)
                     VALUES ${placeholders.join(', ')}
                     ON CONFLICT ON CONSTRAINT uq_badword_event DO NOTHING`,
                    values
                );
            }

            await client.query('COMMIT');
            getCommonLogger().logInfo(`BadWordEventRepository.bulkInsert(): Inserted ${events.length} events.`);
        } catch (e) {
            await client.query('ROLLBACK');
            getCommonLogger().logErrorAsync(`BadWordEventRepository.bulkInsert(): Failed, got ${e}`);
        } finally {
            client.release();
        }
    }
}
