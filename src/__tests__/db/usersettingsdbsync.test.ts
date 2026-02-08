import { describe, test, expect, vi, beforeEach } from 'vitest';
import { UserSettingsData } from '../../app/user/usersettingsmanager.js';

const mockIsAvailable = vi.fn(() => true);
const mockIsEmpty = vi.fn();
const mockGetAll = vi.fn();
const mockUpsert = vi.fn();

vi.mock('../../db/databasemanager.js', () => ({
    DatabaseManager: {
        isAvailable: () => mockIsAvailable(),
    },
}));

vi.mock('../../db/usersettingsrepository.js', () => ({
    UserSettingsRepository: {
        isEmpty: (...args: unknown[]) => mockIsEmpty(...args),
        getAll: (...args: unknown[]) => mockGetAll(...args),
        upsert: (...args: unknown[]) => mockUpsert(...args),
    },
}));

vi.mock('../../logging/logmanager.js', () => ({
    getCommonLogger: () => ({
        logInfo: vi.fn(),
        logErrorAsync: vi.fn(),
    }),
}));

import { UserSettingsDbSync, UserSettingsSyncStore } from '../../db/usersettingsdbsync.js';

describe('UserSettingsDbSync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsAvailable.mockReturnValue(true);
        mockIsEmpty.mockResolvedValue(true);
        mockGetAll.mockResolvedValue([]);
        mockUpsert.mockResolvedValue(undefined);
    });

    function createStore(initial: UserSettingsData[] = []): { store: UserSettingsSyncStore; map: Map<string, UserSettingsData>; getHook: () => ((data: UserSettingsData) => void) | null } {
        const map = new Map<string, UserSettingsData>();
        for (const item of initial) {
            map.set(item.name, item);
        }

        let hook: ((data: UserSettingsData) => void) | null = null;
        const store: UserSettingsSyncStore = {
            has: (username: string) => map.has(username),
            getAllSettings: () => [...map.values()],
            setInMemoryOnly: (data: UserSettingsData) => {
                map.set(data.name, data);
                return true;
            },
            setPersistenceHook: (persistHook) => {
                hook = persistHook;
            },
        };

        return { store, map, getHook: () => hook };
    }

    test('attachPersistence installs hook and persists asynchronously', async () => {
        const { store, getHook } = createStore();
        UserSettingsDbSync.attachPersistence(store);

        const hook = getHook();
        expect(hook).not.toBeNull();

        hook!(new UserSettingsData('alice', 'Dallas, TX', 'kelvin', 'gpt-4o', 'hi'));
        await Promise.resolve();

        expect(mockUpsert).toHaveBeenCalledWith('alice', {
            weatherSettings: expect.objectContaining({ location: 'Dallas, TX', preferredUnits: 'kelvin' }),
            chatSettings: expect.objectContaining({ preferredAiModel: 'gpt-4o', customPrompt: 'hi' }),
        });
    });

    test('syncStartup migrates in-memory settings when DB is empty', async () => {
        const { store } = createStore([new UserSettingsData('alice', 'Austin, TX', 'celsius', 'gpt-4o', 'prompt')]);
        mockIsEmpty.mockResolvedValue(true);

        await UserSettingsDbSync.syncStartup(store);

        expect(mockUpsert).toHaveBeenCalledTimes(1);
        expect(mockUpsert).toHaveBeenCalledWith('alice', expect.any(Object));
    });

    test('syncStartup merges DB settings and re-syncs all in-memory settings', async () => {
        const existing = new UserSettingsData('alice', 'Seattle, WA', 'fahrenheit', 'gpt-4o', 'existing');
        const { store, map } = createStore([existing]);
        mockIsEmpty.mockResolvedValue(false);
        mockGetAll.mockResolvedValue([
            {
                user_name: 'alice',
                settings_json: {
                    weatherSettings: { location: 'Ignore Me', preferredUnits: 'rankine' },
                    chatSettings: { preferredAiModel: 'ignore', customPrompt: 'ignore' },
                },
            },
            {
                user_name: 'bob',
                settings_json: {
                    weatherSettings: { location: 'Boston, MA', preferredUnits: 'kelvin' },
                    chatSettings: { preferredAiModel: 'gpt-4o-mini', customPrompt: 'db prompt' },
                },
            },
        ]);

        await UserSettingsDbSync.syncStartup(store);
        await Promise.resolve();

        expect(map.has('bob')).toBe(true);
        expect(map.get('bob')?.weatherSettings.location).toBe('Boston, MA');
        expect(mockUpsert).toHaveBeenCalledTimes(2);
        expect(mockUpsert).toHaveBeenCalledWith('alice', expect.any(Object));
        expect(mockUpsert).toHaveBeenCalledWith('bob', expect.any(Object));
    });
});
