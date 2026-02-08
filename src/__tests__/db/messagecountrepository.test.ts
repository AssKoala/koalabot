import { vi, describe, test, expect, beforeEach } from 'vitest';

const mockQuery = vi.fn();
let mockIsAvailable = true;

vi.mock('../../db/databasemanager.js', () => ({
    DatabaseManager: {
        isAvailable: () => mockIsAvailable,
        get: () => ({
            query: mockQuery,
        }),
    },
}));

vi.mock('../../logging/logmanager.js', () => ({
    getCommonLogger: () => ({
        logInfo: vi.fn(),
        logErrorAsync: vi.fn(),
        logError: vi.fn(),
        logDebug: vi.fn(),
        logWarning: vi.fn(),
    }),
}));

import { MessageCountRepository } from '../../db/messagecountrepository.js';

beforeEach(() => {
    vi.clearAllMocks();
    mockIsAvailable = true;
    mockQuery.mockResolvedValue({ rows: [] });
});

describe('MessageCountRepository', () => {

    describe('incrementMessageCount', () => {
        test('returns early when DB unavailable', async () => {
            mockIsAvailable = false;
            await MessageCountRepository.incrementMessageCount('g1', 'user1');
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('calls query with correct SQL and params', async () => {
            await MessageCountRepository.incrementMessageCount('g1', 'user1');
            expect(mockQuery).toHaveBeenCalledOnce();
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO message_counts'),
                ['g1', 'user1']
            );
        });

        test('catches error on query failure', async () => {
            mockQuery.mockRejectedValueOnce(new Error('db error'));
            await expect(MessageCountRepository.incrementMessageCount('g1', 'user1')).resolves.toBeUndefined();
        });
    });

    describe('getMessageCount', () => {
        test('returns 0 when DB unavailable', async () => {
            mockIsAvailable = false;
            const result = await MessageCountRepository.getMessageCount('g1', 'user1');
            expect(result).toBe(0);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('returns 0 when no rows found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });
            const result = await MessageCountRepository.getMessageCount('g1', 'user1');
            expect(result).toBe(0);
        });

        test('returns count when row exists', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{ count: 42 }] });
            const result = await MessageCountRepository.getMessageCount('g1', 'user1');
            expect(result).toBe(42);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('SELECT count FROM message_counts'),
                ['g1', 'user1']
            );
        });

        test('returns 0 on query failure', async () => {
            mockQuery.mockRejectedValueOnce(new Error('db error'));
            const result = await MessageCountRepository.getMessageCount('g1', 'user1');
            expect(result).toBe(0);
        });
    });

    describe('getAllMessageCountsForGuild', () => {
        test('returns empty array when DB unavailable', async () => {
            mockIsAvailable = false;
            const result = await MessageCountRepository.getAllMessageCountsForGuild('g1');
            expect(result).toEqual([]);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('returns rows on success', async () => {
            const rows = [{ user_name: 'u1', count: 100 }];
            mockQuery.mockResolvedValueOnce({ rows });
            const result = await MessageCountRepository.getAllMessageCountsForGuild('g1');
            expect(result).toEqual(rows);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('SELECT user_name, count FROM message_counts'),
                ['g1']
            );
        });

        test('returns empty array on query failure', async () => {
            mockQuery.mockRejectedValueOnce(new Error('db error'));
            const result = await MessageCountRepository.getAllMessageCountsForGuild('g1');
            expect(result).toEqual([]);
        });
    });

    describe('bulkUpsertMessageCounts', () => {
        test('returns early when DB unavailable', async () => {
            mockIsAvailable = false;
            await MessageCountRepository.bulkUpsertMessageCounts([{ guildId: 'g1', userName: 'u1', count: 1 }]);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('returns early for empty rows', async () => {
            await MessageCountRepository.bulkUpsertMessageCounts([]);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('calls query with correct params for a single batch', async () => {
            const rows = [
                { guildId: 'g1', userName: 'u1', count: 10 },
                { guildId: 'g1', userName: 'u2', count: 20 },
            ];
            await MessageCountRepository.bulkUpsertMessageCounts(rows);
            expect(mockQuery).toHaveBeenCalledOnce();
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO message_counts'),
                ['g1', 'u1', 10, 'g1', 'u2', 20]
            );
        });

        test('batches rows in groups of 100', async () => {
            const rows = Array.from({ length: 150 }, (_, i) => ({
                guildId: 'g1',
                userName: `u${i}`,
                count: i,
            }));
            await MessageCountRepository.bulkUpsertMessageCounts(rows);
            expect(mockQuery).toHaveBeenCalledTimes(2);
        });

        test('catches error on query failure', async () => {
            mockQuery.mockRejectedValueOnce(new Error('db error'));
            await expect(
                MessageCountRepository.bulkUpsertMessageCounts([{ guildId: 'g1', userName: 'u1', count: 1 }])
            ).resolves.toBeUndefined();
        });
    });
});
