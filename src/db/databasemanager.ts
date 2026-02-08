import pg from 'pg';
import fs from 'fs';
import path from 'path';
import config from 'config';
import { fileURLToPath } from 'url';
import { getCommonLogger } from '../logging/logmanager.js';

// Parse BIGINT (OID 20) as JavaScript number instead of string.
// Safe for Unix millisecond timestamps (Number.MAX_SAFE_INTEGER ≈ year 287,396).
pg.types.setTypeParser(20, (val: string) => parseInt(val, 10));

export class DatabaseManager {
    private static instance: DatabaseManager | null = null;
    private pool: pg.Pool;
    private _isAvailable: boolean = false;
    private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
    private static _initializing = false;

    private constructor(pool: pg.Pool) {
        this.pool = pool;
    }

    static async init(): Promise<void> {
        if (DatabaseManager.instance || DatabaseManager._initializing) return;

        const enabled = config.has('Database.enabled') ? config.get<string | boolean>('Database.enabled') : false;
        if (enabled !== true && String(enabled).toLowerCase() !== 'true') {
            getCommonLogger().logInfo('DatabaseManager: Database is disabled in config, skipping initialization.');
            return;
        }

        DatabaseManager._initializing = true;
        let pool: pg.Pool | undefined;
        try {
            const url = config.has('Database.url') ? config.get<string>('Database.url') : '';

            const getPoolNum = (key: string, fallback: number): number => {
                if (!config.has(key)) return fallback;
                const v = parseInt(String(config.get(key)), 10);
                return isNaN(v) ? fallback : v;
            };

            const poolConfig: pg.PoolConfig = {
                max: getPoolNum('Database.poolMax', 10),
                idleTimeoutMillis: getPoolNum('Database.poolIdleTimeoutMs', 10000),
                connectionTimeoutMillis: getPoolNum('Database.poolConnectionTimeoutMs', 5000),
                statement_timeout: getPoolNum('Database.poolStatementTimeoutMs', 10000),
            };

            if (url && url.length > 0) {
                poolConfig.connectionString = url;
                getCommonLogger().logInfo('DatabaseManager: Using DATABASE_URL connection string.');
            } else {
                poolConfig.host = config.get<string>('Database.host');
                const port = parseInt(String(config.get('Database.port')), 10);
                if (isNaN(port)) {
                    throw new Error(`DatabaseManager: Invalid port value "${config.get('Database.port')}". Must be a number.`);
                }
                poolConfig.port = port;
                poolConfig.database = config.get<string>('Database.database');
                poolConfig.user = config.get<string>('Database.user');
                poolConfig.password = config.get<string>('Database.password');
            }

            pool = new pg.Pool(poolConfig);

            const instance = new DatabaseManager(pool);

            pool.on('error', (err) => {
                getCommonLogger().logErrorAsync(`DatabaseManager: Unexpected pool error: ${err}`);
                instance._isAvailable = false;
            });

            // Test the connection
            const client = await pool.connect();
            client.release();
            getCommonLogger().logInfo('DatabaseManager: Database connection established.');

            // Run migrations
            await instance.runMigrations();

            instance._isAvailable = true;
            DatabaseManager.instance = instance;

            // Start periodic health check to recover from transient failures
            const healthCheckIntervalMs = getPoolNum('Database.healthCheckIntervalMs', 30000);
            instance.healthCheckInterval = setInterval(async () => {
                if (!instance._isAvailable) {
                    try {
                        await instance.pool.query('SELECT 1');
                        instance._isAvailable = true;
                        getCommonLogger().logInfo('DatabaseManager: Database connection recovered.');
                    } catch {
                        // Still unavailable, keep _isAvailable false
                    }
                }
            }, healthCheckIntervalMs);
            instance.healthCheckInterval.unref();
        } catch (e) {
            if (pool) {
                await pool.end();
            }
            getCommonLogger().logErrorAsync(`DatabaseManager: Failed to connect to database, got ${e}. Bot will continue without DB.`);
        } finally {
            DatabaseManager._initializing = false;
        }
    }

    static isAvailable(): boolean {
        return DatabaseManager.instance?._isAvailable === true;
    }

    static get(): DatabaseManager {
        if (!DatabaseManager.instance) {
            throw new Error('DatabaseManager not initialized. Call init() first or check isAvailable().');
        }
        return DatabaseManager.instance;
    }

    async query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]): Promise<pg.QueryResult<T>> {
        return this.pool.query<T>(text, params);
    }

    async connect(): Promise<pg.PoolClient> {
        return this.pool.connect();
    }

    async shutdown(): Promise<void> {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        if (this.pool) {
            await this.pool.end();
            this._isAvailable = false;
            getCommonLogger().logInfo('DatabaseManager: Database connection pool closed.');
        }
    }

    static async shutdownIfAvailable(): Promise<void> {
        if (DatabaseManager.instance) {
            await DatabaseManager.instance.shutdown();
        }
    }

    private async runMigrations(): Promise<void> {
        const defaultMigrationsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations');
        const migrationsPath = config.has('Database.migrationsPath')
            ? config.get<string>('Database.migrationsPath')
            : defaultMigrationsPath;

        // Create tracking table if it doesn't exist
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        // Get already-applied migrations
        const applied = await this.pool.query<{ filename: string }>('SELECT filename FROM schema_migrations ORDER BY filename');
        const appliedSet = new Set(applied.rows.map(r => r.filename));

        // Read migration files
        let files: string[];
        try {
            files = fs.readdirSync(migrationsPath)
                .filter(f => f.endsWith('.sql'))
                .sort();
        } catch (e) {
            getCommonLogger().logErrorAsync(`DatabaseManager: Failed to read migrations directory ${migrationsPath}, got ${e}`);
            throw e;
        }

        for (const file of files) {
            if (appliedSet.has(file)) continue;

            const filePath = path.join(migrationsPath, file);
            const sql = fs.readFileSync(filePath, 'utf8');

            getCommonLogger().logInfo(`DatabaseManager: Applying migration ${file}...`);

            const client = await this.pool.connect();
            try {
                await client.query('BEGIN');
                await client.query('SET LOCAL statement_timeout = 0');
                await client.query(sql);
                await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
                await client.query('COMMIT');
                getCommonLogger().logInfo(`DatabaseManager: Migration ${file} applied successfully.`);
            } catch (e) {
                await client.query('ROLLBACK');
                getCommonLogger().logErrorAsync(`DatabaseManager: Failed to apply migration ${file}, got ${e}`);
                throw e;
            } finally {
                client.release();
            }
        }
    }
}
