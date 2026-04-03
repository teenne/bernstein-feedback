import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
    const pool = process.env.DATABASE_URL
        ? new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
        })
        : new Pool({
            host: process.env.DB_HOST || '127.0.0.1',
            port: parseInt(process.env.DB_PORT || '5432'),
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres',
            database: process.env.DB_NAME || 'postgres',
        });

    try {
        const sqlPath = resolve(__dirname, '..', 'init.sql');
        const sql = readFileSync(sqlPath, 'utf-8');

        console.log('Running database migration...');
        await pool.query(sql);
        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

migrate();
