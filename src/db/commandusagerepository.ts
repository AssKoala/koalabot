import { DatabaseManager } from './databasemanager.js';
import { getCommonLogger } from '../logging/logmanager.js';

export class CommandUsageRepository {

    /**
     * Record a command invocation.
     */
    static async insert(guildId: string | null, userId: string | null, userName: string | null, commandName: string, latencyMs: number): Promise<void> {
        if (!DatabaseManager.isAvailable()) return;

        try {
            await DatabaseManager.get().query(
                `INSERT INTO command_usage (guild_id, user_id, user_name, command_name, latency_ms, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [guildId, userId, userName, commandName, Math.round(latencyMs)]
            );
        } catch (e) {
            getCommonLogger().logErrorAsync(`CommandUsageRepository.insert(): Failed, got ${e}`);
        }
    }
}
