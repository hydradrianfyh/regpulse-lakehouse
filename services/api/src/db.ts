import pg from "pg";
import type { QueryResultRow } from "pg";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const { Pool } = pg;

export const pool = new Pool({ connectionString });

export async function initDb(): Promise<void> {
  await withMigrationLock(async () => {
    await ensureMigrationsTable();
    await runMigrations();
  });
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<{ rows: T[] }> {
  return pool.query<T>(text, params);
}

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id SERIAL PRIMARY KEY, name TEXT UNIQUE, run_at TIMESTAMPTZ DEFAULT NOW())"
  );
}

async function withMigrationLock<T>(fn: () => Promise<T>): Promise<T> {
  const lockId = 928473;
  await pool.query("SELECT pg_advisory_lock($1)", [lockId]);
  try {
    return await fn();
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [lockId]);
  }
}

async function runMigrations(): Promise<void> {
  const migrationsDir = path.resolve(process.cwd(), "db", "migrations");
  let files: string[] = [];

  try {
    files = await readdir(migrationsDir);
  } catch {
    const schemaPath = path.resolve(process.cwd(), "db", "schema.sql");
    const sql = await readFile(schemaPath, "utf-8");
    await pool.query(sql);
    return;
  }

  const migrations = files.filter(file => file.endsWith(".sql")).sort();
  const { rows } = await pool.query<{ name: string }>("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map(row => row.name));

  for (const file of migrations) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), "utf-8");
    try {
      await pool.query("BEGIN");
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
}
