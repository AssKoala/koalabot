import { DatabaseManager } from './databasemanager.js';
import { getCommonLogger } from '../logging/logmanager.js';

export class LLMUsageRepository {

    /**
     * Record an LLM API call.
     */
    static async insert(
        guildId: string | null,
        userId: string | null,
        userName: string | null,
        provider: string,
        model: string,
        promptTokens: number | null,
        completionTokens: number | null,
        latencyMs: number
    ): Promise<void> {
        if (!DatabaseManager.isAvailable()) return;

        try {
            await DatabaseManager.get().query(
                `INSERT INTO llm_usage (guild_id, user_id, user_name, provider, model, prompt_tokens, completion_tokens, latency_ms, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
                [guildId, userId, userName, provider, model, promptTokens, completionTokens, Math.round(latencyMs)]
            );
        } catch (e) {
            getCommonLogger().logErrorAsync(`LLMUsageRepository.insert(): Failed, got ${e}`);
        }
    }
}
