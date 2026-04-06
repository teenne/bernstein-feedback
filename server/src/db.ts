import { Pool, QueryResult } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const MAX_RETRIES = 3; // Reduced for faster fallback
const RETRY_DELAY = 1000;

// State
let useInMemory = false;
const inMemoryStore: any[] = [];

// PG Pool Setup
// Auto-detect cloud DB (needs SSL) vs local (no SSL)
const host = process.env.DB_HOST || '127.0.0.1';
const isCloudDB = host !== '127.0.0.1' && host !== 'localhost';

const pool = new Pool({
    host,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'postgres',
    connectionTimeoutMillis: 5000,
    ssl: isCloudDB ? { rejectUnauthorized: false } : false,
});

// Robust Connection Logic with Fallback
export const connectWithRetry = async (): Promise<void> => {
    let retries = 0;
    while (retries < MAX_RETRIES) {
        try {
            console.log(`🔌 Attempting database connection (Attempt ${retries + 1}/${MAX_RETRIES})...`);
            const client = await pool.connect();
            client.release();
            console.log('✅ Successfully connected to PostgreSQL database.');
            return;
        } catch (err) {
            retries++;
            console.warn(`⚠️ Database connection attempt failed: ${(err as Error).message}`);
            if (retries < MAX_RETRIES) {
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
            }
        }
    }

    console.error('❌ Could not connect to PostgreSQL after max retries.');
    console.warn('⚠️ SWITCHING TO IN-MEMORY MODE. Data will be lost on server restart.');
    useInMemory = true;
};

// Mock Query Handler
const executeMockQuery = async (text: string, params: any[] = []): Promise<QueryResult> => {
    // Simulate network delay
    await new Promise(r => setTimeout(r, 10));

    const trimmedText = text.trim().toUpperCase();

    // Health Check
    if (trimmedText.includes('SELECT 1')) {
        return { rows: [{ '?column?': 1 }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
    }

    // Insert Feedback
    if (trimmedText.includes('INSERT INTO FEEDBACK')) {
        const id = crypto.randomUUID();
        // Rudimentary param mapping - assuming params match order of insertion roughly
        // This is strictly for demo purposes validation
        const record = { id, params };
        inMemoryStore.push(record);
        console.log(`💾 [Memory] Saved feedback event (Total: ${inMemoryStore.length})`);
        return { rows: [{ id }], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
    }

    // Default
    console.log('❓ [Memory] Unhandled query:', text);
    return { rows: [], rowCount: 0, command: 'UNKNOWN', oid: 0, fields: [] };
};

// Unified Query Interface
export const query = async (text: string, params?: any[]): Promise<QueryResult> => {
    if (useInMemory) {
        return executeMockQuery(text, params);
    }
    return pool.query(text, params);
};

export default pool;
