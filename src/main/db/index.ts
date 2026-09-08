import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import * as schema from './schema'

let db: ReturnType<typeof drizzle<typeof schema>> | null = null
let sqliteInstance: Database.Database | null = null

export function getDb() {
  if (db) return db

  const dataDir = join(app.getPath('userData'), 'data')
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  const dbPath = join(dataDir, 'nonla-desk.db')
  const sqlite = new Database(dbPath)
  sqliteInstance = sqlite

  // Enable WAL mode for better performance
  sqlite.pragma('journal_mode = WAL')

  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS configurations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS mini_apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'Box',
      category TEXT NOT NULL DEFAULT 'Custom',
      version TEXT NOT NULL DEFAULT '1.0.0',
      enabled INTEGER NOT NULL DEFAULT 1,
      shortcut TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS mini_app_storage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT NOT NULL REFERENCES mini_apps(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(app_id, key)
    );
  `)
  sqlite.exec('DROP TABLE IF EXISTS agents')
  sqlite.exec('DROP TABLE IF EXISTS llm_providers')

  db = drizzle(sqlite, { schema })
  return db
}

/**
 * Get the raw better-sqlite3 instance for direct SQL operations.
 * Must call getDb() first to ensure initialization.
 */
export function getSqlite(): Database.Database {
  if (!sqliteInstance) {
    getDb() // Initialize if needed
  }
  return sqliteInstance!
}
