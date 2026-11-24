//! SQLite store. Holds mini app metadata, per-app key/value storage, global
//! configuration, and the tables mini app backends create via `ctx.db`
//! (prefixed `miniapp_<id8>_`). Mini app code lives on disk, not here.

use std::fs;
use std::sync::{Mutex, OnceLock};

use rusqlite::Connection;

use crate::paths;

static DB: OnceLock<Mutex<Connection>> = OnceLock::new();

const SCHEMA: &str = "
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
DROP TABLE IF EXISTS agents;
DROP TABLE IF EXISTS llm_providers;
";

pub fn init() -> anyhow::Result<()> {
    if DB.get().is_some() {
        return Ok(());
    }
    fs::create_dir_all(paths::data_dir())?;
    let path = paths::db_path();

    if !path.exists() {
        migrate_from_electron(&path);
    }

    let conn = Connection::open(&path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.execute_batch(SCHEMA)?;
    let _ = DB.set(Mutex::new(conn));
    Ok(())
}

/// Copy the Electron build's database into the new location (one time).
fn migrate_from_electron(target: &std::path::Path) {
    let Some(legacy) = paths::legacy_db_path() else {
        return;
    };
    if !legacy.exists() {
        return;
    }
    let result = Connection::open_with_flags(&legacy, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .and_then(|old| old.execute("VACUUM INTO ?1", [target.to_string_lossy()]));
    match result {
        Ok(_) => eprintln!("[db] migrated {} → {}", legacy.display(), target.display()),
        Err(e) => eprintln!("[db] migration from {} failed: {e}", legacy.display()),
    }
}

/// Run `f` with the shared connection. Errors become strings for IPC.
pub fn with<T>(f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Result<T, String> {
    let lock = DB
        .get()
        .ok_or_else(|| "database not initialised".to_string())?;
    let conn = lock
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    f(&conn).map_err(|e| e.to_string())
}
