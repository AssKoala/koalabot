/**
 * Shared mock setup for DB repository tests.
 *
 * Import this file BEFORE importing the repository under test.
 * vi.mock() calls are hoisted by Vitest, so the mocks take effect
 * before any repository module is imported in the consuming test file.
 *
 * Usage:
 *   import { mockQuery, mockConnect, setMockIsAvailable } from './__helpers.js';
 *   import { SomeRepository } from '../../db/somerepository.js';
 */
import { vi, beforeEach } from 'vitest';

export const mockQuery = vi.fn();
export const mockConnect = vi.fn();

let _mockIsAvailable = true;
export function setMockIsAvailable(value: boolean) {
    _mockIsAvailable = value;
}

vi.mock('../../db/databasemanager.js', () => ({
    DatabaseManager: {
        isAvailable: () => _mockIsAvailable,
        get: () => ({
            query: mockQuery,
            connect: mockConnect,
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

beforeEach(() => {
    vi.clearAllMocks();
    _mockIsAvailable = true;
    mockQuery.mockResolvedValue({ rows: [] });
});
