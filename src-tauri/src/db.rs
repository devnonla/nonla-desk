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
    ensure_slugs(&conn)?;
    let _ = DB.set(Mutex::new(conn));
    Ok(())
}

/// `slug` is the app\'s unique, human id (like a plugin name). Added after the
/// first release, so older databases get the column and a slug per app.
fn ensure_slugs(conn: &Connection) -> rusqlite::Result<()> {
    let has: bool = conn
        .prepare("PRAGMA table_info(mini_apps)")?
        .query_map([], |r| r.get::<_, String>(1))?
        .any(|n| n.is_ok_and(|n| n == "slug"));
    if !has {
        conn.execute("ALTER TABLE mini_apps ADD COLUMN slug TEXT", [])?;
    }
    let todo: Vec<(String, String)> = conn
        .prepare("SELECT id, name FROM mini_apps WHERE slug IS NULL ORDER BY created_at")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    for (id, name) in todo {
        let base = crate::miniapp::slugify(&name);
        let mut slug = base.clone();
        let mut n = 2;
        while conn.query_row(
            "SELECT COUNT(*) FROM mini_apps WHERE slug = ?1",
            [&slug],
            |r| r.get::<_, i64>(0),
        )? > 0
        {
            slug = format!("{base}-{n}");
            n += 1;
        }
        conn.execute("UPDATE mini_apps SET slug = ?1 WHERE id = ?2", [&slug, &id])?;
    }
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_mini_apps_slug ON mini_apps(slug)",
        [],
    )?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_unique_slugs_to_an_old_database() {
        let c = Connection::open_in_memory().unwrap();
        // The first-release table, without `slug`.
        c.execute_batch(
            "CREATE TABLE mini_apps (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
             INSERT INTO mini_apps VALUES ('1', 'Color Picker', '1'), ('2', 'Color-Picker', '2'), ('3', '日本', '3');",
        )
        .unwrap();
        ensure_slugs(&c).unwrap();
        ensure_slugs(&c).unwrap(); // idempotent
        let slugs: Vec<String> = c
            .prepare("SELECT slug FROM mini_apps ORDER BY id")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(slugs, ["color-picker", "color-picker-2", "app"]);
    }
}
