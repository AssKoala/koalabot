import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mock setup (must be before imports that use these modules) ---

const mockLogInfo = vi.fn();
const mockLogErrorAsync = vi.fn();

vi.mock('../../logging/logmanager.js', () => ({
    getCommonLogger: () => ({
        logInfo: mockLogInfo,
        logErrorAsync: mockLogErrorAsync,
    }),
}));

const mockRelease = vi.fn();
const mockClientQuery = vi.fn().mockResolvedValue({ rows: [] });
const mockPoolClient = {
    query: mockClientQuery,
    release: mockRelease,
};

const mockPoolQuery = vi.fn().mockResolvedValue({ rows: [] });
const mockPoolConnect = vi.fn().mockResolvedValue(mockPoolClient);
const mockPoolEnd = vi.fn().mockResolvedValue(undefined);
const mockPoolOn = vi.fn();
const mockUnref = vi.fn();

// Track Pool constructor calls for assertions
const poolConstructorCalls: unknown[][] = [];

vi.mock('pg', () => {
    // Must use a function declaration (not arrow) so it can be called with `new`
    function MockPool(this: any, ...args: unknown[]) {
        poolConstructorCalls.push(args);
        this.query = mockPoolQuery;
        this.connect = mockPoolConnect;
        this.end = mockPoolEnd;
        this.on = mockPoolOn;
    }
    return { default: { Pool: MockPool, types: { setTypeParser: vi.fn() } } };
});

const configStore: Record<string, unknown> = {};

vi.mock('config', () => ({
    default: {
        has: vi.fn((key: string) => key in configStore),
        get: vi.fn((key: string) => {
            if (!(key in configStore)) throw new Error(`Configuration property "${key}" is not defined`);
            return configStore[key];
        }),
    },
}));

vi.mock('fs', () => ({
    default: {
        readdirSync: vi.fn().mockReturnValue([]),
        readFileSync: vi.fn().mockReturnValue(''),
    },
}));

import pg from 'pg';
import fs from 'fs';
import { DatabaseManager } from '../../db/databasemanager.js';

// Helper to set config values for tests
function setConfig(values: Record<string, unknown>) {
    for (const key of Object.keys(configStore)) {
        delete configStore[key];
    }
    for (const [key, value] of Object.entries(values)) {
        configStore[key] = value;
    }
}

// Helper for a standard "enabled with URL" config
function setEnabledConfig(extra: Record<string, unknown> = {}) {
    setConfig({
        'Database.enabled': true,
        'Database.url': 'postgresql://localhost:5432/testdb',
        ...extra,
    });
}

describe('DatabaseManager', () => {
    beforeEach(() => {
        // Reset singleton state
        (DatabaseManager as any).instance = null;
        (DatabaseManager as any)._initializing = false;

        // Clear constructor tracking
        poolConstructorCalls.length = 0;

        // Reset all mocks
        vi.clearAllMocks();

        // Reset config store
        setConfig({});

        // Default mock implementations
        mockPoolQuery.mockResolvedValue({ rows: [] });
        mockPoolConnect.mockResolvedValue(mockPoolClient);
        mockPoolEnd.mockResolvedValue(undefined);
        mockClientQuery.mockResolvedValue({ rows: [] });
        (fs.readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([]);
        (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('');
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // =========================================================================
    // init() tests
    // =========================================================================
    describe('init()', () => {
        test('when Database.enabled is false, should not create pool and should log disabled message', async () => {
            setConfig({ 'Database.enabled': false });

            await DatabaseManager.init();

            expect(poolConstructorCalls).toHaveLength(0);
            expect(DatabaseManager.isAvailable()).toBe(false);
            expect(mockLogInfo).toHaveBeenCalledWith(
                'DatabaseManager: Database is disabled in config, skipping initialization.'
            );
        });

        test('when Database.enabled is not set, should not create pool', async () => {
            setConfig({});

            await DatabaseManager.init();

            expect(poolConstructorCalls).toHaveLength(0);
            expect(DatabaseManager.isAvailable()).toBe(false);
        });

        test('when Database.enabled is true (boolean), should create pool and connect', async () => {
            setEnabledConfig();

            await DatabaseManager.init();

            expect(poolConstructorCalls).toHaveLength(1);
            expect(mockPoolConnect).toHaveBeenCalled();
            expect(DatabaseManager.isAvailable()).toBe(true);
        });

        test('when Database.enabled is "true" (string), should create pool and connect', async () => {
            setConfig({
                'Database.enabled': 'true',
                'Database.url': 'postgresql://localhost:5432/testdb',
            });

            await DatabaseManager.init();

            expect(poolConstructorCalls).toHaveLength(1);
            expect(DatabaseManager.isAvailable()).toBe(true);
        });

        test('when Database.enabled is "TRUE" (uppercase string), should create pool and connect', async () => {
            setConfig({
                'Database.enabled': 'TRUE',
                'Database.url': 'postgresql://localhost:5432/testdb',
            });

            await DatabaseManager.init();

            expect(poolConstructorCalls).toHaveLength(1);
            expect(DatabaseManager.isAvailable()).toBe(true);
        });

        test('when Database.port is not a number, should log error and continue without DB', async () => {
            setConfig({
                'Database.enabled': true,
                'Database.url': '',
                'Database.host': 'myhost',
                'Database.port': 'not-a-number',
                'Database.database': 'mydb',
                'Database.user': 'myuser',
                'Database.password': 'mypass',
            });

            await DatabaseManager.init();

            expect(DatabaseManager.isAvailable()).toBe(false);
            expect(mockLogErrorAsync).toHaveBeenCalledWith(
                expect.stringContaining('Invalid port value')
            );
        });

        test('when already initialized, should return immediately (idempotent)', async () => {
            setEnabledConfig();

            await DatabaseManager.init();
            expect(poolConstructorCalls).toHaveLength(1);

            // Second call should be a no-op
            await DatabaseManager.init();
            expect(poolConstructorCalls).toHaveLength(1);
        });

        test('when _initializing is true, should return immediately (reentrant guard)', async () => {
            (DatabaseManager as any)._initializing = true;
            setEnabledConfig();

            await DatabaseManager.init();

            expect(poolConstructorCalls).toHaveLength(0);
        });

        test('when DATABASE_URL is set, should use connectionString', async () => {
            setEnabledConfig({ 'Database.url': 'postgresql://user:pass@host:5432/db' });

            await DatabaseManager.init();

            expect(poolConstructorCalls).toHaveLength(1);
            expect(poolConstructorCalls[0][0]).toEqual(
                expect.objectContaining({
                    connectionString: 'postgresql://user:pass@host:5432/db',
                })
            );
            expect(mockLogInfo).toHaveBeenCalledWith(
                'DatabaseManager: Using DATABASE_URL connection string.'
            );
        });

        test('when using individual connection params, should use host/port/database/user/password', async () => {
            setConfig({
                'Database.enabled': true,
                'Database.url': '',
                'Database.host': 'myhost',
                'Database.port': '5432',
                'Database.database': 'mydb',
                'Database.user': 'myuser',
                'Database.password': 'mypass',
            });

            await DatabaseManager.init();

            expect(poolConstructorCalls).toHaveLength(1);
            expect(poolConstructorCalls[0][0]).toEqual(
                expect.objectContaining({
                    host: 'myhost',
                    port: 5432,
                    database: 'mydb',
                    user: 'myuser',
                    password: 'mypass',
                })
            );
        });

        test('when Database.url config key does not exist, should use individual params', async () => {
            setConfig({
                'Database.enabled': true,
                'Database.host': 'myhost',
                'Database.port': '5432',
                'Database.database': 'mydb',
                'Database.user': 'myuser',
                'Database.password': 'mypass',
            });

            await DatabaseManager.init();

            expect(poolConstructorCalls).toHaveLength(1);
            expect(poolConstructorCalls[0][0]).toEqual(
                expect.objectContaining({
                    host: 'myhost',
                    port: 5432,
                    database: 'mydb',
                    user: 'myuser',
                    password: 'mypass',
                })
            );
        });

        test('when pool.connect() rejects, should call pool.end(), log error, and continue', async () => {
            setEnabledConfig();
            mockPoolConnect.mockRejectedValueOnce(new Error('connection refused'));

            await DatabaseManager.init();

            expect(mockPoolEnd).toHaveBeenCalled();
            expect(mockLogErrorAsync).toHaveBeenCalledWith(
                expect.stringContaining('Failed to connect to database')
            );
            expect(DatabaseManager.isAvailable()).toBe(false);
        });

        test('when pool emits error event, should set _isAvailable to false', async () => {
            setEnabledConfig();

            let errorHandler: ((err: Error) => void) | undefined;
            mockPoolOn.mockImplementation((event: string, handler: (err: Error) => void) => {
                if (event === 'error') {
                    errorHandler = handler;
                }
            });

            await DatabaseManager.init();
            expect(DatabaseManager.isAvailable()).toBe(true);

            // Simulate pool error
            errorHandler!(new Error('unexpected pool error'));

            expect(DatabaseManager.isAvailable()).toBe(false);
            expect(mockLogErrorAsync).toHaveBeenCalledWith(
                expect.stringContaining('Unexpected pool error')
            );
        });

        test('should reset _initializing to false even on failure', async () => {
            setEnabledConfig();
            mockPoolConnect.mockRejectedValueOnce(new Error('fail'));

            await DatabaseManager.init();

            expect((DatabaseManager as any)._initializing).toBe(false);
        });
    });

    // =========================================================================
    // isAvailable() tests
    // =========================================================================
    describe('isAvailable()', () => {
        test('returns false when not initialized', () => {
            expect(DatabaseManager.isAvailable()).toBe(false);
        });

        test('returns true after successful init', async () => {
            setEnabledConfig();

            await DatabaseManager.init();

            expect(DatabaseManager.isAvailable()).toBe(true);
        });
    });

    // =========================================================================
    // get() tests
    // =========================================================================
    describe('get()', () => {
        test('throws when not initialized', () => {
            expect(() => DatabaseManager.get()).toThrow(
                'DatabaseManager not initialized. Call init() first or check isAvailable().'
            );
        });

        test('returns instance after init', async () => {
            setEnabledConfig();

            await DatabaseManager.init();

            const instance = DatabaseManager.get();
            expect(instance).toBeInstanceOf(DatabaseManager);
        });
    });

    // =========================================================================
    // query() tests
    // =========================================================================
    describe('query()', () => {
        test('delegates to pool.query with correct args', async () => {
            setEnabledConfig();
            await DatabaseManager.init();

            const expectedResult = { rows: [{ id: 1 }], command: '', rowCount: 1, oid: 0, fields: [] };
            mockPoolQuery.mockResolvedValueOnce(expectedResult);

            const result = await DatabaseManager.get().query('SELECT * FROM test WHERE id = $1', [42]);

            expect(mockPoolQuery).toHaveBeenCalledWith('SELECT * FROM test WHERE id = $1', [42]);
            expect(result).toBe(expectedResult);
        });

        test('delegates to pool.query without params', async () => {
            setEnabledConfig();
            await DatabaseManager.init();

            mockPoolQuery.mockResolvedValueOnce({ rows: [] });

            await DatabaseManager.get().query('SELECT 1');

            expect(mockPoolQuery).toHaveBeenCalledWith('SELECT 1', undefined);
        });
    });

    // =========================================================================
    // shutdown() tests
    // =========================================================================
    describe('shutdown()', () => {
        test('clears health check interval, calls pool.end(), sets _isAvailable false', async () => {
            vi.useFakeTimers();
            setEnabledConfig();

            await DatabaseManager.init();
            expect(DatabaseManager.isAvailable()).toBe(true);

            const instance = DatabaseManager.get();
            expect((instance as any).healthCheckInterval).not.toBeNull();

            await instance.shutdown();

            expect(mockPoolEnd).toHaveBeenCalled();
            expect((instance as any)._isAvailable).toBe(false);
            expect((instance as any).healthCheckInterval).toBeNull();
        });

        test('logs shutdown message', async () => {
            setEnabledConfig();
            await DatabaseManager.init();

            mockLogInfo.mockClear();
            await DatabaseManager.get().shutdown();

            expect(mockLogInfo).toHaveBeenCalledWith(
                'DatabaseManager: Database connection pool closed.'
            );
        });
    });

    // =========================================================================
    // shutdownIfAvailable() tests
    // =========================================================================
    describe('shutdownIfAvailable()', () => {
        test('calls shutdown when instance exists', async () => {
            setEnabledConfig();
            await DatabaseManager.init();

            await DatabaseManager.shutdownIfAvailable();

            expect(mockPoolEnd).toHaveBeenCalled();
        });

        test('does nothing when no instance', async () => {
            await DatabaseManager.shutdownIfAvailable();

            expect(mockPoolEnd).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // runMigrations() tests (called indirectly via init)
    // =========================================================================
    describe('runMigrations()', () => {
        test('creates schema_migrations table', async () => {
            setEnabledConfig();

            await DatabaseManager.init();

            expect(mockPoolQuery).toHaveBeenCalledWith(
                expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations')
            );
        });

        test('skips already-applied migrations', async () => {
            setEnabledConfig();

            mockPoolQuery.mockImplementation((sql: string) => {
                if (typeof sql === 'string' && sql.includes('SELECT filename')) {
                    return Promise.resolve({ rows: [{ filename: '001_init.sql' }] });
                }
                return Promise.resolve({ rows: [] });
            });

            (fs.readdirSync as ReturnType<typeof vi.fn>).mockReturnValue(['001_init.sql', '002_new.sql']);
            (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('CREATE TABLE test();');

            await DatabaseManager.init();

            // 002_new.sql should be applied, but not 001_init.sql
            expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
            expect(mockClientQuery).toHaveBeenCalledWith(
                'INSERT INTO schema_migrations (filename) VALUES ($1)',
                ['002_new.sql']
            );
            expect(mockClientQuery).not.toHaveBeenCalledWith(
                'INSERT INTO schema_migrations (filename) VALUES ($1)',
                ['001_init.sql']
            );
        });

        test('applies new migrations in order', async () => {
            setEnabledConfig();

            mockPoolQuery.mockImplementation((sql: string) => {
                if (typeof sql === 'string' && sql.includes('SELECT filename')) {
                    return Promise.resolve({ rows: [] });
                }
                return Promise.resolve({ rows: [] });
            });

            (fs.readdirSync as ReturnType<typeof vi.fn>).mockReturnValue(['001_first.sql', '002_second.sql']);
            (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((filePath: string) => {
                if (filePath.includes('001_first.sql')) return 'CREATE TABLE a();';
                if (filePath.includes('002_second.sql')) return 'CREATE TABLE b();';
                return '';
            });

            await DatabaseManager.init();

            const insertCalls = mockClientQuery.mock.calls.filter(
                (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO schema_migrations')
            );
            expect(insertCalls).toHaveLength(2);
            expect(insertCalls[0][1]).toEqual(['001_first.sql']);
            expect(insertCalls[1][1]).toEqual(['002_second.sql']);
        });

        test('rolls back on migration failure and re-throws', async () => {
            setEnabledConfig();

            mockPoolQuery.mockImplementation((sql: string) => {
                if (typeof sql === 'string' && sql.includes('SELECT filename')) {
                    return Promise.resolve({ rows: [] });
                }
                return Promise.resolve({ rows: [] });
            });

            (fs.readdirSync as ReturnType<typeof vi.fn>).mockReturnValue(['001_bad.sql']);
            (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('INVALID SQL;');

            mockClientQuery.mockImplementation((sql: string) => {
                if (sql === 'INVALID SQL;') {
                    return Promise.reject(new Error('syntax error'));
                }
                return Promise.resolve({ rows: [] });
            });

            await DatabaseManager.init();

            expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
            expect(mockRelease).toHaveBeenCalled();
            expect(DatabaseManager.isAvailable()).toBe(false);
            expect(mockLogErrorAsync).toHaveBeenCalledWith(
                expect.stringContaining('Failed to apply migration 001_bad.sql')
            );
        });

        test('handles missing migrations directory gracefully', async () => {
            setEnabledConfig();

            mockPoolQuery.mockImplementation((sql: string) => {
                if (typeof sql === 'string' && sql.includes('SELECT filename')) {
                    return Promise.resolve({ rows: [] });
                }
                return Promise.resolve({ rows: [] });
            });

            (fs.readdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
                throw new Error('ENOENT: no such file or directory');
            });

            await DatabaseManager.init();

            expect(mockLogErrorAsync).toHaveBeenCalledWith(
                expect.stringContaining('Failed to read migrations directory')
            );
            // Init should still complete successfully since missing migrations is non-fatal
            expect(DatabaseManager.isAvailable()).toBe(true);
        });

        test('uses custom migrationsPath from config when available', async () => {
            setConfig({
                'Database.enabled': true,
                'Database.url': 'postgresql://localhost:5432/testdb',
                'Database.migrationsPath': '/custom/migrations',
            });

            (fs.readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([]);

            await DatabaseManager.init();

            expect(fs.readdirSync).toHaveBeenCalledWith('/custom/migrations');
        });
    });

    // =========================================================================
    // Health check interval tests
    // =========================================================================
    describe('health check interval', () => {
        test('recovers _isAvailable when pool query succeeds', async () => {
            vi.useFakeTimers();
            setEnabledConfig();

            let errorHandler: ((err: Error) => void) | undefined;
            mockPoolOn.mockImplementation((event: string, handler: (err: Error) => void) => {
                if (event === 'error') {
                    errorHandler = handler;
                }
            });

            await DatabaseManager.init();
            expect(DatabaseManager.isAvailable()).toBe(true);

            // Simulate pool error to make it unavailable
            errorHandler!(new Error('connection lost'));
            expect(DatabaseManager.isAvailable()).toBe(false);

            // The health check should fire and recover
            mockPoolQuery.mockResolvedValueOnce({ rows: [] });
            await vi.advanceTimersByTimeAsync(30000);

            expect(DatabaseManager.isAvailable()).toBe(true);
            expect(mockLogInfo).toHaveBeenCalledWith(
                'DatabaseManager: Database connection recovered.'
            );
        });

        test('stays unavailable when health check query fails', async () => {
            vi.useFakeTimers();
            setEnabledConfig();

            let errorHandler: ((err: Error) => void) | undefined;
            mockPoolOn.mockImplementation((event: string, handler: (err: Error) => void) => {
                if (event === 'error') {
                    errorHandler = handler;
                }
            });

            await DatabaseManager.init();

            // Simulate pool error
            errorHandler!(new Error('connection lost'));
            expect(DatabaseManager.isAvailable()).toBe(false);

            // Health check query also fails
            mockPoolQuery.mockRejectedValueOnce(new Error('still down'));
            await vi.advanceTimersByTimeAsync(30000);

            expect(DatabaseManager.isAvailable()).toBe(false);
        });

        test('does not run recovery when already available', async () => {
            vi.useFakeTimers();
            setEnabledConfig();

            await DatabaseManager.init();
            expect(DatabaseManager.isAvailable()).toBe(true);

            mockPoolQuery.mockClear();

            // Advance timer - health check fires but _isAvailable is true so no query
            await vi.advanceTimersByTimeAsync(30000);

            // pool.query should not have been called by the health check
            expect(mockPoolQuery).not.toHaveBeenCalled();
        });
    });
});
