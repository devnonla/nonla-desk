//! Filesystem layout. Everything lives under `~/.nonla-desk/`:
//!
//! ```text
//! ~/.nonla-desk/
//!   apps/<id>/{manifest.json, frontend/index.jsx, backend/index.js, panel/index.jsx}
//!   data/nonla-desk.db        (nonla-desk-dev.db for debug builds)
//!   nonladesk.sock                (nonladesk-dev.sock for debug builds) — CLI ↔ app
//! ```

use std::path::PathBuf;

pub const IS_DEV: bool = cfg!(debug_assertions);
pub const BUNDLE_ID: &str = "com.devnonla.nonla-desk";

pub fn root_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".nonla-desk")
}

pub fn apps_dir() -> PathBuf {
    root_dir().join("apps")
}

pub fn data_dir() -> PathBuf {
    root_dir().join("data")
}

pub fn db_path() -> PathBuf {
    data_dir().join(if IS_DEV {
        "nonla-desk-dev.db"
    } else {
        "nonla-desk.db"
    })
}

/// Database written by the Electron builds, migrated once on first launch.
pub fn legacy_db_path() -> Option<PathBuf> {
    let folder = if IS_DEV {
        "Nonla Desk Dev"
    } else {
        "Nonla Desk"
    };
    dirs::data_dir().map(|d| d.join(folder).join("data").join("nonla-desk.db"))
}

pub fn socket_path() -> PathBuf {
    if let Ok(p) = std::env::var("NONLADESK_SOCKET") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    root_dir().join(if IS_DEV {
        "nonladesk-dev.sock"
    } else {
        "nonladesk.sock"
    })
}

pub fn app_dir(id: &str) -> PathBuf {
    apps_dir().join(id)
}
