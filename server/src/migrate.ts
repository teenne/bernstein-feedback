import { Pool } from 'pg';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Database migration runner.
 *
 * Runs `init.sql` (the fresh-install schema) followed by every file in
 * `migrations/NNN_*.sql` in numeric order. All migration files are
 * expected to be idempotent (`CREATE ... IF NOT EXISTS`, `ALTER TABLE
 * ... ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, etc.),
 * so re-running this is safe.
 *
 * Usage:  npm run migrate
 *         npm run migrate -- --skip-init         # just run migrations/
 *         npm run migrate -- --only=005          # run a single migration
 */
async function migrate() {
    const DB_MODE = process.env.DB_MODE?.toLowerCase() ||
        (process.env.DATABASE_URL || process.env.DATABASE_SUP_URL ? "cloud" : "local");
    const url = process.env.DATABASE_SUP_URL || process.env.DATABASE_URL;
    const useConnectionString = DB_MODE === "cloud" && url && !/<[^>]*>/.test(url);

    const pool = useConnectionString
        ? new Pool({
            connectionString: url,
            ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
        })
        : new Pool({
            host: process.env.DB_HOST || '127.0.0.1',
            port: parseInt(process.env.DB_PORT || '5432'),
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres',
            database: process.env.DB_NAME || 'postgres',
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        });

    const args = process.argv.slice(2);
    const skipInit = args.includes('--skip-init');
    const forceInit = args.includes('--force-init');
    const onlyArg = args.find((a) => a.startsWith('--only='));
    const onlyFilter = onlyArg ? onlyArg.slice('--only='.length) : null;

    const serverRoot = resolve(__dirname, '..');
    const migrationsDir = join(serverRoot, 'migrations');

    const runSql = async (label: string, sql: string) => {
        console.log(`→ ${label}`);
        await pool.query(sql);
        console.log(`  ✓ ${label}`);
    };

    /**
     * Detect whether the database already has the core schema.
     * `init.sql` isn't fully idempotent (uses bare `CREATE TABLE clusters`,
     * etc.) so we only run it on a truly fresh DB. The numbered migrations
     * in `migrations/` ARE idempotent and always safe to re-apply.
     */
    const isFreshDatabase = async (): Promise<boolean> => {
        const r = await pool.query<{ exists: boolean }>(
            `SELECT EXISTS (
               SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'projects'
             ) AS exists`,
        );
        return !r.rows[0].exists;
    };

    try {
        // 1) init.sql — only on a truly fresh database. Existing DBs
        //    skip this because init.sql is not idempotent. Force with
        //    --force-init if you really know what you're doing.
        if (!skipInit && !onlyFilter) {
            const initPath = join(serverRoot, 'init.sql');
            if (existsSync(initPath)) {
                const fresh = await isFreshDatabase();
                if (fresh || forceInit) {
                    await runSql('init.sql', readFileSync(initPath, 'utf-8'));
                } else {
                    console.log('→ init.sql (skipped — existing database)');
                }
            }
        }

        // 2) migrations/NNN_*.sql — additive, in numeric order
        if (existsSync(migrationsDir)) {
            const files = readdirSync(migrationsDir)
                .filter((f) => f.endsWith('.sql'))
                .sort(); // lexicographic == numeric for NNN_ prefix

            const toRun = onlyFilter
                ? files.filter((f) => f.includes(onlyFilter))
                : files;

            if (toRun.length === 0 && onlyFilter) {
                console.warn(`No migration matched --only=${onlyFilter}`);
            }

            for (const f of toRun) {
                const sql = readFileSync(join(migrationsDir, f), 'utf-8');
                await runSql(`migrations/${f}`, sql);
            }
        }

        console.log('\n✅ All migrations completed successfully.');
    } catch (err) {
        console.error('\n❌ Migration failed:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

migrate();
