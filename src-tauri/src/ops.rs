//! Mini app operations shared by the UI commands and the CLI socket server:
//! data change + backend restart + `miniapp:changed` broadcast.

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::miniapp::{self, CreateInput, FileKind, ImportResult, MiniApp, UpdateInput};
use crate::{backend, bundle};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeEvent {
    pub action: &'static str,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_changed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata_changed: Option<bool>,
}

impl ChangeEvent {
    /// The app's list row changed (for example it was installed as a native app).
    pub fn metadata(id: &str) -> Self {
        Self {
            action: "updated",
            id: id.into(),
            enabled: None,
            code_changed: None,
            metadata_changed: Some(true),
        }
    }

    pub fn enabled(id: &str, enabled: bool) -> Self {
        Self {
            action: "updated",
            id: id.into(),
            enabled: Some(enabled),
            code_changed: None,
            metadata_changed: None,
        }
    }
}

pub fn broadcast(app: &AppHandle, ev: ChangeEvent) {
    let _ = app.emit("miniapp:changed", ev);
}

/// Start the backend without blocking the caller (dependency installs can be slow).
fn spawn_start(app: &AppHandle, rec: MiniApp) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = backend::start(&app, &rec).await;
    });
}

/// Rebuild the app's standalone bundle (name or icon changed), if it has one.
fn refresh_standalone(app: &AppHandle, id: &str) {
    if bundle::find_installed(id).is_some() {
        let (app, id) = (app.clone(), id.to_string());
        tauri::async_runtime::spawn_blocking(move || bundle::refresh(&app, &id));
    }
}

/// Remove an app's standalone bundle and hand its backend back to the desktop.
/// The standalone app quits itself once its bundle is gone (`solo::watch`); the
/// desktop starts the backend again as soon as the standalone app lets go of it.
pub async fn uninstall_standalone(
    app: &AppHandle,
    id: &str,
) -> Result<Option<std::path::PathBuf>, String> {
    let path = bundle::uninstall(id)?;
    // The desktop still runs the backend when the standalone app was never opened.
    if path.is_some() && !backend::is_running(id) {
        if let Some(rec) = miniapp::get(id)?.filter(|r| r.enabled) {
            let (app, id) = (app.clone(), id.to_string());
            tauri::async_runtime::spawn(async move {
                for _ in 0..40 {
                    if !backend::owned_elsewhere(&id) {
                        break;
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                }
                if backend::start(&app, &rec).await.is_ok() && backend::is_running(&id) {
                    // Open windows asked the backend for their data while it was
                    // away: remount them so they ask again.
                    broadcast(
                        &app,
                        ChangeEvent {
                            action: "updated",
                            id: id.clone(),
                            enabled: Some(true),
                            code_changed: Some(true),
                            metadata_changed: None,
                        },
                    );
                }
            });
        }
    }
    broadcast(app, ChangeEvent::metadata(id));
    Ok(path)
}

pub async fn load_all(app: &AppHandle) {
    let Ok(apps) = miniapp::list() else { return };
    for rec in apps.into_iter().filter(|a| a.enabled) {
        spawn_start(app, rec);
    }
}

pub async fn create(app: &AppHandle, input: CreateInput) -> Result<MiniApp, String> {
    let rec = miniapp::create(&input)?;
    if rec.enabled {
        spawn_start(app, rec.clone());
    }
    broadcast(
        app,
        ChangeEvent {
            action: "created",
            id: rec.id.clone(),
            enabled: Some(rec.enabled),
            code_changed: None,
            metadata_changed: None,
        },
    );
    Ok(rec)
}

pub async fn update(app: &AppHandle, id: &str, input: UpdateInput) -> Result<MiniApp, String> {
    let before = miniapp::require(id)?;
    let rec = miniapp::update(id, &input)?;
    let restart = input.backend_code.is_some() || before.enabled != rec.enabled;
    if restart {
        backend::stop(id).await;
        if rec.enabled {
            spawn_start(app, rec.clone());
        }
    }
    if input.metadata_changed() {
        refresh_standalone(app, id);
    }
    broadcast(
        app,
        ChangeEvent {
            action: "updated",
            id: id.into(),
            enabled: Some(rec.enabled),
            code_changed: Some(input.code_changed()),
            metadata_changed: Some(input.metadata_changed()),
        },
    );
    Ok(rec)
}

pub async fn write_file(
    app: &AppHandle,
    id: &str,
    kind: FileKind,
    content: String,
) -> Result<MiniApp, String> {
    if kind == FileKind::Frontend && content.trim().is_empty() {
        return Err("frontend cannot be empty: a mini app must export a React component".into());
    }
    let mut input = UpdateInput::default();
    match kind {
        FileKind::Frontend => input.frontend_code = Some(content),
        FileKind::Backend => input.backend_code = Some(content),
        FileKind::Panel => input.panel_code = Some(content),
    }
    update(app, id, input).await
}

pub async fn delete(app: &AppHandle, id: &str) -> Result<bool, String> {
    backend::stop(id).await;
    let deleted = miniapp::delete(id)?;
    if deleted {
        let _ = bundle::uninstall(id);
        broadcast(
            app,
            ChangeEvent {
                action: "deleted",
                id: id.into(),
                enabled: Some(false),
                code_changed: None,
                metadata_changed: None,
            },
        );
    }
    Ok(deleted)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnableResult {
    pub enabled: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub missing_configs: Vec<String>,
}

pub async fn set_enabled(app: &AppHandle, id: &str, enabled: bool) -> Result<EnableResult, String> {
    let rec = miniapp::require(id)?;
    if rec.enabled == enabled {
        return Ok(EnableResult {
            enabled,
            missing_configs: vec![],
        });
    }
    if enabled {
        let missing = miniapp::missing_required_configs(id);
        if !missing.is_empty() {
            return Ok(EnableResult {
                enabled: false,
                missing_configs: missing,
            });
        }
    }
    let rec = update(
        app,
        id,
        UpdateInput {
            enabled: Some(enabled),
            ..Default::default()
        },
    )
    .await?;
    Ok(EnableResult {
        enabled: rec.enabled,
        missing_configs: vec![],
    })
}

/// Re-read code from disk: restart the backend and tell open windows to re-render.
/// Used after editing files in `~/.nonla-desk/apps/<id>/` directly.
pub async fn reload(app: &AppHandle, id: &str) -> Result<MiniApp, String> {
    let rec = miniapp::require(id)?;
    backend::stop(id).await;
    if rec.enabled {
        spawn_start(app, rec.clone());
    }
    broadcast(
        app,
        ChangeEvent {
            action: "updated",
            id: id.into(),
            enabled: Some(rec.enabled),
            code_changed: Some(true),
            metadata_changed: Some(true),
        },
    );
    Ok(rec)
}

pub async fn import(app: &AppHandle, result: ImportResult) -> Value {
    let ImportResult {
        app: rec,
        updated,
        files,
    } = result;
    if rec.enabled {
        backend::stop(&rec.id).await;
        spawn_start(app, rec.clone());
    }
    broadcast(
        app,
        ChangeEvent {
            action: if updated { "updated" } else { "created" },
            id: rec.id.clone(),
            enabled: Some(rec.enabled),
            code_changed: Some(true),
            metadata_changed: Some(true),
        },
    );
    json!({
        "id": rec.id,
        "name": rec.name,
        "slug": rec.slug,
        "enabled": rec.enabled,
        "updated": updated,
        "files": files.iter().map(|(p, n)| json!({ "path": p, "bytes": n })).collect::<Vec<_>>(),
    })
}
