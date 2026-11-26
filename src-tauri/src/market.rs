//! Marketplaces: a GitHub repo (or any git URL) holding many mini apps, like a
//! Claude Code plugin marketplace. Pure data layer: git and files, no events.
//!
//! ```text
//! marketplace.json    {name, owner, description, apps: [{name, source, version, ...}]}
//! apps/<id>/{manifest.json, frontend/index.jsx, backend/index.js, panel/index.jsx, icon.svg}
//! ```
//!
//! Clones live in `~/.nonla-desk/markets/<name>`. Installing reads the app's
//! directory with `miniapp::bundle_from_dir`, so it lands disabled like any import.

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

use serde_json::{json, Map, Value};

use crate::miniapp::{self, ImportResult};
use crate::paths;

const FILE: &str = "marketplace.json";

fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && !name.starts_with('.')
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

fn slug(name: &str) -> String {
    let s: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    s.split('-')
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn git(dir: Option<&Path>, args: &[&str]) -> Result<String, String> {
    let bin = if Path::new("/usr/bin/git").exists() {
        "/usr/bin/git"
    } else {
        "git"
    };
    let mut cmd = Command::new(bin);
    if let Some(d) = dir {
        cmd.current_dir(d);
    }
    // Never wait for a password prompt: the app has no terminal.
    let out = cmd
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes")
        .output()
        .map_err(|e| format!("cannot run git: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(format!(
            "git {} failed: {}",
            args.first().unwrap_or(&""),
            String::from_utf8_lossy(&out.stderr).trim()
        ))
    }
}

/// `user/repo` is GitHub; anything else (URL, ssh, local path) is used as is.
fn clone_url(source: &str) -> String {
    let looks_short = source.matches('/').count() == 1
        && !source.starts_with(['/', '.', '~'])
        && !source.contains(':');
    if looks_short {
        format!("https://github.com/{source}.git")
    } else {
        source.to_string()
    }
}

fn read_json(path: &Path) -> Result<Value, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))
}

fn market_dir(name: &str) -> Result<PathBuf, String> {
    if !valid_name(name) {
        return Err(format!("Invalid marketplace name \"{name}\""));
    }
    let dir = paths::markets_dir().join(name);
    if dir.join(FILE).is_file() {
        Ok(dir)
    } else {
        Err(format!(
            "No marketplace named \"{name}\". Add it with `nonladesk market add <user/repo>`."
        ))
    }
}

fn entries(dir: &Path) -> Result<Vec<Value>, String> {
    let file = read_json(&dir.join(FILE))?;
    Ok(file
        .get("apps")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default())
}

/// `source` must be a relative path that stays inside the repo.
fn source_dir(market: &Path, entry: &Value) -> Result<PathBuf, String> {
    let src = entry
        .get("source")
        .and_then(Value::as_str)
        .ok_or("marketplace entry has no \"source\"")?;
    let rel = Path::new(src);
    if rel.is_absolute()
        || rel
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::Prefix(_)))
    {
        return Err(format!(
            "Unsafe app source \"{src}\" (must stay inside the repo)"
        ));
    }
    let dir = market.join(rel);
    if !dir.join("manifest.json").is_file() {
        return Err(format!("{src}: missing manifest.json"));
    }
    // A symlink could still point outside the clone.
    let real = fs::canonicalize(&dir).map_err(|e| e.to_string())?;
    let root = fs::canonicalize(market).map_err(|e| e.to_string())?;
    if !real.starts_with(&root) {
        return Err(format!("Unsafe app source \"{src}\""));
    }
    let mut links = Vec::new();
    walk(&real, &real, &mut Vec::new(), &mut links);
    if !links.is_empty() {
        return Err(format!(
            "{src} contains symlinks ({}); a mini app holds plain files only",
            links.join(", ")
        ));
    }
    Ok(real)
}

/// Files under `dir` as (relative path, bytes), never following symlinks;
/// symlinks go to `links`.
fn walk(root: &Path, dir: &Path, files: &mut Vec<(String, u64)>, links: &mut Vec<String>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        let rel = p
            .strip_prefix(root)
            .unwrap_or(&p)
            .to_string_lossy()
            .to_string();
        let Ok(t) = e.file_type() else { continue };
        if t.is_symlink() {
            links.push(rel);
        } else if t.is_dir() {
            walk(root, &p, files, links);
        } else if let Ok(meta) = e.metadata() {
            files.push((rel, meta.len()));
        }
    }
}

fn entry_name(e: &Value) -> &str {
    e.get("name").and_then(Value::as_str).unwrap_or("")
}

fn find_entry(market: &Path, app: &str) -> Result<Value, String> {
    entries(market)?
        .into_iter()
        .find(|e| slug(entry_name(e)) == slug(app))
        .ok_or_else(|| format!("No app \"{app}\" in this marketplace"))
}

/// `name@market`, or just `name` when exactly one marketplace is added.
fn split_ref(reference: &str) -> Result<(String, String), String> {
    if let Some((app, market)) = reference.rsplit_once('@') {
        return Ok((app.to_string(), market.to_string()));
    }
    let all = list_markets()?;
    match all.as_slice() {
        [one] => Ok((
            reference.to_string(),
            one["name"].as_str().unwrap_or("").to_string(),
        )),
        [] => Err("No marketplace added. Run `nonladesk market add <user/repo>`.".into()),
        _ => Err(format!(
            "Several marketplaces added: use {reference}@<market>"
        )),
    }
}

// ─── market-installed.json ───────────────────────────────────────────────────

fn installed() -> Map<String, Value> {
    read_json(&paths::installed_file())
        .ok()
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

fn save_installed(map: &Map<String, Value>) -> Result<(), String> {
    let text = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    fs::write(paths::installed_file(), text).map_err(|e| e.to_string())
}

fn installed_from(market: &str, app: &str) -> Option<String> {
    installed()
        .into_iter()
        .find(|(_, v)| v["market"].as_str() == Some(market) && v["app"].as_str() == Some(app))
        .map(|(id, _)| id)
}

// ─── Marketplaces ────────────────────────────────────────────────────────────

pub fn add(source: &str, name: Option<&str>) -> Result<Value, String> {
    let url = clone_url(source.trim());
    let root = paths::markets_dir();
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let tmp = root.join(format!(".adding-{}-{nanos}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    git(
        None,
        &["clone", "--depth", "1", &url, &tmp.to_string_lossy()],
    )?;
    let result = (|| {
        let file =
            read_json(&tmp.join(FILE)).map_err(|_| format!("{url} has no {FILE} at its root"))?;
        let name = name
            .map(str::to_string)
            .or_else(|| file["name"].as_str().map(str::to_string))
            .ok_or("marketplace.json has no \"name\"")?;
        if !valid_name(&name) {
            return Err(format!("Invalid marketplace name \"{name}\""));
        }
        let dest = root.join(&name);
        if dest.exists() {
            return Err(format!(
                "Marketplace \"{name}\" is already added (`nonladesk market update {name}`)"
            ));
        }
        fs::rename(&tmp, &dest).map_err(|e| e.to_string())?;
        Ok(json!({ "name": name, "source": url, "apps": entries(&dest)?.len() }))
    })();
    let _ = fs::remove_dir_all(&tmp);
    result
}

pub fn list_markets() -> Result<Vec<Value>, String> {
    let mut out = Vec::new();
    let Ok(rd) = fs::read_dir(paths::markets_dir()) else {
        return Ok(out);
    };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        let dir = e.path();
        if name.starts_with('.') || !dir.join(FILE).is_file() {
            continue;
        }
        out.push(json!({
            "name": name,
            "source": git(Some(&dir), &["remote", "get-url", "origin"]).unwrap_or_default(),
            "apps": entries(&dir).map(|l| l.len()).unwrap_or(0),
            "description": read_json(&dir.join(FILE)).ok()
                .and_then(|f| f["description"].as_str().map(str::to_string)),
        }));
    }
    out.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
    Ok(out)
}

/// Refresh the app list of one marketplace, or of all of them (latest commit of
/// the repo). Installed apps do not change: each is updated on its own with `install`.
pub fn update(name: Option<&str>) -> Result<Value, String> {
    let names: Vec<String> = match name {
        Some(n) => vec![n.to_string()],
        None => list_markets()?
            .iter()
            .filter_map(|m| m["name"].as_str().map(str::to_string))
            .collect(),
    };
    let mut res = Vec::new();
    for n in names {
        let dir = market_dir(&n)?;
        // `market publish` writes into the clone: never wipe work that is not pushed yet.
        if git(Some(&dir), &["status", "--porcelain"]).is_ok_and(|s| !s.is_empty()) {
            res.push(json!({
                "name": n,
                "error": "has uncommitted changes (published apps?). Commit and push them from its folder first",
            }));
            continue;
        }
        let before = git(Some(&dir), &["rev-parse", "HEAD"]).unwrap_or_default();
        // The clone is ours: follow the remote even after a force-push.
        let pulled = git(Some(&dir), &["fetch", "--depth", "1", "origin"])
            .and_then(|_| git(Some(&dir), &["reset", "--hard", "FETCH_HEAD"]));
        let after = git(Some(&dir), &["rev-parse", "HEAD"]).unwrap_or_default();
        res.push(match pulled {
            Ok(_) => json!({ "name": n, "changed": before != after }),
            Err(e) => json!({ "name": n, "error": e }),
        });
    }
    Ok(Value::Array(res))
}

pub fn remove(name: &str) -> Result<Value, String> {
    let dir = market_dir(name)?;
    fs::remove_dir_all(dir).map_err(|e| e.to_string())?;
    Ok(json!({ "name": name }))
}

// ─── Apps ────────────────────────────────────────────────────────────────────

/// Apps of one marketplace (or all) with install state: `installed` is the
/// installed version, `update` is true when the marketplace has a different one.
pub fn apps(market: Option<&str>) -> Result<Value, String> {
    let names: Vec<String> = match market {
        Some(m) => vec![m.to_string()],
        None => list_markets()?
            .iter()
            .filter_map(|m| m["name"].as_str().map(str::to_string))
            .collect(),
    };
    let mut out = Vec::new();
    for m in names {
        let dir = market_dir(&m)?;
        for e in entries(&dir)? {
            let name = entry_name(&e).to_string();
            // The app's manifest is the source of truth; the entry may lag behind.
            let version = source_dir(&dir, &e)
                .ok()
                .and_then(|d| read_json(&d.join("manifest.json")).ok())
                .and_then(|m| m["version"].as_str().map(str::to_string))
                .or_else(|| e["version"].as_str().map(str::to_string))
                .unwrap_or_default();
            let inst = installed_from(&m, &name).and_then(|id| miniapp::get(&id).ok().flatten());
            out.push(json!({
                "name": name,
                "market": m,
                "version": version,
                "description": e["description"],
                "category": e["category"],
                "installed": inst.as_ref().map(|a| a.version.clone()),
                "appId": inst.as_ref().map(|a| a.id.clone()),
                "title": inst.as_ref().map(|a| a.name.clone()),
                "update": inst.as_ref().is_some_and(|a| newer(&version, &a.version)),
            }));
        }
    }
    Ok(Value::Array(out))
}

/// Refresh the marketplaces, then list only the installed apps that have a newer version.
pub fn outdated(market: Option<&str>) -> Result<Value, String> {
    let refreshed = update(market)?;
    let mut v = outdated_local(market)?;
    v["refreshed"] = refreshed;
    Ok(v)
}

/// Installed apps with a newer version in the marketplaces as last refreshed
/// (no network), and how many marketplaces there are.
pub fn outdated_local(market: Option<&str>) -> Result<Value, String> {
    let apps = apps(market)?
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter(|a| a["update"].as_bool() == Some(true))
        .collect::<Vec<_>>();
    Ok(json!({ "markets": list_markets()?.len(), "apps": apps }))
}

/// What changed between the installed copy of an app and the marketplace's
/// latest one, as a unified diff, to review before `install` updates it.
pub fn diff(reference: &str) -> Result<Value, String> {
    let (app, market) = split_ref(reference)?;
    let dir = market_dir(&market)?;
    let entry = find_entry(&dir, &app)?;
    let name = entry_name(&entry).to_string();
    let src = source_dir(&dir, &entry)?;
    let installed = installed_from(&market, &name)
        .and_then(|id| miniapp::get(&id).ok().flatten())
        .ok_or_else(|| {
            format!("{name} is not installed from {market}; review it with `nonladesk market show {name}@{market}`")
        })?;
    let new_version = read_json(&src.join("manifest.json"))
        .ok()
        .and_then(|m| m["version"].as_str().map(str::to_string))
        .unwrap_or_default();
    let out = Command::new("/usr/bin/diff")
        .args(["-ruN", "--exclude=.DS_Store"])
        .arg(paths::app_dir(&installed.id))
        .arg(&src)
        .output()
        .map_err(|e| format!("cannot run diff: {e}"))?;
    // diff exits 0 when equal, 1 when different, 2 on trouble.
    if out.status.code() == Some(2) {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(json!({
        "name": name,
        "market": market,
        "installed": installed.version,
        "latest": new_version,
        "dir": src,
        "diff": String::from_utf8_lossy(&out.stdout),
    }))
}

/// Is version `a` newer than `b`? Compares the numbers of `1.2.3`.
fn newer(a: &str, b: &str) -> bool {
    let nums = |v: &str| -> Vec<u64> {
        v.split(['-', '+'])
            .next()
            .unwrap_or("")
            .split('.')
            .map(|p| p.parse().unwrap_or(0))
            .collect()
    };
    !a.is_empty() && nums(a) > nums(b)
}

/// Everything an agent needs to review an app before installing it.
pub fn show(reference: &str) -> Result<Value, String> {
    let (app, market) = split_ref(reference)?;
    let dir = market_dir(&market)?;
    let entry = find_entry(&dir, &app)?;
    let src = source_dir(&dir, &entry)?;
    let (mut files, mut links) = (Vec::new(), Vec::new());
    walk(&src, &src, &mut files, &mut links);
    files.sort();
    Ok(json!({
        "name": entry_name(&entry),
        "market": market,
        "commit": git(Some(&dir), &["rev-parse", "--short", "HEAD"]).unwrap_or_default(),
        "source": git(Some(&dir), &["remote", "get-url", "origin"]).unwrap_or_default(),
        "entry": entry,
        "manifest": read_json(&src.join("manifest.json")).unwrap_or(Value::Null),
        "dir": src,
        "files": files.iter().map(|(p, n)| json!({ "path": p, "bytes": n })).collect::<Vec<_>>(),
    }))
}

/// Import an app from a marketplace. It lands disabled (updates keep their
/// state). An app of the same name that did not come from this marketplace
/// entry is never overwritten unless `force`.
pub fn install(reference: &str, force: bool) -> Result<ImportResult, String> {
    let (app, market) = split_ref(reference)?;
    let dir = market_dir(&market)?;
    let entry = find_entry(&dir, &app)?;
    let name = entry_name(&entry).to_string();
    let bundle = miniapp::bundle_from_dir(&source_dir(&dir, &entry)?)?;
    let id = bundle.slug()?;
    if id != name {
        return Err(format!(
            "marketplace.json lists \"{name}\" but its manifest.json has the id \"{id}\"; \
             the marketplace must fix one of them"
        ));
    }
    if let Some(existing) = miniapp::find_by_slug(&id)? {
        let ours = installed_from(&market, &name).is_some_and(|id| id == existing.id);
        if !ours && !force {
            return Err(format!(
                "A mini app with the id \"{id}\" (\"{}\") already exists and was not installed \
                 from {market}. Delete it, or pass --force to overwrite it.",
                existing.name
            ));
        }
    }
    let result = miniapp::import_bundle(bundle, true)?;
    let mut map = installed();
    map.insert(
        result.app.id.clone(),
        json!({
            "market": market,
            "app": name,
            "version": result.app.version,
            "commit": git(Some(&dir), &["rev-parse", "HEAD"]).unwrap_or_default(),
        }),
    );
    save_installed(&map)?;
    Ok(result)
}

/// Forget the marketplace link of a deleted app.
pub fn forget(app_id: &str) {
    let mut map = installed();
    if map.remove(app_id).is_some() {
        let _ = save_installed(&map);
    }
}

/// Copy an app into a marketplace checkout and list it in marketplace.json.
/// `to` is an added marketplace name, or a directory (created when new).
/// Nothing is committed or pushed: the author does that.
pub fn publish(app: &str, to: &str) -> Result<Value, String> {
    let rec = miniapp::resolve(app)?;
    let (dir, name) = if valid_name(to) && paths::markets_dir().join(to).join(FILE).is_file() {
        (paths::markets_dir().join(to), to.to_string())
    } else {
        let dir = PathBuf::from(to);
        if !dir.is_absolute() {
            return Err(format!(
                "No marketplace named \"{to}\" is added. Pass an added marketplace's name or a folder path (./{to})."
            ));
        }
        fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        let name = dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "marketplace".into());
        (dir, name)
    };
    let file_path = dir.join(FILE);
    let mut file = if file_path.is_file() {
        read_json(&file_path)?
    } else {
        json!({ "name": slug(&name), "owner": { "name": "" }, "description": "", "apps": [] })
    };

    let rel = format!("apps/{}", rec.slug);
    let dest = dir.join(&rel);
    let _ = fs::remove_dir_all(&dest);
    fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    for (path, content) in miniapp::bundle_files(&rec.id)? {
        let target = dest.join(path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(target, content).map_err(|e| e.to_string())?;
    }

    let entry = json!({
        "name": rec.slug,
        "source": format!("./{rel}"),
        "description": rec.description,
        "version": rec.version,
        "category": rec.category,
    });
    let list = file["apps"]
        .as_array_mut()
        .ok_or("marketplace.json: \"apps\" is not a list")?;
    match list.iter_mut().find(|e| entry_name(e) == rec.slug) {
        Some(slot) => *slot = entry,
        None => list.push(entry),
    }
    fs::write(
        &file_path,
        serde_json::to_string_pretty(&file).unwrap_or_default(),
    )
    .map_err(|e| e.to_string())?;
    Ok(json!({ "name": rec.slug, "version": rec.version, "dir": dir, "source": rel }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clone_urls() {
        assert_eq!(clone_url("me/market"), "https://github.com/me/market.git");
        assert_eq!(clone_url("https://x.y/z.git"), "https://x.y/z.git");
        assert_eq!(
            clone_url("git@github.com:me/m.git"),
            "git@github.com:me/m.git"
        );
        assert_eq!(clone_url("./local/repo"), "./local/repo");
    }

    #[test]
    fn versions() {
        assert!(newer("1.10.0", "1.9.0"));
        assert!(newer("2.0.0", "1.99.99"));
        assert!(!newer("1.0.0", "1.0.0"));
        assert!(!newer("1.0.0", "1.2.0"));
        assert!(!newer("", "1.0.0"));
    }

    #[test]
    fn slugs_and_names() {
        assert_eq!(slug("Color Picker!"), "color-picker");
        assert!(valid_name("my-market_1"));
        assert!(!valid_name("../x"));
        assert!(!valid_name(".hidden"));
    }

    #[test]
    fn rejects_escaping_sources() {
        let root = std::env::temp_dir();
        for bad in ["../x", "/etc", "a/../../b"] {
            assert!(
                source_dir(&root, &json!({ "source": bad })).is_err(),
                "{bad}"
            );
        }
    }
}
