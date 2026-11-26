//! Unix socket the `nonladesk` CLI talks to. One JSON request per line:
//! `{"cmd": "list", "args": {...}}` → `{"ok": true, "data": ...}` or
//! `{"ok": false, "error": "..."}`. The socket is created with mode 0600.

use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};

use crate::miniapp::{self, CreateInput, FileKind, UpdateInput};
use crate::{backend, bundle, check, market, ops, paths, runtime, shell};

#[derive(Deserialize)]
struct Request {
    cmd: String,
    #[serde(default)]
    args: Value,
}

pub fn start(app: AppHandle) {
    let path = paths::socket_path();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::remove_file(&path);
    tauri::async_runtime::spawn(async move {
        let listener = match UnixListener::bind(&path) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[cli] cannot listen on {}: {e}", path.display());
                return;
            }
        };
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        println!("[cli] listening on {}", path.display());
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(handle_conn(app, stream));
                }
                Err(e) => eprintln!("[cli] accept failed: {e}"),
            }
        }
    });
}

pub fn cleanup() {
    let _ = std::fs::remove_file(paths::socket_path());
}

async fn handle_conn(app: AppHandle, stream: UnixStream) {
    let (r, mut w) = stream.into_split();
    let mut lines = BufReader::new(r).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let resp = match serde_json::from_str::<Request>(&line) {
            Ok(req) => match dispatch(&app, &req.cmd, &req.args).await {
                Ok(data) => json!({ "ok": true, "data": data }),
                Err(error) => json!({ "ok": false, "error": error }),
            },
            Err(e) => json!({ "ok": false, "error": format!("Bad request: {e}") }),
        };
        if w.write_all(format!("{resp}\n").as_bytes()).await.is_err() {
            break;
        }
    }
}

fn opt(args: &Value, key: &str) -> Option<String> {
    args.get(key).and_then(Value::as_str).map(str::to_string)
}

fn req(args: &Value, key: &str) -> Result<String, String> {
    opt(args, key)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("missing \"{key}\""))
}

fn summary(rec: &miniapp::MiniApp) -> Value {
    let mut v = miniapp::list_item(rec);
    v["running"] = backend::is_running(&rec.id).into();
    v["paths"] = serde_json::to_value(miniapp::code_paths(&rec.id)).unwrap_or(Value::Null);
    v["standalone"] = bundle::find_installed(&rec.id)
        .map(|p| Value::from(p.display().to_string()))
        .unwrap_or(Value::Null);
    v
}

const STARTER_FRONTEND: &str = r#"// Use any library: import { Button } from 'antd' (see `nonladesk guide`, "Libraries").
module.exports = function App({ ctx }) {
  const [count, setCount] = ctx.useState(0)

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ margin: '0 0 8px' }}>Hello from a new mini app</h2>
      <p style={{ margin: '0 0 16px' }}>Edit frontend/index.jsx, then run `nonladesk reload`.</p>
      <button type="button" onClick={() => setCount(count + 1)}>
        Clicked {count} times
      </button>
    </div>
  )
}
"#;

/// Run blocking work (git, disk) off the async runtime.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

async fn dispatch(app: &AppHandle, cmd: &str, args: &Value) -> Result<Value, String> {
    match cmd {
        "ping" => Ok(json!({
            "version": app.package_info().version.to_string(),
            "pid": std::process::id(),
            "dev": paths::IS_DEV,
        })),

        "status" => Ok(json!({
            "version": app.package_info().version.to_string(),
            "dev": paths::IS_DEV,
            "runtime": runtime::find(),
            "bunInstallCommand": runtime::BUN_INSTALL_COMMAND,
            "appsDir": paths::apps_dir(),
            "database": paths::db_path(),
            "socket": paths::socket_path(),
        })),

        "list" => Ok(Value::Array(miniapp::list()?.iter().map(summary).collect())),

        "get" => {
            let rec = miniapp::resolve(&req(args, "app")?)?;
            let mut v = summary(&rec);
            v["config"] = json!({
                "schema": miniapp::config_schema(&rec.id),
                "values": miniapp::config_values(&rec.id),
            });
            if let Some(file) = opt(args, "file") {
                let kind = FileKind::parse(&file)?;
                v["file"] = kind.as_str().into();
                v["content"] = miniapp::read_file(&rec.id, kind).into();
            }
            Ok(v)
        }

        "create" => {
            let input = CreateInput {
                name: req(args, "name")?,
                slug: opt(args, "id"),
                description: opt(args, "description"),
                icon: opt(args, "icon"),
                icon_svg: opt(args, "iconSvg"),
                category: opt(args, "category"),
                version: opt(args, "version"),
                frontend_code: Some(
                    opt(args, "frontend")
                        .filter(|s| !s.trim().is_empty())
                        .unwrap_or_else(|| STARTER_FRONTEND.to_string()),
                ),
                backend_code: opt(args, "backend"),
                panel_code: opt(args, "panel"),
                enabled: Some(false),
            };
            let rec = ops::create(app, input).await?;
            Ok(summary(&rec))
        }

        "write" => {
            let rec = miniapp::resolve(&req(args, "app")?)?;
            let kind = FileKind::parse(&req(args, "file")?)?;
            let content = opt(args, "content").ok_or("missing \"content\"")?;
            let rec = ops::write_file(app, &rec.id, kind, content).await?;
            Ok(summary(&rec))
        }

        "update" => {
            let rec = miniapp::resolve(&req(args, "app")?)?;
            let input = UpdateInput {
                name: opt(args, "name"),
                description: opt(args, "description"),
                icon: opt(args, "icon"),
                icon_svg: opt(args, "iconSvg"),
                category: opt(args, "category"),
                version: opt(args, "version"),
                ..Default::default()
            };
            if !input.metadata_changed() {
                return Err("Nothing to update. Pass --name, --description, --icon, --icon-file, --category or --version.".into());
            }
            let rec = ops::update(app, &rec.id, input).await?;
            Ok(summary(&rec))
        }

        "delete" => {
            let rec = miniapp::resolve(&req(args, "app")?)?;
            ops::delete(app, &rec.id).await?;
            Ok(json!({ "id": rec.id, "name": rec.name, "deleted": true }))
        }

        "enable" | "disable" => {
            let rec = miniapp::resolve(&req(args, "app")?)?;
            let result = ops::set_enabled(app, &rec.id, cmd == "enable").await?;
            if !result.missing_configs.is_empty() {
                return Err(format!(
                    "Cannot enable \"{}\": required config missing: {}. Set it in Nonla Desk → the app's settings.",
                    rec.name,
                    result.missing_configs.join(", ")
                ));
            }
            Ok(json!({ "id": rec.id, "name": rec.name, "enabled": result.enabled }))
        }

        "reload" => {
            let rec = miniapp::resolve(&req(args, "app")?)?;
            let rec = ops::reload(app, &rec.id).await?;
            Ok(summary(&rec))
        }

        "install" => {
            let rec = miniapp::resolve(&req(args, "app")?)?;
            let (a, id) = (app.clone(), rec.id.clone());
            let path = tauri::async_runtime::spawn_blocking(move || bundle::install(&a, &id))
                .await
                .map_err(|e| e.to_string())??;
            ops::broadcast(app, ops::ChangeEvent::metadata(&rec.id));
            if args.get("open").and_then(Value::as_bool).unwrap_or(false) {
                bundle::open(&rec.id)?;
            }
            Ok(json!({ "id": rec.id, "name": rec.name, "path": path }))
        }

        "uninstall" => {
            let rec = miniapp::resolve(&req(args, "app")?)?;
            let path = bundle::uninstall(&rec.id)?;
            ops::broadcast(app, ops::ChangeEvent::metadata(&rec.id));
            Ok(json!({ "id": rec.id, "name": rec.name, "removed": path }))
        }

        // A standalone app asks the desktop to give up this app's backend.
        "release" => {
            let id = req(args, "app")?;
            backend::stop(&id).await;
            Ok(json!({ "id": id }))
        }

        "check" => {
            let mut files = serde_json::Map::new();
            let mut name = Value::Null;
            let mut icon = opt(args, "iconSvg");
            if let Some(a) = opt(args, "app") {
                let rec = miniapp::resolve(&a)?;
                name = rec.name.clone().into();
                icon = icon.or_else(|| miniapp::read_icon_svg(&rec.id));
                let code = miniapp::read_code(&rec.id);
                files.insert("frontend".into(), code.frontend_code.into());
                files.insert("backend".into(), code.backend_code.into());
                files.insert("panel".into(), code.panel_code.unwrap_or_default().into());
            }
            for k in ["frontend", "backend", "panel"] {
                if let Some(v) = opt(args, k) {
                    files.insert(k.into(), v.into());
                }
            }
            if files.is_empty() && icon.is_none() {
                return Err(
                    "Pass an app, or --frontend/--backend/--panel/--icon-file to check.".into(),
                );
            }
            let mut result = if files.is_empty() {
                json!({ "ok": true, "message": "", "files": [] })
            } else {
                check::run(app, Value::Object(files)).await?
            };
            // icon.svg is checked here with the same rules `create`/`update` enforce.
            if let Some(svg) = icon {
                let errors: Vec<String> =
                    miniapp::validate_svg_icon(&svg).err().into_iter().collect();
                if !errors.is_empty() {
                    result["ok"] = false.into();
                    result["message"] =
                        "Found errors. Fix them before enabling or reloading the app.".into();
                }
                if let Some(list) = result["files"].as_array_mut() {
                    list.push(json!({ "file": "icon", "ok": errors.is_empty(), "errors": errors }));
                }
            }
            result["name"] = name;
            Ok(result)
        }

        "logs" => {
            let rec = miniapp::resolve(&req(args, "app")?)?;
            let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(100) as usize;
            let logs = backend::logs(&rec.id);
            let start = logs.len().saturating_sub(limit);
            Ok(json!({
                "id": rec.id,
                "name": rec.name,
                "running": backend::is_running(&rec.id),
                "logs": &logs[start..],
            }))
        }

        "open" => {
            let route = match opt(args, "app") {
                Some(a) => {
                    let rec = miniapp::resolve(&a)?;
                    // Installed as a native app: that is where it opens.
                    if rec.enabled && bundle::find_installed(&rec.id).is_some() {
                        bundle::open(&rec.id)?;
                        return Ok(json!({ "native": true }));
                    }
                    format!("mini/{}", rec.id)
                }
                None => String::new(),
            };
            shell::navigate(app, &route);
            Ok(json!({ "route": format!("/{route}") }))
        }

        "import" => {
            let path = PathBuf::from(req(args, "path")?);
            let bundle = if path.is_dir() {
                miniapp::bundle_from_dir(&path)?
            } else {
                let bytes = std::fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))?;
                miniapp::bundle_from_zip(&bytes)?
            };
            let result = miniapp::import_bundle(bundle, args["force"].as_bool() == Some(true))?;
            Ok(ops::import(app, result).await)
        }

        "export" => {
            let rec = miniapp::resolve(&req(args, "app")?)?;
            let out = PathBuf::from(req(args, "out")?);
            let bytes = miniapp::export_zip(&rec.id)?;
            std::fs::write(&out, bytes).map_err(|e| format!("{}: {e}", out.display()))?;
            Ok(json!({ "id": rec.id, "name": rec.name, "path": out }))
        }

        "market_add" => {
            let (source, name) = (req(args, "source")?, opt(args, "name"));
            blocking(move || market::add(&source, name.as_deref())).await
        }
        "market_list" => Ok(Value::Array(blocking(market::list_markets).await?)),
        "market_update" => {
            let name = opt(args, "name");
            blocking(move || market::update(name.as_deref())).await
        }
        "market_remove" => {
            let name = req(args, "name")?;
            blocking(move || market::remove(&name)).await
        }
        "market_apps" => {
            let name = opt(args, "market");
            blocking(move || market::apps(name.as_deref())).await
        }
        "market_show" => {
            let reference = req(args, "app")?;
            blocking(move || market::show(&reference)).await
        }
        "market_install" => {
            let reference = req(args, "app")?;
            let force = args["force"].as_bool() == Some(true);
            let result = blocking(move || market::install(&reference, force)).await?;
            Ok(ops::import(app, result).await)
        }
        "market_publish" => {
            let (name, to) = (req(args, "app")?, req(args, "to")?);
            blocking(move || market::publish(&name, &to)).await
        }

        other => Err(format!(
            "Unknown command \"{other}\". Run `nonladesk --help`."
        )),
    }
}
