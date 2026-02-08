# Database Migrations

SQL migration files in this directory are applied automatically by `DatabaseManager` on startup.

## Conventions

- **Naming**: `NNN_description.sql` where `NNN` is a zero-padded sequence number (e.g., `001_initial.sql`, `002_schema_improvements.sql`).
- **Ordering**: Files are sorted lexicographically and applied in order.
- **Tracking**: Each applied migration is recorded in the `schema_migrations` table and will not be re-applied.
- **Transactions**: Each migration runs inside a `BEGIN`/`COMMIT` block. If a migration fails, it is rolled back and startup aborts.
- **Statement timeout**: `statement_timeout` is disabled (`SET LOCAL statement_timeout = 0`) during migration execution to allow long-running DDL.
- **Idempotency**: Prefer `IF NOT EXISTS` / `ADD ... IF NOT EXISTS` where possible so migrations are safe to re-run if the tracking table is reset.
