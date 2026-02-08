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

import { CommandUsageRepository } from '../../db/commandusagerepository.js';

beforeEach(() => {
    vi.clearAllMocks();
    mockIsAvailable = true;
    mockQuery.mockResolvedValue({ rows: [] });
});

describe('CommandUsageRepository', () => {
    describe('insert()', () => {
        test('returns early when DB is unavailable', async () => {
            mockIsAvailable = false;
            await CommandUsageRepository.insert('guild1', 'user1', 'Alice', 'ping', 42);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('calls query with Math.round on latencyMs', async () => {
            await CommandUsageRepository.insert('guild1', 'user1', 'Alice', 'ping', 42.7);
            expect(mockQuery).toHaveBeenCalledOnce();
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO command_usage'),
                ['guild1', 'user1', 'Alice', 'ping', 43]
            );
        });

        test('accepts null guild, user, and userName', async () => {
            await CommandUsageRepository.insert(null, null, null, 'help', 10);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO command_usage'),
                [null, null, null, 'help', 10]
            );
        });

        test('logs error on query failure', async () => {
            mockQuery.mockRejectedValue(new Error('connection lost'));
            await expect(CommandUsageRepository.insert('g', 'u', 'n', 'cmd', 1)).resolves.toBeUndefined();
        });
    });
});
