import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockConfigGet = vi.fn();
const mockReadJsonFileSync = vi.fn();
const mockDatabaseIsAvailable = vi.fn();
const mockRegisterMessageCreateListener = vi.fn();
const mockRegisterWordListener = vi.fn();
const mockIncrementMessageCount = vi.fn();
const mockIncrementWordCount = vi.fn();
const mockInsertBadWordEvent = vi.fn();

vi.mock('config', () => ({
    default: {
        get: (key: string) => mockConfigGet(key),
    },
}));

vi.mock('../../sys/jsonreader.js', () => ({
    readJsonFileSync: (path: string) => mockReadJsonFileSync(path),
}));

vi.mock('../../db/databasemanager.js', () => ({
    DatabaseManager: {
        isAvailable: () => mockDatabaseIsAvailable(),
    },
}));

vi.mock('../../listenermanager.js', () => ({
    ListenerPriority: { Low: 3 },
    ListenerManager: {
        registerMessageCreateListener: (...args: unknown[]) => mockRegisterMessageCreateListener(...args),
    },
}));

vi.mock('../../api/koalabotsystem.js', () => ({
    GetKoalaBotSystem: () => ({
        registerWordListener: (...args: unknown[]) => mockRegisterWordListener(...args),
    }),
}));

vi.mock('../../db/messagecountrepository.js', () => ({
    MessageCountRepository: {
        incrementMessageCount: (...args: unknown[]) => mockIncrementMessageCount(...args),
    },
}));

vi.mock('../../db/leaderboardrepository.js', () => ({
    LeaderboardRepository: {
        incrementWordCount: (...args: unknown[]) => mockIncrementWordCount(...args),
    },
}));

vi.mock('../../db/badwordeventrepository.js', () => ({
    BadWordEventRepository: {
        insert: (...args: unknown[]) => mockInsertBadWordEvent(...args),
    },
}));

vi.mock('../../logging/logmanager.js', () => ({
    getCommonLogger: () => ({
        logWarning: vi.fn(),
        logInfo: vi.fn(),
        logErrorAsync: vi.fn(),
    }),
}));

describe('databaselistener', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();

        mockDatabaseIsAvailable.mockReturnValue(true);
        mockReadJsonFileSync.mockReturnValue([
            { profanity: 'heck', matches: ['heck'] },
            { profanity: 'darn', matches: ['darn'] },
        ]);
        mockConfigGet.mockImplementation((key: string) => {
            switch (key) {
                case 'Global.dataPath':
                    return '/tmp/data';
                case 'Listeners.BadWordListener.badwords':
                    return 'heck,darn';
                default:
                    return '';
            }
        });

        mockIncrementMessageCount.mockResolvedValue(undefined);
        mockIncrementWordCount.mockResolvedValue(undefined);
        mockInsertBadWordEvent.mockResolvedValue(undefined);
    });

    test('registers message and word listeners when DB is available', async () => {
        await import('../../listeners/databaselistener.js');

        expect(mockRegisterMessageCreateListener).toHaveBeenCalledTimes(1);
        expect(mockRegisterWordListener).toHaveBeenCalledTimes(2);
        expect(mockRegisterWordListener).toHaveBeenNthCalledWith(1, expect.any(Object), 'heck');
        expect(mockRegisterWordListener).toHaveBeenNthCalledWith(2, expect.any(Object), 'darn');
    });

    test('does not register when DB is unavailable', async () => {
        mockDatabaseIsAvailable.mockReturnValue(false);

        await import('../../listeners/databaselistener.js');

        expect(mockRegisterMessageCreateListener).not.toHaveBeenCalled();
        expect(mockRegisterWordListener).not.toHaveBeenCalled();
    });

    test('persists message count and profanity counts on message create', async () => {
        await import('../../listeners/databaselistener.js');
        const listener = mockRegisterMessageCreateListener.mock.calls[0][0];

        await listener.onDiscordMessageCreate(
            {},
            {
                author: { bot: false, username: 'alice', id: 'u1' },
                guildId: 'g1',
                content: 'heck and darn',
            }
        );

        expect(mockIncrementMessageCount).toHaveBeenCalledWith('g1', 'alice');
        expect(mockIncrementWordCount).toHaveBeenCalledWith('g1', 'alice', 'heck');
        expect(mockIncrementWordCount).toHaveBeenCalledWith('g1', 'alice', 'darn');
    });

    test('persists badword event on word detection', async () => {
        await import('../../listeners/databaselistener.js');
        const listener = mockRegisterMessageCreateListener.mock.calls[0][0];

        await listener.onWordDetected(
            {},
            { word: 'heck', matches: ['heck'] },
            {
                channelId: 'c1',
                author: { id: 'u1', username: 'alice' },
                member: { user: { id: 'u1', username: 'alice' } },
            }
        );

        expect(mockInsertBadWordEvent).toHaveBeenCalledTimes(1);
        expect(mockInsertBadWordEvent.mock.calls[0][0]).toBe('c1');
        expect(mockInsertBadWordEvent.mock.calls[0][1]).toBe('heck');
        expect(mockInsertBadWordEvent.mock.calls[0][2]).toBe('u1');
        expect(mockInsertBadWordEvent.mock.calls[0][3]).toBe('alice');
        expect(typeof mockInsertBadWordEvent.mock.calls[0][4]).toBe('number');
    });
});
