//! Finds the JavaScript runtime that runs mini app backends: Bun first, then Node.
//!
//! Apps launched from Finder get a minimal PATH (/usr/bin:/bin:...), so the
//! usual install locations are probed directly before falling back to the
//! user's login shell.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsRuntime {
    /// "bun" or "node"
    pub kind: &'static str,
    pub path: PathBuf,
    pub version: Option<String>,
}

pub const BUN_INSTALL_COMMAND: &str = "curl -fsSL https://bun.sh/install | bash";

static CACHE: Mutex<Option<JsRuntime>> = Mutex::new(None);

/// Cached lookup. A miss is not cached, so installing Bun while the app runs works.
pub fn find() -> Option<JsRuntime> {
    if let Some(rt) = CACHE.lock().ok().and_then(|c| c.clone()) {
        if rt.path.exists() {
            return Some(rt);
        }
    }
    let rt = detect();
    if let Ok(mut c) = CACHE.lock() {
        *c = rt.clone();
    }
    rt
}

fn detect() -> Option<JsRuntime> {
    if let Ok(p) = std::env::var("NONLA_JS_RUNTIME") {
        let path = PathBuf::from(p);
        if is_executable(&path) {
            let kind = if path
                .file_name()
                .is_some_and(|n| n.to_string_lossy().contains("bun"))
            {
                "bun"
            } else {
                "node"
            };
            return Some(make(kind, path));
        }
    }
    let home = dirs::home_dir().unwrap_or_default();
    let bun = [
        home.join(".bun/bin/bun"),
        PathBuf::from("/opt/homebrew/bin/bun"),
        PathBuf::from("/usr/local/bin/bun"),
    ];
    if let Some(p) = bun
        .into_iter()
        .find(|p| is_executable(p))
        .or_else(|| which("bun"))
    {
        return Some(make("bun", p));
    }
    let mut node = vec![
        PathBuf::from("/opt/homebrew/bin/node"),
        PathBuf::from("/usr/local/bin/node"),
        home.join(".volta/bin/node"),
    ];
    node.extend(latest_nvm_node(&home));
    if let Some(p) = node
        .into_iter()
        .find(|p| is_executable(p))
        .or_else(|| which("node"))
    {
        return Some(make("node", p));
    }
    login_shell_lookup("bun")
        .map(|p| make("bun", p))
        .or_else(|| login_shell_lookup("node").map(|p| make("node", p)))
}

fn make(kind: &'static str, path: PathBuf) -> JsRuntime {
    let version = Command::new(&path)
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());
    JsRuntime {
        kind,
        path,
        version,
    }
}

fn is_executable(p: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    p.metadata()
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

fn which(bin: &str) -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|d| d.join(bin))
            .find(|p| is_executable(p))
    })
}

fn latest_nvm_node(home: &Path) -> Option<PathBuf> {
    let dir = home.join(".nvm/versions/node");
    let mut versions: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .collect();
    versions.sort();
    versions.pop().map(|v| v.join("bin/node"))
}

fn login_shell_lookup(bin: &str) -> Option<PathBuf> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let out = Command::new(shell)
        .args(["-ilc", &format!("command -v {bin}")])
        .output()
        .ok()?;
    let line = String::from_utf8_lossy(&out.stdout)
        .lines()
        .last()?
        .trim()
        .to_string();
    let p = PathBuf::from(line);
    is_executable(&p).then_some(p)
}

/// PATH for backend child processes: the runtime's own dir plus common bins.
pub fn child_path(rt: &JsRuntime) -> String {
    let mut dirs: Vec<String> = Vec::new();
    if let Some(d) = rt.path.parent() {
        dirs.push(d.to_string_lossy().into_owned());
    }
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".bun/bin").to_string_lossy().into_owned());
    }
    dirs.extend(["/opt/homebrew/bin", "/usr/local/bin"].map(String::from));
    if let Ok(p) = std::env::var("PATH") {
        dirs.push(p);
    }
    dirs.push("/usr/bin:/bin:/usr/sbin:/sbin".into());
    dirs.join(":")
}
