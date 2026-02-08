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

import { UserSettingsRepository } from '../../db/usersettingsrepository.js';

beforeEach(() => {
    vi.clearAllMocks();
    mockIsAvailable = true;
    mockQuery.mockResolvedValue({ rows: [] });
});

describe('UserSettingsRepository', () => {
    describe('upsert()', () => {
        test('returns early when DB is unavailable', async () => {
            mockIsAvailable = false;
            await UserSettingsRepository.upsert('alice', { theme: 'dark' });
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('calls query with JSON.stringify on settings', async () => {
            const settings = { theme: 'dark', lang: 'en' };
            await UserSettingsRepository.upsert('alice', settings);
            expect(mockQuery).toHaveBeenCalledOnce();
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO user_settings'),
                ['alice', JSON.stringify(settings)]
            );
        });

        test('logs error on query failure', async () => {
            mockQuery.mockRejectedValue(new Error('connection lost'));
            await expect(UserSettingsRepository.upsert('alice', {})).resolves.toBeUndefined();
        });
    });

    describe('get()', () => {
        test('returns null when DB is unavailable', async () => {
            mockIsAvailable = false;
            const result = await UserSettingsRepository.get('alice');
            expect(result).toBeNull();
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('returns the row when user is found', async () => {
            const row = { user_name: 'alice', settings_json: { theme: 'dark' } };
            mockQuery.mockResolvedValue({ rows: [row] });
            const result = await UserSettingsRepository.get('alice');
            expect(result).toEqual(row);
        });

        test('returns null when user is not found', async () => {
            mockQuery.mockResolvedValue({ rows: [] });
            const result = await UserSettingsRepository.get('nobody');
            expect(result).toBeNull();
        });

        test('returns null on query failure', async () => {
            mockQuery.mockRejectedValue(new Error('timeout'));
            const result = await UserSettingsRepository.get('alice');
            expect(result).toBeNull();
        });
    });

    describe('getAll()', () => {
        test('returns empty array when DB is unavailable', async () => {
            mockIsAvailable = false;
            const result = await UserSettingsRepository.getAll();
            expect(result).toEqual([]);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('returns all rows on success', async () => {
            const rows = [
                { user_name: 'alice', settings_json: { theme: 'dark' } },
                { user_name: 'bob', settings_json: { theme: 'light' } },
            ];
            mockQuery.mockResolvedValue({ rows });
            const result = await UserSettingsRepository.getAll();
            expect(result).toEqual(rows);
        });

        test('returns empty array on query failure', async () => {
            mockQuery.mockRejectedValue(new Error('timeout'));
            const result = await UserSettingsRepository.getAll();
            expect(result).toEqual([]);
        });
    });

    describe('isEmpty()', () => {
        test('returns true when DB is unavailable', async () => {
            mockIsAvailable = false;
            const result = await UserSettingsRepository.isEmpty();
            expect(result).toBe(true);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test('returns true when count is 0', async () => {
            mockQuery.mockResolvedValue({ rows: [{ count: '0' }] });
            const result = await UserSettingsRepository.isEmpty();
            expect(result).toBe(true);
        });

        test('returns false when count is greater than 0', async () => {
            mockQuery.mockResolvedValue({ rows: [{ count: '5' }] });
            const result = await UserSettingsRepository.isEmpty();
            expect(result).toBe(false);
        });

        test('returns true on query failure', async () => {
            mockQuery.mockRejectedValue(new Error('timeout'));
            const result = await UserSettingsRepository.isEmpty();
            expect(result).toBe(true);
        });
    });
});
