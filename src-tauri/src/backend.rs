//! Mini app backends: one child process per enabled app, running
//! `resources/sandbox-runner.cjs` under Bun (or Node).
//!
//! Protocol over stdio, one JSON object per line:
//! - child → app: stdout lines prefixed with `\x1e` (record separator). Other
//!   stdout/stderr lines are plain logs.
//! - app → child: stdin lines (`response`, `ipc:message`, `shutdown`).
//!
//! The child has no direct DB or OS-UI access. It sends `storage:*`, `db:*`,
//! `host:*` requests that are answered here with `{type:'response', requestId}`.

use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use regex::Regex;
use rusqlite::types::{Value as SqlValue, ValueRef};
use serde::Serialize;
use serde_json::{json, Map, Value};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{mpsc, oneshot, watch};

use crate::miniapp::{self, FileKind, MiniApp};
use crate::{db, ops, paths, runtime};

struct Instance {
    gen: u64,
    tx: mpsc::UnboundedSender<String>,
    kill: Option<oneshot::Sender<()>>,
    exited: watch::Receiver<bool>,
    stopping: Arc<AtomicBool>,
    /// Held while the backend runs: one process at a time (the desktop or the
    /// app's standalone bundle) owns an app's backend.
    _lock: Option<std::fs::File>,
}

static INSTANCES: LazyLock<Mutex<HashMap<String, Instance>>> = LazyLock::new(Default::default);
static GEN: AtomicU64 = AtomicU64::new(0);

// ─── Logs ────────────────────────────────────────────────────────────────────

const LOG_CAP: usize = 300;

#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    pub timestamp: u64,
    pub stream: &'static str,
    pub text: String,
}

static LOGS: LazyLock<Mutex<HashMap<String, VecDeque<LogEntry>>>> = LazyLock::new(Default::default);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn push_log(app: &AppHandle, app_id: &str, app_name: &str, stream: &'static str, text: &str) {
    let entry = LogEntry {
        timestamp: now_ms(),
        stream,
        text: text.to_string(),
    };
    if stream == "stderr" || stream == "error" {
        eprintln!("[miniapp:{app_name}:{stream}] {text}");
    } else {
        println!("[miniapp:{app_name}:{stream}] {text}");
    }
    if let Ok(mut logs) = LOGS.lock() {
        let q = logs.entry(app_id.to_string()).or_default();
        if q.len() >= LOG_CAP {
            q.pop_front();
        }
        q.push_back(entry.clone());
    }
    let _ = app.emit(
        "miniapp:log",
        json!({
            "appId": app_id,
            "appName": app_name,
            "timestamp": entry.timestamp,
            "stream": stream,
            "args": [text],
        }),
    );
}

pub fn logs(app_id: &str) -> Vec<LogEntry> {
    LOGS.lock()
        .ok()
        .and_then(|l| l.get(app_id).map(|q| q.iter().cloned().collect()))
        .unwrap_or_default()
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

pub fn is_running(app_id: &str) -> bool {
    INSTANCES
        .lock()
        .map(|m| m.contains_key(app_id))
        .unwrap_or(false)
}

pub fn runner_path(app: &AppHandle) -> PathBuf {
    let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/sandbox-runner.cjs");
    if paths::IS_DEV && source.exists() {
        return source;
    }
    app.path()
        .resolve("sandbox-runner.cjs", BaseDirectory::Resource)
        .ok()
        .filter(|p| p.exists())
        .unwrap_or(source)
}

// ─── Ownership lock ──────────────────────────────────────────────────────────

/// Set in a standalone app: wait for the desktop to hand the backend over.
static WAIT_FOR_LOCK: AtomicBool = AtomicBool::new(false);

pub fn wait_for_lock() {
    WAIT_FOR_LOCK.store(true, Ordering::SeqCst);
}

/// None when another process owns this app's backend.
async fn acquire_lock(app_id: &str) -> Option<std::fs::File> {
    let dir = paths::root_dir().join("run");
    let _ = std::fs::create_dir_all(&dir);
    let file = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(dir.join(format!("{app_id}.lock")))
        .ok()?;
    let tries = if WAIT_FOR_LOCK.load(Ordering::SeqCst) {
        40
    } else {
        1
    };
    for i in 0..tries {
        match file.try_lock() {
            Ok(()) => return Some(file),
            Err(std::fs::TryLockError::WouldBlock) => {
                if i + 1 < tries {
                    tokio::time::sleep(Duration::from_millis(200)).await;
                }
            }
            // The filesystem has no locks: run without one.
            Err(std::fs::TryLockError::Error(_)) => return Some(file),
        }
    }
    None
}

/// Start the backend for `rec` if it has one. Stops a running instance first.
pub async fn start(app: &AppHandle, rec: &MiniApp) -> Result<(), String> {
    let id = rec.id.clone();
    stop(&id).await;
    if !miniapp::has_file(&id, FileKind::Backend) {
        return Ok(());
    }
    let Some(rt) = runtime::find() else {
        let msg = format!(
            "Cannot start backend: neither Bun nor Node.js was found. Install Bun: {}",
            runtime::BUN_INSTALL_COMMAND
        );
        push_log(app, &id, &rec.name, "error", &msg);
        let _ = app.emit("runtime:missing", json!({ "appId": id }));
        return Err(msg);
    };

    let Some(lock) = acquire_lock(&id).await else {
        push_log(
            app,
            &id,
            &rec.name,
            "system",
            "Backend is owned by another Nonla process (the standalone app); not starting it here",
        );
        return Ok(());
    };

    let dir = paths::app_dir(&id);
    install_deps(app, rec, &rt, &dir).await;

    let mut child = Command::new(&rt.path)
        .arg(runner_path(app))
        .current_dir(&dir)
        .env("APP_DIR", &dir)
        .env("APP_ID", &id)
        .env(
            "APP_CONFIG",
            Value::Object(miniapp::config_values(&id)).to_string(),
        )
        .env("APP_PATH", paths::root_dir())
        .env("PATH", runtime::child_path(&rt))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to start {}: {e}", rt.path.display()))?;

    let pid = child.id().unwrap_or(0);
    push_log(
        app,
        &id,
        &rec.name,
        "system",
        &format!("Backend starting with {} (pid {pid})", rt.kind),
    );

    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let mut stdin = child.stdin.take().expect("piped stdin");
    tauri::async_runtime::spawn(async move {
        while let Some(line) = rx.recv().await {
            if stdin.write_all(line.as_bytes()).await.is_err()
                || stdin.write_all(b"\n").await.is_err()
                || stdin.flush().await.is_err()
            {
                break;
            }
        }
    });

    let ctx = Arc::new(Ctx {
        app: app.clone(),
        id: id.clone(),
        name: rec.name.clone(),
        tx: tx.clone(),
    });

    let stdout = child.stdout.take().expect("piped stdout");
    let c = ctx.clone();
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            match line
                .strip_prefix('\u{1e}')
                .map(serde_json::from_str::<Value>)
            {
                Some(Ok(msg)) => handle_message(&c, msg).await,
                _ if !line.trim().is_empty() => push_log(&c.app, &c.id, &c.name, "stdout", &line),
                _ => {}
            }
        }
    });

    let stderr = child.stderr.take().expect("piped stderr");
    let c = ctx.clone();
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if !line.trim().is_empty() {
                push_log(&c.app, &c.id, &c.name, "stderr", &line);
            }
        }
    });

    let (kill_tx, kill_rx) = oneshot::channel::<()>();
    let (exit_tx, exit_rx) = watch::channel(false);
    let stopping = Arc::new(AtomicBool::new(false));
    let gen = GEN.fetch_add(1, Ordering::SeqCst) + 1;

    let c = ctx.clone();
    let stop_flag = stopping.clone();
    tauri::async_runtime::spawn(async move {
        let status = tokio::select! {
            s = child.wait() => s.ok(),
            _ = kill_rx => {
                let _ = child.kill().await;
                child.wait().await.ok()
            }
        };
        let _ = exit_tx.send(true);
        if let Ok(mut m) = INSTANCES.lock() {
            if m.get(&c.id).map(|i| i.gen) == Some(gen) {
                m.remove(&c.id);
            }
        }
        let code = status.and_then(|s| s.code());
        let stopping = stop_flag.load(Ordering::SeqCst);
        push_log(
            &c.app,
            &c.id,
            &c.name,
            "system",
            &match code {
                Some(c) => format!("Backend exited (code {c})"),
                None => "Backend stopped by a signal".to_string(),
            },
        );
        if !stopping
            && code.is_some_and(|c| c != 0)
            && miniapp::set_enabled_flag(&c.id, false).is_ok()
        {
            push_log(
                &c.app,
                &c.id,
                &c.name,
                "error",
                "Backend crashed, so the app was disabled. Fix it, then run `nonla enable`.",
            );
            ops::broadcast(&c.app, ops::ChangeEvent::enabled(&c.id, false));
        }
    });

    if let Ok(mut m) = INSTANCES.lock() {
        m.insert(
            id,
            Instance {
                gen,
                tx,
                kill: Some(kill_tx),
                exited: exit_rx,
                stopping,
                _lock: Some(lock),
            },
        );
    }
    Ok(())
}

/// Ask the backend to shut down; kill it after 5s.
pub async fn stop(app_id: &str) {
    let inst = INSTANCES.lock().ok().and_then(|mut m| m.remove(app_id));
    let Some(mut inst) = inst else { return };
    inst.stopping.store(true, Ordering::SeqCst);
    let _ = inst.tx.send(json!({ "type": "shutdown" }).to_string());
    if !wait_exit(inst.exited.clone(), Duration::from_secs(5)).await {
        if let Some(k) = inst.kill.take() {
            let _ = k.send(());
        }
        wait_exit(inst.exited.clone(), Duration::from_secs(2)).await;
    }
}

/// True if the process exited within `limit`.
async fn wait_exit(mut exited: watch::Receiver<bool>, limit: Duration) -> bool {
    tokio::time::timeout(limit, async move { exited.wait_for(|v| *v).await.is_ok() })
        .await
        .unwrap_or(false)
}

pub async fn stop_all() {
    let ids: Vec<String> = INSTANCES
        .lock()
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default();
    let tasks: Vec<_> = ids
        .into_iter()
        .map(|id| tauri::async_runtime::spawn(async move { stop(&id).await }))
        .collect();
    for t in tasks {
        let _ = t.await;
    }
}

/// Frontend → backend message. Returns false when no backend is running.
pub fn send_ipc(app_id: &str, channel: &str, data: Value) -> bool {
    let tx = INSTANCES
        .lock()
        .ok()
        .and_then(|m| m.get(app_id).map(|i| i.tx.clone()));
    match tx {
        Some(tx) => tx
            .send(json!({ "type": "ipc:message", "channel": channel, "data": data }).to_string())
            .is_ok(),
        None => false,
    }
}

async fn install_deps(app: &AppHandle, rec: &MiniApp, rt: &runtime::JsRuntime, dir: &PathBuf) {
    if !dir.join("package.json").exists() || dir.join("node_modules").exists() {
        return;
    }
    let (program, args): (PathBuf, Vec<&str>) = if rt.kind == "bun" {
        (rt.path.clone(), vec!["install", "--production"])
    } else {
        let npm = rt.path.with_file_name("npm");
        (
            npm,
            vec!["install", "--production", "--no-audit", "--no-fund"],
        )
    };
    push_log(
        app,
        &rec.id,
        &rec.name,
        "system",
        "Installing dependencies…",
    );
    let run = Command::new(&program)
        .args(&args)
        .current_dir(dir)
        .env("PATH", runtime::child_path(rt))
        .output();
    match tokio::time::timeout(Duration::from_secs(180), run).await {
        Ok(Ok(out)) if out.status.success() => {
            push_log(app, &rec.id, &rec.name, "system", "Dependencies installed")
        }
        Ok(Ok(out)) => push_log(
            app,
            &rec.id,
            &rec.name,
            "error",
            &format!(
                "Dependency install failed: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ),
        ),
        Ok(Err(e)) => push_log(
            app,
            &rec.id,
            &rec.name,
            "error",
            &format!("Dependency install failed: {e}"),
        ),
        Err(_) => push_log(
            app,
            &rec.id,
            &rec.name,
            "error",
            "Dependency install timed out",
        ),
    }
}

// ─── Child → app messages ────────────────────────────────────────────────────

struct Ctx {
    app: AppHandle,
    id: String,
    name: String,
    tx: mpsc::UnboundedSender<String>,
}

impl Ctx {
    fn reply(&self, request_id: &Value, result: Result<Value, String>) {
        if request_id.is_null() {
            return;
        }
        let msg = match result {
            Ok(v) => json!({ "type": "response", "requestId": request_id, "result": v }),
            Err(e) => json!({ "type": "response", "requestId": request_id, "error": e }),
        };
        let _ = self.tx.send(msg.to_string());
    }
}

fn str_arg(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

async fn handle_message(ctx: &Arc<Ctx>, msg: Value) {
    let ty = msg["type"].as_str().unwrap_or_default();
    let rid = msg.get("requestId").cloned().unwrap_or(Value::Null);
    let id = ctx.id.as_str();
    match ty {
        "log" => {
            let text = msg["args"]
                .as_array()
                .map(|a| a.iter().map(str_arg).collect::<Vec<_>>().join(" "))
                .unwrap_or_default();
            push_log(&ctx.app, id, &ctx.name, "log", &text);
        }
        "ready" => push_log(&ctx.app, id, &ctx.name, "system", "Backend ready"),
        "error" => {
            let mut text = str_arg(&msg["message"]);
            if let Some(stack) = msg["stack"].as_str() {
                text = format!("{text}\n{stack}");
            }
            push_log(&ctx.app, id, &ctx.name, "error", &text);
        }
        "ipc:send" => {
            let _ = ctx.app.emit(
                "miniapp:ipc-message",
                json!({ "appId": id, "channel": msg["channel"], "data": msg["data"] }),
            );
        }
        "storage:get" => ctx.reply(
            &rid,
            miniapp::storage_get(id, &str_arg(&msg["key"]))
                .map(|v| v.map(Value::String).unwrap_or(Value::Null)),
        ),
        "storage:set" => ctx.reply(
            &rid,
            miniapp::storage_set(id, &str_arg(&msg["key"]), &str_arg(&msg["value"]))
                .map(|_| Value::Bool(true)),
        ),
        "storage:delete" => ctx.reply(
            &rid,
            miniapp::storage_delete(id, &str_arg(&msg["key"])).map(|_| Value::Bool(true)),
        ),
        "storage:getAll" => ctx.reply(
            &rid,
            miniapp::storage_get_all(id).map(|m| serde_json::to_value(m).unwrap_or(Value::Null)),
        ),
        "db:run" | "db:get" | "db:all" => {
            let sql = str_arg(&msg["sql"]);
            let params = msg["params"].as_array().cloned().unwrap_or_default();
            ctx.reply(&rid, run_sql(id, &ty[3..], &sql, &params));
        }
        "host:shell" => ctx.reply(&rid, host_shell(&ctx.app, &msg)),
        "host:clipboard" => ctx.reply(&rid, host_clipboard(&ctx.app, &msg)),
        "host:notification" => {
            use tauri_plugin_notification::NotificationExt;
            let opts = &msg["opts"];
            let r = ctx
                .app
                .notification()
                .builder()
                .title(str_arg(&opts["title"]))
                .body(str_arg(&opts["body"]))
                .show()
                .map(|_| Value::Bool(true))
                .map_err(|e| e.to_string());
            ctx.reply(&rid, r);
        }
        "host:dialog" => {
            // Dialogs wait for the user; don't block this app's message loop.
            let c = ctx.clone();
            tauri::async_runtime::spawn(async move {
                let r = host_dialog(&c.app, &msg).await;
                c.reply(&rid, r);
            });
        }
        other => ctx.reply(&rid, Err(format!("Unknown request type: {other}"))),
    }
}

fn host_shell(app: &AppHandle, msg: &Value) -> Result<Value, String> {
    use tauri_plugin_opener::OpenerExt;
    let arg = str_arg(&msg["args"][0]);
    match msg["method"].as_str() {
        Some("openExternal") => app
            .opener()
            .open_url(arg, None::<&str>)
            .map(|_| Value::Null)
            .map_err(|e| e.to_string()),
        // Electron's openPath resolved to "" on success or an error string.
        Some("openPath") => Ok(Value::String(
            app.opener()
                .open_path(arg, None::<&str>)
                .err()
                .map(|e| e.to_string())
                .unwrap_or_default(),
        )),
        Some("showItemInFolder") => app
            .opener()
            .reveal_item_in_dir(arg)
            .map(|_| Value::Null)
            .map_err(|e| e.to_string()),
        m => Err(format!("Unsupported shell method: {m:?}")),
    }
}

fn host_clipboard(app: &AppHandle, msg: &Value) -> Result<Value, String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    match msg["method"].as_str() {
        Some("readText") => app
            .clipboard()
            .read_text()
            .map(Value::String)
            .map_err(|e| e.to_string()),
        Some("writeText") => app
            .clipboard()
            .write_text(str_arg(&msg["args"][0]))
            .map(|_| Value::Null)
            .map_err(|e| e.to_string()),
        m => Err(format!("Unsupported clipboard method: {m:?}")),
    }
}

/// Electron-shaped dialogs: showOpenDialog → {canceled, filePaths},
/// showSaveDialog → {canceled, filePath}, showMessageBox → {response}.
async fn host_dialog(app: &AppHandle, msg: &Value) -> Result<Value, String> {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    let opts = &msg["args"][0];
    let method = msg["method"].as_str().unwrap_or_default();

    if method == "showMessageBox" {
        let text = match opts["detail"].as_str() {
            Some(d) => format!("{}\n\n{d}", str_arg(&opts["message"])),
            None => str_arg(&opts["message"]),
        };
        let buttons: Vec<String> = opts["buttons"]
            .as_array()
            .map(|a| a.iter().map(str_arg).collect())
            .unwrap_or_default();
        let mut b = app.dialog().message(text);
        if let Some(t) = opts["title"].as_str() {
            b = b.title(t);
        }
        b = match buttons.as_slice() {
            [] => b,
            [ok] => b.buttons(MessageDialogButtons::OkCustom(ok.clone())),
            [ok, cancel, ..] => b.buttons(MessageDialogButtons::OkCancelCustom(
                ok.clone(),
                cancel.clone(),
            )),
        };
        let (tx, rx) = oneshot::channel();
        b.show(move |ok| {
            let _ = tx.send(ok);
        });
        let ok = rx.await.unwrap_or(false);
        return Ok(json!({ "response": if ok { 0 } else { 1 } }));
    }

    let mut b = app.dialog().file();
    if let Some(t) = opts["title"].as_str() {
        b = b.set_title(t);
    }
    if let Some(p) = opts["defaultPath"].as_str() {
        let p = PathBuf::from(p);
        if p.is_dir() {
            b = b.set_directory(p);
        } else {
            if let Some(parent) = p.parent().filter(|d| d.is_dir()) {
                b = b.set_directory(parent);
            }
            if let Some(f) = p.file_name() {
                b = b.set_file_name(f.to_string_lossy());
            }
        }
    }
    for f in opts["filters"].as_array().into_iter().flatten() {
        let exts: Vec<String> = f["extensions"]
            .as_array()
            .map(|a| a.iter().map(str_arg).filter(|e| e != "*").collect())
            .unwrap_or_default();
        if !exts.is_empty() {
            let refs: Vec<&str> = exts.iter().map(String::as_str).collect();
            b = b.add_filter(str_arg(&f["name"]), &refs);
        }
    }
    let props: Vec<String> = opts["properties"]
        .as_array()
        .map(|a| a.iter().map(str_arg).collect())
        .unwrap_or_default();
    let has = |p: &str| props.iter().any(|x| x == p);

    let (tx, rx) = oneshot::channel::<Vec<String>>();
    if method == "showSaveDialog" {
        b.save_file(move |p| {
            let _ = tx.send(p.map(|p| vec![p.to_string()]).unwrap_or_default());
        });
        let picked = rx.await.unwrap_or_default();
        return Ok(json!({
            "canceled": picked.is_empty(),
            "filePath": picked.first().cloned().unwrap_or_default(),
        }));
    }
    let multi = has("multiSelections");
    let to_vec = |v: Option<Vec<tauri_plugin_dialog::FilePath>>| {
        v.unwrap_or_default()
            .into_iter()
            .map(|p| p.to_string())
            .collect::<Vec<_>>()
    };
    match (has("openDirectory"), multi) {
        (true, true) => b.pick_folders(move |p| {
            let _ = tx.send(to_vec(p));
        }),
        (true, false) => b.pick_folder(move |p| {
            let _ = tx.send(p.map(|p| vec![p.to_string()]).unwrap_or_default());
        }),
        (false, true) => b.pick_files(move |p| {
            let _ = tx.send(to_vec(p));
        }),
        (false, false) => b.pick_file(move |p| {
            let _ = tx.send(p.map(|p| vec![p.to_string()]).unwrap_or_default());
        }),
    }
    let picked = rx.await.unwrap_or_default();
    Ok(json!({ "canceled": picked.is_empty(), "filePaths": picked }))
}

// ─── Scoped SQL for ctx.db ───────────────────────────────────────────────────

static TABLE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(?i)\b(FROM|INTO|TABLE|UPDATE|JOIN)\s+(IF\s+(?:NOT\s+)?EXISTS\s+)?([`"]?)(\w+)([`"]?)"#,
    )
    .expect("valid regex")
});

/// `CREATE TABLE notes` → `CREATE TABLE miniapp_<id8>_notes`, so an app only
/// touches its own tables.
pub fn prefix_tables(sql: &str, prefix: &str) -> String {
    TABLE_RE
        .replace_all(sql, |c: &regex::Captures| {
            let kw = &c[1];
            let ifc = c.get(2).map_or("", |m| m.as_str());
            let (q1, name, q2) = (&c[3], &c[4], &c[5]);
            if name.starts_with(prefix) {
                format!("{kw} {ifc}{q1}{name}{q2}")
            } else {
                format!("{kw} {ifc}{q1}{prefix}{name}{q2}")
            }
        })
        .into_owned()
}

fn json_to_sql(v: &Value) -> SqlValue {
    match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(*b as i64),
        Value::Number(n) => n
            .as_i64()
            .map(SqlValue::Integer)
            .unwrap_or_else(|| SqlValue::Real(n.as_f64().unwrap_or(0.0))),
        Value::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}

fn sql_to_json(v: ValueRef) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => i.into(),
        ValueRef::Real(f) => f.into(),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Value::Array(b.iter().map(|x| Value::from(*x)).collect()),
    }
}

fn run_sql(app_id: &str, kind: &str, sql: &str, params: &[Value]) -> Result<Value, String> {
    let prefix = format!("miniapp_{}_", &app_id[..app_id.len().min(8)]);
    let sql = prefix_tables(sql, &prefix);
    let params: Vec<SqlValue> = params.iter().map(json_to_sql).collect();
    db::with(|c| {
        let mut stmt = c.prepare(&sql)?;
        if kind == "run" {
            let changes = stmt.execute(rusqlite::params_from_iter(params.iter()))?;
            return Ok(json!({ "changes": changes, "lastInsertRowid": c.last_insert_rowid() }));
        }
        let names: Vec<String> = stmt.column_names().into_iter().map(String::from).collect();
        let mut rows = stmt.query(rusqlite::params_from_iter(params.iter()))?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            let mut obj = Map::new();
            for (i, name) in names.iter().enumerate() {
                obj.insert(name.clone(), sql_to_json(row.get_ref(i)?));
            }
            out.push(Value::Object(obj));
            if kind == "get" {
                break;
            }
        }
        Ok(if kind == "get" {
            out.pop().unwrap_or(Value::Null)
        } else {
            Value::Array(out)
        })
    })
}

#[cfg(test)]
mod tests {
    use super::prefix_tables;

    #[test]
    fn prefixes_table_names() {
        let p = "miniapp_abcd1234_";
        assert_eq!(
            prefix_tables("CREATE TABLE IF NOT EXISTS notes (id INTEGER)", p),
            "CREATE TABLE IF NOT EXISTS miniapp_abcd1234_notes (id INTEGER)"
        );
        assert_eq!(
            prefix_tables("SELECT * FROM notes JOIN tags ON 1", p),
            "SELECT * FROM miniapp_abcd1234_notes JOIN miniapp_abcd1234_tags ON 1"
        );
        assert_eq!(
            prefix_tables("INSERT INTO \"notes\" VALUES (1)", p),
            "INSERT INTO \"miniapp_abcd1234_notes\" VALUES (1)"
        );
        assert_eq!(
            prefix_tables("UPDATE miniapp_abcd1234_notes SET a = 1", p),
            "UPDATE miniapp_abcd1234_notes SET a = 1"
        );
    }
}
