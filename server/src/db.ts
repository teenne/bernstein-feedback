import { Pool, QueryResult } from "pg";
import dotenv from "dotenv";

dotenv.config();

// Configuration
const MAX_RETRIES = 5;
const RETRY_DELAY = 2000;

// State
let useInMemory = false;
const inMemoryStore: any[] = [];

// PG Pool Setup — prefer DATABASE_URL (Render / Supabase / any host that
// provides a connection string), fall back to individual vars for local dev.
//
// Placeholder URLs like `postgresql://user:<password>@host/db` (from a
// copy-pasted template) are IGNORED so you can keep both DATABASE_URL and
// DB_HOST set in your .env and toggle between "local dev" and "cloud"
// just by filling in or clearing the DATABASE_URL value.
function isPlaceholderUrl(url: string): boolean {
  return /<[^>]*>/.test(url);
}

function hasValidDatabaseUrl(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === "") return false;
  if (isPlaceholderUrl(url)) {
    console.warn(
      "⚠️  DATABASE_URL contains placeholder values (<...>) — ignoring it " +
        "and falling back to DB_HOST/DB_USER/DB_PASSWORD. Replace the " +
        "placeholders with real values to use the cloud database.",
    );
    return false;
  }
  return true;
}

const useConnectionString = hasValidDatabaseUrl();

const pool = useConnectionString
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    })
  : new Pool({
      host: process.env.DB_HOST || "127.0.0.1",
      port: parseInt(process.env.DB_PORT || "5432"),
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "postgres",
      database: process.env.DB_NAME || "postgres",
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000,
    });

console.info(
  useConnectionString
    ? "📡 Database mode: DATABASE_URL (cloud / Supabase / Render)"
    : `📡 Database mode: local (${process.env.DB_HOST || "127.0.0.1"}:${process.env.DB_PORT || "5432"}/${process.env.DB_NAME || "postgres"})`,
);

// Robust Connection Logic with Fallback
export const connectWithRetry = async (): Promise<void> => {
  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      console.log(
        `🔌 Attempting database connection (Attempt ${retries + 1}/${MAX_RETRIES})...`,
      );
      const client = await pool.connect();
      client.release();
      console.log("✅ Successfully connected to PostgreSQL database.");
      return;
    } catch (err) {
      retries++;
      console.warn(
        `⚠️ Database connection attempt failed: ${(err as Error).message}`,
      );
      if (retries < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }

  console.error("❌ Could not connect to PostgreSQL after max retries.");
  console.warn(
    "⚠️ SWITCHING TO IN-MEMORY MODE. Data will be lost on server restart.",
  );
  useInMemory = true;
};

// Mock Query Handler
const executeMockQuery = async (
  text: string,
  params: any[] = [],
): Promise<QueryResult> => {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 10));

  const trimmedText = text.trim().toUpperCase();

  // Health Check
  if (trimmedText.includes("SELECT 1")) {
    return {
      rows: [{ "?column?": 1 }],
      rowCount: 1,
      command: "SELECT",
      oid: 0,
      fields: [],
    };
  }

  // Insert Feedback
  if (trimmedText.includes("INSERT INTO FEEDBACK")) {
    const id = crypto.randomUUID();
    // Rudimentary param mapping - assuming params match order of insertion roughly
    // This is strictly for demo purposes validation
    const record = { id, params };
    inMemoryStore.push(record);
    console.log(
      `💾 [Memory] Saved feedback event (Total: ${inMemoryStore.length})`,
    );
    return {
      rows: [{ id }],
      rowCount: 1,
      command: "INSERT",
      oid: 0,
      fields: [],
    };
  }

  // Default
  console.log("❓ [Memory] Unhandled query:", text);
  return { rows: [], rowCount: 0, command: "UNKNOWN", oid: 0, fields: [] };
};

// Unified Query Interface (generic T gives typed rows)
export const query = async <T extends Record<string, any> = any>(
  text: string,
  params?: any[],
): Promise<QueryResult<T>> => {
  if (useInMemory) {
    return executeMockQuery(text, params) as Promise<QueryResult<T>>;
  }
  return pool.query<T>(text, params);
};

export default pool;
