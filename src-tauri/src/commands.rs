//! Tauri commands called by the React UI (`src/lib/api.ts`).

use std::collections::BTreeMap;

use serde_json::{json, Value};
use tauri::AppHandle;
use tokio::sync::oneshot;

use crate::backend::{self, LogEntry};
use crate::miniapp::{self, CreateInput, UpdateInput};
use crate::ops::{self, EnableResult};
use crate::{bundle, check, shell, solo, updater};

#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// What the UI shows about updates: the running version, whether this build can
/// update itself (only builds made with updater keys), and a newer version if known.
#[tauri::command]
pub fn update_info(app: AppHandle) -> Value {
    json!({
        "version": app.package_info().version.to_string(),
        "supported": updater::config().is_some(),
        "pending": updater::pending(&app),
    })
}

/// Same as the tray's "Check for Updates…": reports "up to date" or asks to install.
#[tauri::command]
pub async fn check_for_updates(app: AppHandle) {
    updater::check(app, true).await;
}

#[tauri::command]
pub fn list_mini_apps() -> Result<Vec<Value>, String> {
    let native = bundle::installed_ids();
    Ok(miniapp::list()?
        .iter()
        .map(|a| {
            let mut v = miniapp::list_item(a);
            v["standalone"] = native.contains(&a.id).into();
            v
        })
        .collect())
}

#[tauri::command]
pub fn get_mini_app(id: String) -> Result<Option<Value>, String> {
    Ok(miniapp::get(&id)?.as_ref().map(miniapp::detail))
}

#[tauri::command]
pub async fn create_mini_app(app: AppHandle, data: CreateInput) -> Result<Value, String> {
    let rec = ops::create(&app, data).await?;
    Ok(json!({ "id": rec.id }))
}

#[tauri::command]
pub async fn update_mini_app(app: AppHandle, id: String, data: UpdateInput) -> Result<(), String> {
    ops::update(&app, &id, data).await.map(|_| ())
}

#[tauri::command]
pub async fn delete_mini_app(app: AppHandle, id: String) -> Result<bool, String> {
    ops::delete(&app, &id).await
}

#[tauri::command]
pub async fn toggle_mini_app(app: AppHandle, id: String) -> Result<EnableResult, String> {
    let rec = miniapp::require(&id)?;
    ops::set_enabled(&app, &id, !rec.enabled).await
}

#[tauri::command]
pub async fn import_mini_app_zip(app: AppHandle, data: Vec<u8>) -> Result<Value, String> {
    let result = miniapp::import_bundle(miniapp::bundle_from_zip(&data)?, false)?;
    Ok(ops::import(&app, result).await)
}

// ─── Import window ───────────────────────────────────────────────────────────

/// Run blocking work (git, files) off the async runtime.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

/// Check a zip before importing it: manifest, files, what the code touches.
#[tauri::command]
pub fn inspect_zip(data: Vec<u8>) -> Result<Value, String> {
    miniapp::bundle_from_zip(&data)?.inspect()
}

/// Add (or refresh) the marketplace at `source` and list its apps.
#[tauri::command]
pub async fn market_open(source: String) -> Result<Value, String> {
    blocking(move || crate::market::open(&source)).await
}

/// Check one marketplace app (`<id>@<market>`) before installing it.
#[tauri::command]
pub async fn market_inspect(reference: String) -> Result<Value, String> {
    blocking(move || crate::market::inspect(&reference)).await
}

/// Install or update one marketplace app. New apps land disabled.
#[tauri::command]
pub async fn market_install(app: AppHandle, reference: String) -> Result<Value, String> {
    let result = blocking(move || crate::market::install(&reference, false)).await?;
    Ok(ops::import(&app, result).await)
}

/// Ask where to save, then write the ZIP. Returns the path, or None if cancelled.
#[tauri::command]
pub async fn export_mini_app(app: AppHandle, id: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let rec = miniapp::require(&id)?;
    let bytes = miniapp::export_zip(&id)?;
    let slug: String = rec
        .name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let (tx, rx) = oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(format!("{slug}.miniapp.zip"))
        .add_filter("Mini app", &["zip"])
        .save_file(move |p| {
            let _ = tx.send(p);
        });
    let Some(path) = rx.await.ok().flatten() else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn send_mini_app_ipc(app_id: String, channel: String, data: Value) -> bool {
    backend::send_ipc(&app_id, &channel, data)
}

#[tauri::command]
pub fn mini_app_logs(app_id: String) -> Vec<LogEntry> {
    backend::logs(&app_id)
}

#[tauri::command]
pub fn storage_get(app_id: String, key: String) -> Result<Option<String>, String> {
    miniapp::storage_get(&app_id, &key)
}

#[tauri::command]
pub fn storage_set(app_id: String, key: String, value: String) -> Result<(), String> {
    miniapp::storage_set(&app_id, &key, &value)
}

#[tauri::command]
pub fn storage_delete(app_id: String, key: String) -> Result<(), String> {
    miniapp::storage_delete(&app_id, &key)
}

#[tauri::command]
pub fn storage_get_all(app_id: String) -> Result<BTreeMap<String, String>, String> {
    miniapp::storage_get_all(&app_id)
}

#[tauri::command]
pub fn get_mini_app_config(app_id: String) -> Value {
    json!({
        "schema": miniapp::config_schema(&app_id),
        "values": miniapp::config_values(&app_id),
    })
}

#[tauri::command]
pub fn set_mini_app_config(app_id: String, key: String, value: Value) -> Result<(), String> {
    miniapp::config_set(&app_id, &key, &value)
}

#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: Option<String>) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body.unwrap_or_default())
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hide_tray(app: AppHandle) {
    shell::hide_tray_panel(&app);
}

#[tauri::command]
pub fn open_main(app: AppHandle, route: Option<String>) {
    if solo::app_id().is_some() {
        solo::show(&app);
        return;
    }
    shell::navigate(&app, route.as_deref().unwrap_or(""));
}

/// The UI is listening for `navigate-tool`; hand it the routes it missed.
#[tauri::command]
pub fn ui_ready() -> Vec<String> {
    shell::take_pending_routes()
}

#[tauri::command]
pub fn check_result(request_id: String, result: Value) {
    check::resolve(&request_id, result);
}

// ─── Standalone apps ─────────────────────────────────────────────────────────

/// The mini app this process is when it runs as an installed standalone app.
#[tauri::command]
pub fn solo_app_id() -> Option<String> {
    solo::app_id()
}

/// Where the app is installed as its own macOS app, if it is.
#[tauri::command]
pub fn standalone_path(id: String) -> Option<String> {
    bundle::find_installed(&id).map(|p| p.display().to_string())
}

#[tauri::command]
pub async fn install_standalone(app: AppHandle, id: String) -> Result<String, String> {
    let (handle, id_for_event) = (app.clone(), id.clone());
    tauri::async_runtime::spawn_blocking(move || bundle::install(&app, &id))
        .await
        .map_err(|e| e.to_string())?
        .map(|p| {
            ops::broadcast(&handle, ops::ChangeEvent::metadata(&id_for_event));
            p.display().to_string()
        })
}

#[tauri::command]
pub async fn uninstall_standalone(app: AppHandle, id: String) -> Result<bool, String> {
    Ok(ops::uninstall_standalone(&app, &id).await?.is_some())
}

#[tauri::command]
pub fn open_standalone(id: String) -> Result<(), String> {
    bundle::open(&id)
}
