import { DatabaseManager } from './databasemanager.js';
import { LeaderboardRepository } from './leaderboardrepository.js';
import { MessageCountRepository } from './messagecountrepository.js';
import { BadWordEventRepository } from './badwordeventrepository.js';
import { getCommonLogger } from '../logging/logmanager.js';

export interface GuildCacheView {
    getAuthorCountEntries(): Array<[string, number]>;
}

export interface LeaderboardStartupSyncOptions {
    guildCaches: Map<string, GuildCacheView>;
    getInMemoryLeaderboardRows: () => { guildId: string; userName: string; word: string; count: number }[];
    applyDatabaseLeaderboardRowsForGuild: (guildId: string, rows: { user_name: string; word: string; count: number }[]) => void;
    getInMemoryMessageCount: (guildId: string, userName: string) => number;
    setInMemoryMessageCount: (guildId: string, userName: string, count: number) => void;
}

export interface BadWordStartupEvent {
    timestamp: number;
    userId: string;
    userName: string;
}

export interface BadWordSyncLogger {
    logInfo(message: string): void;
    logError(message: string): void;
}

export interface BadWordStartupSyncTarget {
    getBadWord(): string;
    getTrackingChannels(): readonly string[];
    getTrackedEvents(channelId: string): readonly BadWordStartupEvent[];
    mergeTrackedEvents(channelId: string, events: readonly BadWordStartupEvent[]): void;
}

export class DatabaseBootstrapSync {
    static async syncLeaderboardStartupData(options: LeaderboardStartupSyncOptions): Promise<void> {
        if (!DatabaseManager.isAvailable()) return;

        try {
            await this.syncLeaderboardDataPerGuild(options);
            getCommonLogger().logInfo('Leaderboard: Loaded lifetime counts from database.');
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to sync leaderboard data with DB: ${e}`);
        }
    }

    static async syncBadWordStartupData(target: BadWordStartupSyncTarget, logger: BadWordSyncLogger): Promise<void> {
        if (!DatabaseManager.isAvailable()) return;

        const badword = target.getBadWord();

        for (const channelId of target.getTrackingChannels()) {
            const inMemoryEvents = target.getTrackedEvents(channelId);
            if (inMemoryEvents.length === 0) continue;

            try {
                const bulkEvents = inMemoryEvents.map((event) => ({
                    channelId,
                    badword,
                    userId: event.userId,
                    userName: event.userName,
                    timestamp: event.timestamp,
                }));

                logger.logInfo(`BadWordListener: Migrating ${bulkEvents.length} events for "${badword}" in channel ${channelId} to DB.`);
                await BadWordEventRepository.bulkInsert(bulkEvents);
            } catch (e) {
                logger.logError(`BadWordListener: Migration failed for "${badword}" in channel ${channelId}, got ${e}`);
            }
        }

        for (const channelId of target.getTrackingChannels()) {
            try {
                const dbRows = await BadWordEventRepository.getEvents(channelId, badword);
                if (dbRows.length === 0) continue;

                const dbEvents: BadWordStartupEvent[] = dbRows.map((row) => ({
                    userId: row.user_id,
                    userName: row.user_name,
                    timestamp: Number(row.timestamp),
                }));
                const merged = this.mergeBadWordEvents(target.getTrackedEvents(channelId), dbEvents);

                target.mergeTrackedEvents(channelId, merged);
                logger.logInfo(`BadWordListener: Loaded ${merged.length} merged events for "${badword}" in channel ${channelId}.`);
            } catch (e) {
                logger.logError(`BadWordListener: Failed to load from DB for "${badword}" in channel ${channelId}, got ${e}`);
            }
        }
    }

    private static mergeBadWordEvents(inMemoryEvents: readonly BadWordStartupEvent[], dbEvents: readonly BadWordStartupEvent[]): BadWordStartupEvent[] {
        const dedup = new Map<string, BadWordStartupEvent>();
        const add = (event: BadWordStartupEvent) => {
            dedup.set(`${event.userId}:${event.timestamp}`, event);
        };

        inMemoryEvents.forEach(add);
        dbEvents.forEach(add);

        const merged = Array.from(dedup.values());
        merged.sort((left, right) => left.timestamp - right.timestamp);
        return merged;
    }

    private static async syncLeaderboardDataPerGuild(options: LeaderboardStartupSyncOptions): Promise<void> {
        const allInMemoryLeaderboardRows = options.getInMemoryLeaderboardRows();

        for (const [guildId] of options.guildCaches) {
            const existingLeaderboardRows = await LeaderboardRepository.getAllForGuild(guildId);
            if (existingLeaderboardRows.length === 0) {
                const guildLeaderboardRows = allInMemoryLeaderboardRows.filter(row => row.guildId === guildId);
                if (guildLeaderboardRows.length > 0) {
                    await LeaderboardRepository.bulkUpsert(guildLeaderboardRows);
                }
            }

            const existingMessageCountRows = await MessageCountRepository.getAllMessageCountsForGuild(guildId);
            if (existingMessageCountRows.length === 0) {
                const guildCache = options.guildCaches.get(guildId);
                if (guildCache) {
                    const countRows = guildCache.getAuthorCountEntries()
                        .filter(([, count]) => count > 0)
                        .map(([userName, count]) => ({ guildId, userName, count }));
                    if (countRows.length > 0) {
                        await MessageCountRepository.bulkUpsertMessageCounts(countRows);
                    }
                }
            }

            const leaderboardRows = await LeaderboardRepository.getAllForGuild(guildId);
            if (leaderboardRows.length > 0) {
                options.applyDatabaseLeaderboardRowsForGuild(guildId, leaderboardRows);
            }

            const messageCountRows = await MessageCountRepository.getAllMessageCountsForGuild(guildId);
            for (const row of messageCountRows) {
                const inMemoryCount = options.getInMemoryMessageCount(guildId, row.user_name);
                if (row.count > inMemoryCount) {
                    options.setInMemoryMessageCount(guildId, row.user_name, row.count);
                }
            }
        }
    }
}
