//! Mini app records, code files on disk, scoped storage, config, ZIP import/export.
//!
//! Pure data layer: no process management and no events. `ops.rs` wraps these
//! with backend restarts and `miniapp:changed` broadcasts.

use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use rand::RngCore;
use regex::Regex;
use rusqlite::{params, Row};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::{db, paths};

// ─── Records ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MiniApp {
    pub id: String,
    /// Unique, stable, human id: `color-picker`. Never changes after creation.
    pub slug: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub category: String,
    pub version: String,
    pub enabled: bool,
    pub shortcut: Option<String>,
    pub display_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

impl MiniApp {
    fn from_row(r: &Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: r.get("id")?,
            slug: r.get("slug")?,
            name: r.get("name")?,
            description: r.get("description")?,
            icon: r.get("icon")?,
            category: r.get("category")?,
            version: r.get("version")?,
            enabled: r.get::<_, i64>("enabled")? != 0,
            shortcut: r.get("shortcut")?,
            display_order: r.get("display_order")?,
            created_at: r.get("created_at")?,
            updated_at: r.get("updated_at")?,
        })
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodePaths {
    pub dir: String,
    pub frontend: String,
    pub backend: String,
    pub panel: String,
    pub icon: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Code {
    pub frontend_code: String,
    pub backend_code: String,
    pub panel_code: Option<String>,
}

/// Fields for create. Code fields are file contents.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInput {
    pub name: String,
    /// Unique id (slug). Derived from the name when absent.
    pub slug: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    /// Inline SVG icon (see `validate_svg_icon`). Stored as `icon.svg`.
    pub icon_svg: Option<String>,
    pub category: Option<String>,
    pub version: Option<String>,
    pub frontend_code: Option<String>,
    pub backend_code: Option<String>,
    pub panel_code: Option<String>,
    pub enabled: Option<bool>,
}

/// Partial update. `None` = leave unchanged. An empty string clears backend/panel.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInput {
    pub name: Option<String>,
    pub description: Option<String>,
    /// Named icon (lucide/emoji). Setting it removes `icon.svg`.
    pub icon: Option<String>,
    /// Inline SVG icon. `Some("")` removes it.
    pub icon_svg: Option<String>,
    pub category: Option<String>,
    pub version: Option<String>,
    pub frontend_code: Option<String>,
    pub backend_code: Option<String>,
    pub panel_code: Option<String>,
    pub enabled: Option<bool>,
    pub display_order: Option<i64>,
}

impl UpdateInput {
    pub fn metadata_changed(&self) -> bool {
        self.name.is_some()
            || self.description.is_some()
            || self.icon.is_some()
            || self.icon_svg.is_some()
            || self.category.is_some()
            || self.version.is_some()
    }
    pub fn code_changed(&self) -> bool {
        self.frontend_code.is_some() || self.backend_code.is_some() || self.panel_code.is_some()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    Frontend,
    Backend,
    Panel,
}

impl FileKind {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            "frontend" => Ok(Self::Frontend),
            "backend" => Ok(Self::Backend),
            "panel" => Ok(Self::Panel),
            other => Err(format!(
                "file must be frontend, backend or panel (got \"{other}\")"
            )),
        }
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Frontend => "frontend",
            Self::Backend => "backend",
            Self::Panel => "panel",
        }
    }
    fn rel_path(self) -> &'static str {
        match self {
            Self::Frontend => "frontend/index.jsx",
            Self::Backend => "backend/index.js",
            Self::Panel => "panel/index.jsx",
        }
    }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

pub fn list() -> Result<Vec<MiniApp>, String> {
    db::with(|c| {
        let mut stmt =
            c.prepare("SELECT * FROM mini_apps ORDER BY display_order ASC, created_at ASC")?;
        let rows = stmt.query_map([], MiniApp::from_row)?;
        rows.collect()
    })
}

pub fn get(id: &str) -> Result<Option<MiniApp>, String> {
    db::with(|c| {
        let mut stmt = c.prepare("SELECT * FROM mini_apps WHERE id = ?1")?;
        let mut rows = stmt.query([id])?;
        match rows.next()? {
            Some(r) => Ok(Some(MiniApp::from_row(r)?)),
            None => Ok(None),
        }
    })
}

/// `Color Picker!` → `color-picker`.
pub fn slugify(name: &str) -> String {
    let s: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let s = s
        .split('-')
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let s: String = s.chars().take(64).collect();
    let s = s.trim_end_matches('-').to_string();
    if s.is_empty() {
        "app".into()
    } else {
        s
    }
}

/// Lowercase letters, digits and single hyphens; 1-64 chars; like a git repo or plugin name.
pub fn valid_slug(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && !s.starts_with('-')
        && !s.ends_with('-')
        && !s.contains("--")
        && s.chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

pub fn find_by_slug(slug: &str) -> Result<Option<MiniApp>, String> {
    db::with(|c| {
        let mut stmt = c.prepare("SELECT * FROM mini_apps WHERE slug = ?1")?;
        let mut rows = stmt.query([slug])?;
        match rows.next()? {
            Some(r) => Ok(Some(MiniApp::from_row(r)?)),
            None => Ok(None),
        }
    })
}

/// App identity is the name (case-insensitive, trimmed). Used to prevent clones.
pub fn find_by_name(name: &str) -> Result<Option<MiniApp>, String> {
    let n = name.trim().to_lowercase();
    if n.is_empty() {
        return Ok(None);
    }
    db::with(|c| {
        let mut stmt = c.prepare("SELECT * FROM mini_apps WHERE LOWER(TRIM(name)) = ?1")?;
        let mut rows = stmt.query([n])?;
        match rows.next()? {
            Some(r) => Ok(Some(MiniApp::from_row(r)?)),
            None => Ok(None),
        }
    })
}

/// Look up by id, then slug, then name. Used by the CLI.
pub fn resolve(id_or_name: &str) -> Result<MiniApp, String> {
    if let Some(app) = get(id_or_name)? {
        return Ok(app);
    }
    if let Some(app) = find_by_slug(id_or_name)? {
        return Ok(app);
    }
    if let Some(app) = find_by_name(id_or_name)? {
        return Ok(app);
    }
    Err(format!(
        "No mini app with id, slug or name \"{id_or_name}\". Run `nonladesk list`."
    ))
}

pub fn require(id: &str) -> Result<MiniApp, String> {
    get(id)?.ok_or_else(|| format!("Mini app \"{id}\" not found"))
}

// ─── Code on disk ────────────────────────────────────────────────────────────

pub fn code_paths(id: &str) -> CodePaths {
    let dir = paths::app_dir(id);
    let s = |p: PathBuf| p.to_string_lossy().into_owned();
    CodePaths {
        frontend: s(dir.join(FileKind::Frontend.rel_path())),
        backend: s(dir.join(FileKind::Backend.rel_path())),
        panel: s(dir.join(FileKind::Panel.rel_path())),
        icon: s(dir.join("icon.svg")),
        dir: s(dir),
    }
}

pub fn file_path(id: &str, kind: FileKind) -> PathBuf {
    paths::app_dir(id).join(kind.rel_path())
}

pub fn read_file(id: &str, kind: FileKind) -> String {
    fs::read_to_string(file_path(id, kind)).unwrap_or_default()
}

pub fn read_code(id: &str) -> Code {
    let panel = read_file(id, FileKind::Panel);
    Code {
        frontend_code: read_file(id, FileKind::Frontend),
        backend_code: read_file(id, FileKind::Backend),
        panel_code: if panel.trim().is_empty() {
            None
        } else {
            Some(panel)
        },
    }
}

/// Non-empty file. Checks the size first; only small files are read, to rule out
/// whitespace-only ones, so listing apps does not read every source file.
pub fn has_file(id: &str, kind: FileKind) -> bool {
    match fs::metadata(file_path(id, kind)) {
        Ok(m) if m.len() == 0 => false,
        Ok(m) if m.len() > 256 => true,
        Ok(_) => !read_file(id, kind).trim().is_empty(),
        Err(_) => false,
    }
}

// ─── SVG icon (icon.svg) ──────────────────────────────────────────────────────

const MAX_ICON_LEN: usize = 8000;
const ICON_TAGS: &[&str] = &[
    "svg",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "g",
    "defs",
    "lineargradient",
    "radialgradient",
    "stop",
    "clippath",
    "mask",
    "title",
    "desc",
];

static TAG_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"<\s*([A-Za-z][\w:.-]*)").expect("valid regex"));
static HANDLER_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\son[a-z]+\s*=").expect("valid regex"));
static HREF_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)\s(?:xlink:)?href\s*=\s*["']([^"']*)["']"#).expect("valid regex")
});

/// Same rules as open-agent-hands tool icons. Errors say how to fix the SVG.
pub fn validate_svg_icon(svg: &str) -> Result<String, String> {
    let svg = svg.trim();
    if svg.len() > MAX_ICON_LEN {
        return Err(format!(
            "Icon is {} characters; keep it under {MAX_ICON_LEN}. Use fewer, simpler shapes.",
            svg.len()
        ));
    }
    let lower = svg.to_lowercase();
    if !lower.starts_with("<svg") || !lower.ends_with("</svg>") {
        return Err("Icon must be one inline SVG: start with <svg and end with </svg>.".into());
    }
    let open_tag = &svg[..svg.find('>').unwrap_or(svg.len())];
    if !open_tag.contains("viewBox") {
        return Err("Icon needs a square viewBox on <svg>, e.g. viewBox=\"0 0 24 24\".".into());
    }
    for cap in TAG_RE.captures_iter(svg) {
        let tag = cap[1].to_lowercase();
        if !ICON_TAGS.contains(&tag.as_str()) {
            return Err(format!(
                "<{tag}> is not allowed in an icon. Use path, rect, circle, ellipse, line, polyline, polygon, g, defs, linearGradient, radialGradient, stop, clipPath or mask (no <style>: use attributes)."
            ));
        }
    }
    if HANDLER_RE.is_match(svg) {
        return Err("Icon cannot have on…= event handlers.".into());
    }
    if lower.contains("javascript:") {
        return Err("Icon cannot contain javascript: URLs.".into());
    }
    for cap in HREF_RE.captures_iter(svg) {
        if !cap[1].starts_with('#') {
            return Err(format!(
                "href=\"{}\" is not allowed; an icon can only reference its own #ids.",
                &cap[1]
            ));
        }
    }
    Ok(svg.to_string())
}

pub fn icon_svg_path(id: &str) -> PathBuf {
    paths::app_dir(id).join("icon.svg")
}

pub fn read_icon_svg(id: &str) -> Option<String> {
    let svg = fs::read_to_string(icon_svg_path(id)).ok()?;
    let svg = svg.trim();
    (!svg.is_empty()).then(|| svg.to_string())
}

fn write_icon_svg(id: &str, svg: Option<&str>) -> Result<(), String> {
    let path = icon_svg_path(id);
    match svg {
        Some(svg) => {
            fs::create_dir_all(paths::app_dir(id)).map_err(|e| e.to_string())?;
            fs::write(&path, svg).map_err(|e| format!("write {}: {e}", path.display()))
        }
        None => match fs::remove_file(&path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        },
    }
}

pub fn write_file(id: &str, kind: FileKind, content: &str) -> Result<(), String> {
    let path = file_path(id, kind);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| format!("write {}: {e}", path.display()))
}

fn write_code(
    id: &str,
    frontend: Option<&str>,
    backend: Option<&str>,
    panel: Option<&str>,
) -> Result<(), String> {
    if let Some(c) = frontend {
        write_file(id, FileKind::Frontend, c)?;
    }
    if let Some(c) = backend {
        write_file(id, FileKind::Backend, c)?;
    }
    if let Some(c) = panel {
        write_file(id, FileKind::Panel, c)?;
    }
    Ok(())
}

pub fn manifest_value(app: &MiniApp) -> Value {
    let mut m = json!({
        "id": app.slug,
        "name": app.name,
        "version": app.version,
        "icon": app.icon,
        "category": app.category,
        "description": app.description,
    });
    if let Some(schema) = config_schema(&app.id) {
        m["config"] = schema;
    }
    m
}

fn write_manifest(app: &MiniApp) -> Result<(), String> {
    let dir = paths::app_dir(&app.id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(&manifest_value(app)).unwrap_or_default();
    fs::write(dir.join("manifest.json"), text).map_err(|e| e.to_string())
}

// ─── Mutations ───────────────────────────────────────────────────────────────

fn new_id() -> String {
    let mut bytes = [0u8; 8];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn create(input: &CreateInput) -> Result<MiniApp, String> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err("name is required".into());
    }
    if let Some(clash) = find_by_name(name)? {
        return Err(format!(
            "A mini app named \"{}\" already exists (id: {}). Edit it instead of creating a copy.",
            clash.name, clash.id
        ));
    }
    let icon_svg = match input.icon_svg.as_deref().map(str::trim) {
        Some(svg) if !svg.is_empty() => Some(validate_svg_icon(svg)?),
        _ => None,
    };
    let slug = match input
        .slug
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(s) => {
            if !valid_slug(s) {
                return Err(format!(
                    "Invalid id \"{s}\": use lowercase letters, digits and single hyphens (e.g. color-picker)"
                ));
            }
            if let Some(clash) = find_by_slug(s)? {
                return Err(format!(
                    "The id \"{s}\" is already used by \"{}\" ({})",
                    clash.name, clash.id
                ));
            }
            s.to_string()
        }
        None => {
            let base = slugify(name);
            let mut slug = base.clone();
            let mut n = 2;
            while find_by_slug(&slug)?.is_some() {
                slug = format!("{base}-{n}");
                n += 1;
            }
            slug
        }
    };
    let id = new_id();
    db::with(|c| {
        let order: i64 = c.query_row(
            "SELECT COALESCE(MAX(display_order), -1) + 1 FROM mini_apps",
            [],
            |r| r.get(0),
        )?;
        c.execute(
            "INSERT INTO mini_apps (id, slug, name, description, icon, category, version, enabled, display_order, created_at, updated_at)
             VALUES (?1, ?9, ?2, ?3, ?4, ?5, ?6, ?7, ?8, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
            params![
                id,
                name,
                input.description.clone().unwrap_or_default(),
                input.icon.clone().unwrap_or_else(|| "Box".into()),
                input.category.clone().unwrap_or_else(|| "Custom".into()),
                input.version.clone().unwrap_or_else(|| "1.0.0".into()),
                input.enabled.unwrap_or(false) as i64,
                order,
                slug,
            ],
        )
    })?;
    write_code(
        &id,
        input.frontend_code.as_deref(),
        input.backend_code.as_deref(),
        input.panel_code.as_deref(),
    )?;
    if let Some(svg) = icon_svg {
        write_icon_svg(&id, Some(&svg))?;
    }
    let app = require(&id)?;
    write_manifest(&app)?;
    Ok(app)
}

pub fn update(id: &str, input: &UpdateInput) -> Result<MiniApp, String> {
    let existing = require(id)?;

    if let Some(name) = &input.name {
        let name = name.trim();
        if name.is_empty() {
            return Err("name cannot be empty".into());
        }
        if let Some(clash) = find_by_name(name)? {
            if clash.id != id {
                return Err(format!(
                    "A mini app named \"{}\" already exists (id: {})",
                    clash.name, clash.id
                ));
            }
        }
    }

    let icon_svg = match input.icon_svg.as_deref().map(str::trim) {
        Some("") => Some(None),
        Some(svg) => Some(Some(validate_svg_icon(svg)?)),
        None if input.icon.is_some() => Some(None),
        None => None,
    };
    if let Some(svg) = &icon_svg {
        write_icon_svg(id, svg.as_deref())?;
    }

    if input.code_changed() {
        write_code(
            id,
            input.frontend_code.as_deref(),
            input.backend_code.as_deref(),
            input.panel_code.as_deref(),
        )?;
    }

    let mut sets: Vec<&str> = Vec::new();
    let mut vals: Vec<rusqlite::types::Value> = Vec::new();
    use rusqlite::types::Value as V;
    if let Some(v) = &input.name {
        sets.push("name = ?");
        vals.push(V::Text(v.trim().to_string()));
    }
    if let Some(v) = &input.description {
        sets.push("description = ?");
        vals.push(V::Text(v.clone()));
    }
    if let Some(v) = &input.icon {
        sets.push("icon = ?");
        vals.push(V::Text(v.clone()));
    }
    if let Some(v) = &input.category {
        sets.push("category = ?");
        vals.push(V::Text(v.clone()));
    }
    if let Some(v) = &input.version {
        sets.push("version = ?");
        vals.push(V::Text(v.clone()));
    }
    if let Some(v) = input.enabled {
        sets.push("enabled = ?");
        vals.push(V::Integer(v as i64));
    }
    if let Some(v) = input.display_order {
        sets.push("display_order = ?");
        vals.push(V::Integer(v));
    }
    if sets.is_empty() && !input.code_changed() && icon_svg.is_none() {
        return Ok(existing);
    }
    sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
    vals.push(V::Text(id.to_string()));
    let sql = format!("UPDATE mini_apps SET {} WHERE id = ?", sets.join(", "));
    db::with(|c| c.execute(&sql, rusqlite::params_from_iter(vals.iter())))?;

    let updated = require(id)?;
    if input.metadata_changed() || !paths::app_dir(id).join("manifest.json").exists() {
        write_manifest(&updated)?;
    }
    Ok(updated)
}

pub fn set_enabled_flag(id: &str, enabled: bool) -> Result<(), String> {
    db::with(|c| {
        c.execute(
            "UPDATE mini_apps SET enabled = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?2",
            params![enabled as i64, id],
        )
    })
    .map(|_| ())
}

/// Delete the record, its storage rows, its `ctx.db` tables, and its directory.
pub fn delete(id: &str) -> Result<bool, String> {
    let prefix = format!("miniapp_{}_", &id[..id.len().min(8)]);
    let removed = db::with(|c| {
        c.execute("DELETE FROM mini_app_storage WHERE app_id = ?1", [id])?;
        let tables: Vec<String> = {
            let mut stmt = c.prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE ?1 ESCAPE '\\'",
            )?;
            let pattern = format!("{}%", prefix.replace('_', "\\_"));
            let rows = stmt.query_map([pattern], |r| r.get(0))?;
            rows.collect::<rusqlite::Result<_>>()?
        };
        for t in tables {
            c.execute(&format!("DROP TABLE IF EXISTS \"{t}\""), [])?;
        }
        c.execute("DELETE FROM mini_apps WHERE id = ?1", [id])
    })?;
    let dir = paths::app_dir(id);
    if dir.exists() {
        if let Err(e) = fs::remove_dir_all(&dir) {
            eprintln!("[miniapp] failed to delete {}: {e}", dir.display());
        }
    }
    Ok(removed > 0)
}

// ─── Scoped key/value storage ────────────────────────────────────────────────

pub fn storage_get(app_id: &str, key: &str) -> Result<Option<String>, String> {
    db::with(|c| {
        let mut stmt =
            c.prepare("SELECT value FROM mini_app_storage WHERE app_id = ?1 AND key = ?2")?;
        let mut rows = stmt.query([app_id, key])?;
        Ok(match rows.next()? {
            Some(r) => Some(r.get(0)?),
            None => None,
        })
    })
}

pub fn storage_set(app_id: &str, key: &str, value: &str) -> Result<(), String> {
    db::with(|c| {
        c.execute(
            "INSERT INTO mini_app_storage (app_id, key, value, updated_at) VALUES (?1, ?2, ?3, datetime('now'))
             ON CONFLICT(app_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
            [app_id, key, value],
        )
    })
    .map(|_| ())
}

pub fn storage_delete(app_id: &str, key: &str) -> Result<(), String> {
    db::with(|c| {
        c.execute(
            "DELETE FROM mini_app_storage WHERE app_id = ?1 AND key = ?2",
            [app_id, key],
        )
    })
    .map(|_| ())
}

pub fn storage_get_all(app_id: &str) -> Result<BTreeMap<String, String>, String> {
    db::with(|c| {
        let mut stmt = c.prepare("SELECT key, value FROM mini_app_storage WHERE app_id = ?1")?;
        let rows = stmt.query_map([app_id], |r| Ok((r.get(0)?, r.get(1)?)))?;
        rows.collect()
    })
}

// ─── Config (schema in manifest, values in storage) ──────────────────────────

const SCHEMA_KEY: &str = "__config_schema__";
const CONFIG_PREFIX: &str = "config::";

pub fn config_schema(app_id: &str) -> Option<Value> {
    let raw = storage_get(app_id, SCHEMA_KEY).ok().flatten()?;
    serde_json::from_str(&raw).ok()
}

pub fn config_values(app_id: &str) -> Map<String, Value> {
    let mut out = Map::new();
    if let Ok(all) = storage_get_all(app_id) {
        for (k, v) in all {
            if let Some(key) = k.strip_prefix(CONFIG_PREFIX) {
                let parsed = serde_json::from_str(&v).unwrap_or(Value::String(v));
                out.insert(key.to_string(), parsed);
            }
        }
    }
    out
}

pub fn config_set(app_id: &str, key: &str, value: &Value) -> Result<(), String> {
    storage_set(app_id, &format!("{CONFIG_PREFIX}{key}"), &value.to_string())
}

/// Labels of required config fields that have no value.
pub fn missing_required_configs(app_id: &str) -> Vec<String> {
    let Some(Value::Object(schema)) = config_schema(app_id) else {
        return vec![];
    };
    let values = config_values(app_id);
    let mut missing = Vec::new();
    for (key, field) in schema {
        let required = field
            .get("required")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let empty = match values.get(&key) {
            None | Some(Value::Null) => true,
            Some(Value::String(s)) => s.is_empty(),
            _ => false,
        };
        if required && empty {
            let label = field.get("label").and_then(Value::as_str).unwrap_or(&key);
            missing.push(label.to_string());
        }
    }
    missing
}

fn save_config_schema(app_id: &str, schema: &Value) -> Result<(), String> {
    storage_set(app_id, SCHEMA_KEY, &schema.to_string())?;
    if let Value::Object(fields) = schema {
        for (key, field) in fields {
            if let Some(default) = field.get("default") {
                let k = format!("{CONFIG_PREFIX}{key}");
                if storage_get(app_id, &k)?.is_none() {
                    storage_set(app_id, &k, &default.to_string())?;
                }
            }
        }
    }
    Ok(())
}

// ─── Import / export ─────────────────────────────────────────────────────────

/// An app read from a ZIP or a directory (see `bundle_files` for the layout).
pub struct Bundle {
    manifest: Value,
    frontend: String,
    backend: String,
    panel: String,
    icon_svg: String,
}

impl Bundle {
    /// Format checks shared by zip and directory imports.
    pub fn validate(&self) -> Result<(), String> {
        let name = self.name()?;
        self.slug()?;
        if name.chars().count() > 80 {
            return Err("Invalid manifest: name is longer than 80 characters".into());
        }
        match self.manifest.get("version") {
            None => {
                return Err(
                    "Invalid manifest: version is required (e.g. \"1.0.0\"); it is how updates are detected"
                        .into(),
                )
            }
            Some(v) if !v.as_str().is_some_and(is_semver) => {
                return Err(format!(
                    "Invalid manifest: version must look like 1.2.3, got {v}"
                ))
            }
            Some(_) => {}
        }
        for key in ["description", "icon", "category"] {
            if self.manifest.get(key).is_some_and(|v| !v.is_string()) {
                return Err(format!("Invalid manifest: {key} must be a string"));
            }
        }
        if self.manifest.get("config").is_some_and(|v| !v.is_object()) {
            return Err("Invalid manifest: config must be an object".into());
        }
        if self.frontend.trim().is_empty() && self.backend.trim().is_empty() {
            return Err("Invalid mini app: must have a frontend or a backend".into());
        }
        for (label, text) in [
            ("frontend", &self.frontend),
            ("backend", &self.backend),
            ("panel", &self.panel),
        ] {
            if text.len() as u64 > MAX_FILE_BYTES {
                return Err(format!("{label} code is larger than 2 MB"));
            }
        }
        if !self.icon_svg.trim().is_empty() {
            validate_svg_icon(&self.icon_svg).map_err(|e| format!("icon.svg: {e}"))?;
        }
        Ok(())
    }

    /// The manifest `id`, or one derived from the name for zips made before ids existed.
    pub fn slug(&self) -> Result<String, String> {
        match self.manifest.get("id") {
            Some(Value::String(s)) if valid_slug(s) => Ok(s.clone()),
            Some(v) => Err(format!(
                "Invalid manifest: id must be lowercase letters, digits and single hyphens (e.g. color-picker), got {v}"
            )),
            None => Ok(slugify(&self.name()?)),
        }
    }

    /// What the bundle holds, for the review step: (file, bytes).
    pub fn files(&self) -> Vec<(&'static str, usize)> {
        [
            ("manifest.json", self.manifest.to_string().len()),
            ("frontend/index.jsx", self.frontend.len()),
            ("backend/index.js", self.backend.len()),
            ("panel/index.jsx", self.panel.len()),
            ("icon.svg", self.icon_svg.len()),
        ]
        .into_iter()
        .filter(|(_, n)| *n > 0)
        .collect()
    }

    pub fn name(&self) -> Result<String, String> {
        self.manifest
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string)
            .filter(|n| !n.is_empty())
            .ok_or_else(|| "Invalid manifest: missing name".into())
    }
}

pub struct ImportResult {
    pub app: MiniApp,
    pub files: Vec<(&'static str, usize)>,
    pub updated: bool,
}

pub const MAX_ZIP_BYTES: usize = 10 * 1024 * 1024;
pub const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;

/// Entries a mini app zip may hold: the shared layout, plus the pre-0.6 flat names.
const ZIP_FILES: [&str; 9] = [
    "manifest.json",
    "frontend/index.jsx",
    "backend/index.js",
    "panel/index.jsx",
    "icon.svg",
    "frontend.js",
    "backend.js",
    "panel.js",
    "README.md",
];

pub fn bundle_from_zip(bytes: &[u8]) -> Result<Bundle, String> {
    if bytes.len() > MAX_ZIP_BYTES {
        return Err(format!(
            "Zip is too large ({} MB, limit {} MB)",
            bytes.len() / 1024 / 1024,
            MAX_ZIP_BYTES / 1024 / 1024
        ));
    }
    let mut zip =
        zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| format!("bad zip: {e}"))?;

    // Exactly one app per zip, optionally inside one top folder.
    let mut files: Vec<(String, String)> = Vec::new(); // (entry name, path inside the app)
    let mut unexpected = Vec::new();
    for i in 0..zip.len() {
        let f = zip.by_index(i).map_err(|e| format!("bad zip: {e}"))?;
        let name = f.name().to_string();
        if f.is_dir()
            || name.starts_with("__MACOSX/")
            || name.rsplit('/').next() == Some(".DS_Store")
        {
            continue;
        }
        let rel = ZIP_FILES
            .iter()
            .find(|p| name == **p || name.ends_with(&format!("/{p}")));
        match rel {
            // Only a single top folder is allowed ("todo/manifest.json"), not deeper.
            Some(p) if name.matches('/').count() <= p.matches('/').count() + 1 => {
                files.push((name, (*p).to_string()))
            }
            _ => unexpected.push(name),
        }
    }
    let tops: std::collections::BTreeSet<&str> = files
        .iter()
        .map(|(name, rel)| &name[..name.len() - rel.len()])
        .collect();
    if tops.len() > 1 {
        return Err("The zip holds more than one app folder: put one app per zip".into());
    }
    if !unexpected.is_empty() {
        return Err(format!(
            "Unexpected file(s) in the zip: {}. A mini app zip holds only: manifest.json, \
             frontend/index.jsx, backend/index.js, panel/index.jsx, icon.svg",
            unexpected.join(", ")
        ));
    }
    let mut read = |paths: &[&str]| -> Result<String, String> {
        // The first path wins: the shared layout before the pre-0.6 flat names.
        let Some((name, _)) = paths
            .iter()
            .find_map(|want| files.iter().find(|(_, p)| p == want))
        else {
            return Ok(String::new());
        };
        let mut s = String::new();
        zip.by_name(name)
            .map_err(|e| e.to_string())?
            .take(MAX_FILE_BYTES + 1)
            .read_to_string(&mut s)
            .map_err(|e| format!("{name}: {e}"))?;
        Ok(s)
    };
    let manifest = read(&["manifest.json"])?;
    if manifest.is_empty() {
        return Err("Invalid mini app: missing manifest.json".into());
    }
    Ok(Bundle {
        manifest: serde_json::from_str(&manifest).map_err(|e| format!("manifest.json: {e}"))?,
        frontend: read(&["frontend/index.jsx", "frontend.js"])?,
        backend: read(&["backend/index.js", "backend.js"])?,
        panel: read(&["panel/index.jsx", "panel.js"])?,
        icon_svg: read(&["icon.svg"])?,
    })
}

/// One file of an app directory: "" when missing. Symlinks are refused (they
/// could pull in any file of this machine) and so are files over the size limit.
fn read_app_file(dir: &Path, rel: &str) -> Result<String, String> {
    let path = dir.join(rel);
    let Ok(meta) = fs::symlink_metadata(&path) else {
        return Ok(String::new());
    };
    if meta.file_type().is_symlink() {
        return Err(format!(
            "{rel} is a symlink; a mini app holds plain files only"
        ));
    }
    if !meta.is_file() {
        return Ok(String::new());
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err(format!("{rel} is larger than 2 MB"));
    }
    fs::read_to_string(&path).map_err(|e| format!("{rel}: {e}"))
}

pub fn bundle_from_dir(dir: &Path) -> Result<Bundle, String> {
    let manifest = read_app_file(dir, "manifest.json")?;
    if manifest.is_empty() {
        return Err(format!(
            "Invalid mini app directory: missing manifest.json in {}",
            dir.display()
        ));
    }
    // The shared layout wins over the pre-0.6 flat names.
    let read = |a: &str, b: &str| -> Result<String, String> {
        let s = read_app_file(dir, a)?;
        if s.is_empty() {
            read_app_file(dir, b)
        } else {
            Ok(s)
        }
    };
    Ok(Bundle {
        manifest: serde_json::from_str(&manifest).map_err(|e| format!("manifest.json: {e}"))?,
        frontend: read("frontend/index.jsx", "frontend.js")?,
        backend: read("backend/index.js", "backend.js")?,
        panel: read("panel/index.jsx", "panel.js")?,
        icon_svg: read_app_file(dir, "icon.svg")?,
    })
}

/// Create the app, or update the app with the same id (only with `force`).
pub fn import_bundle(b: Bundle, force: bool) -> Result<ImportResult, String> {
    b.validate()?;
    let m = &b.manifest;
    let s = |k: &str| {
        m.get(k)
            .and_then(Value::as_str)
            .map(str::to_string)
            .filter(|v| !v.is_empty())
    };
    let name = s("name").ok_or("Invalid manifest: missing name")?;
    let files = b.files();
    let schema = m.get("config").filter(|v| v.is_object()).cloned();

    let slug = b.slug()?;
    let result = if let Some(existing) = find_by_slug(&slug)? {
        if !force {
            return Err(format!(
                "A mini app with the id \"{}\" already exists (\"{}\"). Importing would overwrite its code; \
                 pass --force to do that.",
                existing.slug, existing.name
            ));
        }
        let app = update(
            &existing.id,
            &UpdateInput {
                name: Some(name),
                description: s("description"),
                icon: s("icon"),
                category: s("category"),
                version: s("version"),
                frontend_code: Some(b.frontend),
                backend_code: Some(b.backend),
                panel_code: Some(b.panel),
                icon_svg: Some(b.icon_svg),
                ..Default::default()
            },
        )?;
        ImportResult {
            app,
            updated: true,
            files,
        }
    } else {
        let app = create(&CreateInput {
            name,
            slug: Some(slug),
            description: s("description"),
            icon: s("icon"),
            category: s("category"),
            version: s("version"),
            frontend_code: Some(b.frontend),
            backend_code: Some(b.backend),
            panel_code: Some(b.panel),
            icon_svg: Some(b.icon_svg),
            enabled: Some(false),
        })?;
        ImportResult {
            app,
            updated: false,
            files,
        }
    };
    if let Some(schema) = schema {
        save_config_schema(&result.app.id, &schema)?;
        write_manifest(&result.app)?;
    }
    Ok(result)
}

/// The files of an app in the shared layout, used by the zip export and by
/// marketplaces: manifest.json, frontend/index.jsx, backend/index.js,
/// panel/index.jsx, icon.svg (empty ones left out).
pub fn bundle_files(id: &str) -> Result<Vec<(&'static str, String)>, String> {
    let app = require(id)?;
    let code = read_code(id);
    let files = [
        (
            "manifest.json",
            serde_json::to_string_pretty(&manifest_value(&app)).unwrap_or_default(),
        ),
        ("frontend/index.jsx", code.frontend_code),
        ("backend/index.js", code.backend_code),
        ("panel/index.jsx", code.panel_code.unwrap_or_default()),
        ("icon.svg", read_icon_svg(id).unwrap_or_default()),
    ];
    Ok(files
        .into_iter()
        .filter(|(_, c)| !c.trim().is_empty())
        .collect())
}

pub fn export_zip(id: &str) -> Result<Vec<u8>, String> {
    let mut buf = std::io::Cursor::new(Vec::new());
    {
        let mut zip = zip::ZipWriter::new(&mut buf);
        let opts = zip::write::SimpleFileOptions::default();
        for (name, content) in bundle_files(id)? {
            zip.start_file(name, opts).map_err(|e| e.to_string())?;
            zip.write_all(content.as_bytes())
                .map_err(|e| e.to_string())?;
        }
        zip.finish().map_err(|e| e.to_string())?;
    }
    Ok(buf.into_inner())
}

// ─── Views sent to the UI / CLI ──────────────────────────────────────────────

pub fn list_item(app: &MiniApp) -> Value {
    let mut v = serde_json::to_value(app).unwrap_or(Value::Null);
    v["hasFrontend"] = has_file(&app.id, FileKind::Frontend).into();
    v["hasBackend"] = has_file(&app.id, FileKind::Backend).into();
    v["hasPanel"] = has_file(&app.id, FileKind::Panel).into();
    v["iconSvg"] = read_icon_svg(&app.id)
        .map(Value::String)
        .unwrap_or(Value::Null);
    v
}

pub fn detail(app: &MiniApp) -> Value {
    let mut v = serde_json::to_value(app).unwrap_or(Value::Null);
    let code = read_code(&app.id);
    v["frontendCode"] = code.frontend_code.into();
    v["backendCode"] = code.backend_code.into();
    v["panelCode"] = code.panel_code.map(Value::String).unwrap_or(Value::Null);
    v["iconSvg"] = read_icon_svg(&app.id)
        .map(Value::String)
        .unwrap_or(Value::Null);
    v["paths"] = serde_json::to_value(code_paths(&app.id)).unwrap_or(Value::Null);
    v
}

#[cfg(test)]
mod tests {
    use super::validate_svg_icon;

    #[test]
    fn accepts_plain_icons() {
        let line = r#"<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>"#;
        assert!(validate_svg_icon(line).is_ok());
        let colored = r##"<svg viewBox="0 0 48 48"><defs><linearGradient id="bg"><stop offset="0" stop-color="#f00"/></linearGradient></defs><rect width="48" height="48" rx="10" fill="url(#bg)"/><use href="#bg"/></svg>"##;
        // <use> is not on the list
        assert!(validate_svg_icon(colored).is_err());
    }

    #[test]
    fn rejects_unsafe_icons() {
        for bad in [
            r#"<svg width="24"><path d="M0 0"/></svg>"#,
            r#"<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>"#,
            r#"<svg viewBox="0 0 24 24"><style>*{}</style></svg>"#,
            r#"<svg viewBox="0 0 24 24" onload="x()"></svg>"#,
            r#"<svg viewBox="0 0 24 24"><g href="https://x.y/a.svg"/></svg>"#,
            r#"<div>nope</div>"#,
        ] {
            assert!(validate_svg_icon(bad).is_err(), "{bad}");
        }
    }
}

fn is_semver(v: &str) -> bool {
    let core = v.split(['-', '+']).next().unwrap_or("");
    let parts: Vec<&str> = core.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()))
}

#[cfg(test)]
mod zip_tests {
    use super::*;

    fn zip_of(files: &[(&str, &str)]) -> Vec<u8> {
        let mut buf = std::io::Cursor::new(Vec::new());
        {
            let mut z = zip::ZipWriter::new(&mut buf);
            for (n, c) in files {
                z.start_file(*n, zip::write::SimpleFileOptions::default())
                    .unwrap();
                z.write_all(c.as_bytes()).unwrap();
            }
            z.finish().unwrap();
        }
        buf.into_inner()
    }

    const M: &str = r#"{"id":"a","name":"A","version":"1.0.0"}"#;

    #[test]
    fn reads_shared_layout_and_top_folder_and_legacy() {
        for files in [
            vec![("manifest.json", M), ("frontend/index.jsx", "x")],
            vec![("a/manifest.json", M), ("a/frontend/index.jsx", "x")],
            vec![("manifest.json", M), ("frontend.js", "x")],
        ] {
            let b = bundle_from_zip(&zip_of(&files)).unwrap();
            b.validate().unwrap();
        }
    }

    #[test]
    fn one_app_per_zip_and_new_layout_wins() {
        let two = zip_of(&[("a/manifest.json", M), ("b/frontend/index.jsx", "x")]);
        assert!(bundle_from_zip(&two).is_err());
        let both = bundle_from_zip(&zip_of(&[
            ("manifest.json", M),
            ("frontend.js", "old"),
            ("frontend/index.jsx", "new"),
        ]))
        .unwrap();
        assert_eq!(both.frontend, "new");
    }

    #[test]
    fn dir_refuses_symlinks() {
        let dir = std::env::temp_dir().join(format!("nd-symlink-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("frontend")).unwrap();
        fs::write(dir.join("manifest.json"), M).unwrap();
        std::os::unix::fs::symlink("/etc/hosts", dir.join("frontend/index.jsx")).unwrap();
        assert!(bundle_from_dir(&dir).is_err());
        fs::remove_file(dir.join("frontend/index.jsx")).unwrap();
        fs::write(dir.join("frontend/index.jsx"), "x").unwrap();
        assert!(bundle_from_dir(&dir).is_ok());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn slugs() {
        assert_eq!(slugify("Color Picker!"), "color-picker");
        assert_eq!(slugify("!!!"), "app");
        assert!(valid_slug("color-picker"));
        for bad in ["", "-a", "a-", "a--b", "A", "a_b", "a/b"] {
            assert!(!valid_slug(bad), "{bad}");
        }
        let b = bundle_from_zip(&zip_of(&[
            (
                "manifest.json",
                r#"{"id":"Bad_Id","name":"A","version":"1.0.0"}"#,
            ),
            ("frontend/index.jsx", "x"),
        ]))
        .unwrap();
        assert!(b.validate().is_err());
    }

    #[test]
    fn rejects_bad_zips() {
        let bad = [
            vec![("frontend/index.jsx", "x")],
            vec![
                ("manifest.json", M),
                ("frontend/index.jsx", "x"),
                ("evil.sh", "x"),
            ],
            vec![("manifest.json", M), ("a/b/frontend/index.jsx", "x")],
        ];
        for files in bad {
            assert!(bundle_from_zip(&zip_of(&files)).is_err());
        }
        let b = bundle_from_zip(&zip_of(&[
            ("manifest.json", r#"{"name":"A","version":"one"}"#),
            ("frontend/index.jsx", "x"),
        ]))
        .unwrap();
        assert!(b.validate().is_err());
        let no_version = bundle_from_zip(&zip_of(&[
            ("manifest.json", r#"{"name":"A"}"#),
            ("frontend/index.jsx", "x"),
        ]))
        .unwrap();
        assert!(no_version.validate().is_err());
        let empty = bundle_from_zip(&zip_of(&[("manifest.json", M)])).unwrap();
        assert!(empty.validate().is_err());
    }
}
