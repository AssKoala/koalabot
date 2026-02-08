import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockIsAvailable = vi.fn(() => true);
const mockLeaderboardGetAllForGuild = vi.fn();
const mockLeaderboardBulkUpsert = vi.fn();
const mockMessageCountGetAllForGuild = vi.fn();
const mockMessageCountBulkUpsert = vi.fn();
const mockBadWordGetEvents = vi.fn();
const mockBadWordBulkInsert = vi.fn();

vi.mock('../../db/databasemanager.js', () => ({
    DatabaseManager: {
        isAvailable: () => mockIsAvailable(),
    },
}));

vi.mock('../../db/leaderboardrepository.js', () => ({
    LeaderboardRepository: {
        getAllForGuild: (...args: unknown[]) => mockLeaderboardGetAllForGuild(...args),
        bulkUpsert: (...args: unknown[]) => mockLeaderboardBulkUpsert(...args),
    },
}));

vi.mock('../../db/messagecountrepository.js', () => ({
    MessageCountRepository: {
        getAllMessageCountsForGuild: (...args: unknown[]) => mockMessageCountGetAllForGuild(...args),
        bulkUpsertMessageCounts: (...args: unknown[]) => mockMessageCountBulkUpsert(...args),
    },
}));

vi.mock('../../db/badwordeventrepository.js', () => ({
    BadWordEventRepository: {
        getEvents: (...args: unknown[]) => mockBadWordGetEvents(...args),
        bulkInsert: (...args: unknown[]) => mockBadWordBulkInsert(...args),
    },
}));

vi.mock('../../logging/logmanager.js', () => ({
    getCommonLogger: () => ({
        logInfo: vi.fn(),
        logErrorAsync: vi.fn(),
    }),
}));

import { DatabaseBootstrapSync, BadWordStartupEvent } from '../../db/databasebootstrapsync.js';

describe('DatabaseBootstrapSync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsAvailable.mockReturnValue(true);
        mockLeaderboardGetAllForGuild.mockResolvedValue([]);
        mockLeaderboardBulkUpsert.mockResolvedValue(undefined);
        mockMessageCountGetAllForGuild.mockResolvedValue([]);
        mockMessageCountBulkUpsert.mockResolvedValue(undefined);
        mockBadWordGetEvents.mockResolvedValue([]);
        mockBadWordBulkInsert.mockResolvedValue(undefined);
    });

    test('syncLeaderboardStartupData seeds only guilds without DB rows', async () => {
        const appliedRows: { guildId: string; rows: { user_name: string; word: string; count: number }[] }[] = [];
        const setMessageCount = vi.fn();
        const leaderboardCalls = new Map<string, number>();
        const messageCountCalls = new Map<string, number>();

        mockLeaderboardGetAllForGuild.mockImplementation(async (guildId: string) => {
            const callNum = (leaderboardCalls.get(guildId) ?? 0) + 1;
            leaderboardCalls.set(guildId, callNum);

            if (guildId === 'guild-1') {
                return [{ user_name: 'alice', word: 'heck', count: 9 }];
            }

            if (guildId === 'guild-2') {
                return callNum === 1
                    ? []
                    : [{ user_name: 'bob', word: 'heck', count: 4 }];
            }

            return [];
        });

        mockMessageCountGetAllForGuild.mockImplementation(async (guildId: string) => {
            const callNum = (messageCountCalls.get(guildId) ?? 0) + 1;
            messageCountCalls.set(guildId, callNum);

            if (guildId === 'guild-1') {
                return [{ user_name: 'alice', count: 20 }];
            }

            if (guildId === 'guild-2') {
                return callNum === 1
                    ? []
                    : [{ user_name: 'bob', count: 12 }];
            }

            return [];
        });

        await DatabaseBootstrapSync.syncLeaderboardStartupData({
            guildCaches: new Map([
                ['guild-1', { getAuthorCountEntries: () => [['alice', 11]] }],
                ['guild-2', { getAuthorCountEntries: () => [['bob', 10]] }],
            ]),
            getInMemoryLeaderboardRows: () => [
                { guildId: 'guild-1', userName: 'alice', word: 'heck', count: 3 },
                { guildId: 'guild-2', userName: 'bob', word: 'heck', count: 2 },
            ],
            applyDatabaseLeaderboardRowsForGuild: (guildId, rows) => {
                appliedRows.push({ guildId, rows });
            },
            getInMemoryMessageCount: () => 1,
            setInMemoryMessageCount: setMessageCount,
        });

        expect(mockLeaderboardBulkUpsert).toHaveBeenCalledTimes(1);
        expect(mockLeaderboardBulkUpsert).toHaveBeenCalledWith([
            { guildId: 'guild-2', userName: 'bob', word: 'heck', count: 2 },
        ]);
        expect(mockMessageCountBulkUpsert).toHaveBeenCalledTimes(1);
        expect(mockMessageCountBulkUpsert).toHaveBeenCalledWith([
            { guildId: 'guild-2', userName: 'bob', count: 10 },
        ]);
        expect(appliedRows).toEqual([
            { guildId: 'guild-1', rows: [{ user_name: 'alice', word: 'heck', count: 9 }] },
            { guildId: 'guild-2', rows: [{ user_name: 'bob', word: 'heck', count: 4 }] },
        ]);
        expect(setMessageCount).toHaveBeenCalledWith('guild-2', 'bob', 12);
    });

    test('syncBadWordStartupData always bulk-inserts JSON and merges DB rows', async () => {
        const seededByChannel = new Map<string, readonly BadWordStartupEvent[]>();
        const inMemoryByChannel = new Map<string, readonly BadWordStartupEvent[]>([
            ['channel-1', [{ userId: 'u1', userName: 'alice', timestamp: 1000 }]],
        ]);

        mockBadWordGetEvents.mockImplementation(async (channelId: string) => {
            if (channelId === 'channel-1') {
                return [
                    { user_id: 'u3', user_name: 'claire', timestamp: 900 },
                    { user_id: 'u1', user_name: 'alice', timestamp: 1000 },
                ];
            }
            if (channelId === 'channel-2') {
                return [{ user_id: 'u2', user_name: 'bob', timestamp: 2000 }];
            }
            return [];
        });

        await DatabaseBootstrapSync.syncBadWordStartupData({
            getBadWord: () => 'heck',
            getTrackingChannels: () => ['channel-1', 'channel-2'],
            getTrackedEvents: (channelId: string) => inMemoryByChannel.get(channelId) ?? [],
            mergeTrackedEvents: (channelId: string, events: readonly BadWordStartupEvent[]) => {
                seededByChannel.set(channelId, events);
            },
        }, {
            logInfo: vi.fn(),
            logError: vi.fn(),
        });

        expect(mockBadWordBulkInsert).toHaveBeenCalledWith([
            {
                channelId: 'channel-1',
                badword: 'heck',
                userId: 'u1',
                userName: 'alice',
                timestamp: 1000,
            },
        ]);

        expect(seededByChannel.get('channel-2')).toEqual([
            { userId: 'u2', userName: 'bob', timestamp: 2000 },
        ]);
        expect(seededByChannel.get('channel-1')).toEqual([
            { userId: 'u3', userName: 'claire', timestamp: 900 },
            { userId: 'u1', userName: 'alice', timestamp: 1000 },
        ]);
    });
});
