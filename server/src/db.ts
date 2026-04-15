import { Pool, QueryResult } from "pg";
import dotenv from "dotenv";

dotenv.config();

// Configuration
const MAX_RETRIES = 5;
const RETRY_DELAY = 2000;

// State
let useInMemory = false;
const inMemoryStore: any[] = [];

// Prefer DB_MODE if set, otherwise detect based on availability of connection strings.
const DB_MODE = process.env.DB_MODE?.toLowerCase() || 
  (process.env.DATABASE_URL || process.env.DATABASE_SUP_URL ? "cloud" : "local");

function isPlaceholderUrl(url: string): boolean {
  return /<[^>]*>/.test(url);
}

function getValidConnectionString(): string | null {
  const url = process.env.DATABASE_URL || process.env.DATABASE_SUP_URL;
  if (!url || url.trim() === "" || isPlaceholderUrl(url)) return null;
  return url;
}

const connectionString = getValidConnectionString();
const useConnectionString = DB_MODE === "cloud" && !!connectionString;

const pool = useConnectionString
  ? new Pool({
      connectionString: connectionString!,
      ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
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
    ? `📡 Database mode: CLOUD (via ${process.env.DATABASE_URL ? "DATABASE_URL" : "DATABASE_SUP_URL"})`
    : `📡 Database mode: LOCAL (${process.env.DB_HOST || "127.0.0.1"}:${process.env.DB_PORT || "5432"}/${process.env.DB_NAME || "postgres"})`,
);

if (!useConnectionString && (process.env.DATABASE_URL || process.env.DATABASE_SUP_URL)) {
  console.warn(
    "⚠️  NOTICE: You have a cloud database URL configured, but DB_MODE is set to 'local'. " +
    "The server is NOT connected to Supabase. Change DB_MODE=cloud in .env to switch."
  );
}

// Robust Connection Logic with Fallback
export const connectWithRetry = async (): Promise<void> => {
  if (DB_MODE === "memory") {
    console.info("🧠 Database mode: IN-MEMORY (Explicitly set via DB_MODE)");
    useInMemory = true;
    return;
  }

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
