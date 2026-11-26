//! In-app updates (same model as open-agent-hands' desktop shell).
//!
//! Nothing about the updater is committed. `scripts/build-app.ts` turns it on
//! only when `NONLA_UPDATER_PUBKEY`, `TAURI_SIGNING_PRIVATE_KEY` and a release
//! endpoint are set, and passes the pubkey + endpoint as compile-time env. A
//! build without keys (dev, forks) has no updater and never pulls our releases.
//!
//! Checks run 15s after launch and every 10 minutes, or from the tray's
//! "Check for Updates…". Progress shows in the main window via `update:progress`.

use std::io::Write;
use std::sync::Mutex;
use std::time::Duration;

use serde_json::json;
use tauri::menu::MenuItem;
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

use crate::{backend, paths, server, shell};

const PUBKEY: Option<&str> = option_env!("NONLA_UPDATER_PUBKEY");
const ENDPOINT: Option<&str> = option_env!("NONLA_UPDATER_ENDPOINT");
const FIRST_CHECK: Duration = Duration::from_secs(15);
const INTERVAL: Duration = Duration::from_secs(10 * 60);
const TRAY_ID: &str = "nonladesk";

#[derive(Default)]
pub struct Updates {
    busy: Mutex<bool>,
    skipped: Mutex<Option<String>>,
    pending: Mutex<Option<String>>,
    item: Mutex<Option<MenuItem<Wry>>>,
}

/// (pubkey, endpoint) when this build was made with updater keys.
pub fn config() -> Option<(&'static str, &'static str)> {
    match (PUBKEY, ENDPOINT) {
        (Some(key), Some(url)) if !key.is_empty() && !url.is_empty() => Some((key, url)),
        _ => None,
    }
}

pub fn plugin() -> Option<tauri::plugin::TauriPlugin<Wry, tauri_plugin_updater::Config>> {
    config().map(|(pubkey, _)| tauri_plugin_updater::Builder::new().pubkey(pubkey).build())
}

/// The tray's "Check for Updates…" item, kept so its label can show progress.
pub fn set_menu_item(app: &AppHandle, item: MenuItem<Wry>) {
    *app.state::<Updates>().item.lock().unwrap() = Some(item);
}

fn log(text: &str) {
    let path = paths::root_dir().join("logs").join("updater.log");
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(f, "[{now}] {text}");
    }
}

fn set_item(app: &AppHandle, text: &str, enabled: bool) {
    if let Some(item) = app.state::<Updates>().item.lock().unwrap().as_ref() {
        let _ = item.set_text(text);
        let _ = item.set_enabled(enabled);
    }
}

fn reset_item(app: &AppHandle) {
    let pending = app.state::<Updates>().pending.lock().unwrap().clone();
    let tooltip = match &pending {
        Some(v) => format!("Nonla Desk - update {v} available"),
        None => "Nonla Desk".to_string(),
    };
    match pending {
        Some(v) => set_item(app, &format!("Install Update {v}…"), true),
        None => set_item(app, "Check for Updates…", true),
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(tooltip));
    }
    let pending = app.state::<Updates>().pending.lock().unwrap().clone();
    let _ = app.emit_to("main", "update:pending", pending);
}

/// Version found by the last check that is newer than the running one.
pub fn pending(app: &AppHandle) -> Option<String> {
    app.state::<Updates>().pending.lock().unwrap().clone()
}

fn progress(app: &AppHandle, text: Option<&str>, percent: u32) {
    let _ = app.emit_to(
        "main",
        "update:progress",
        json!({ "text": text, "percent": percent }),
    );
}

fn message(app: &AppHandle, kind: MessageDialogKind, text: String) {
    app.dialog()
        .message(text)
        .title("Nonla Desk")
        .kind(kind)
        .blocking_show();
}

fn ask(app: &AppHandle, text: String, ok: &str, cancel: &str) -> bool {
    app.dialog()
        .message(text)
        .title("Nonla Desk")
        .buttons(MessageDialogButtons::OkCancelCustom(
            ok.into(),
            cancel.into(),
        ))
        .blocking_show()
}

pub fn start_checks(app: &AppHandle) {
    if config().is_none() {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK).await;
        loop {
            check(app.clone(), false).await;
            tokio::time::sleep(INTERVAL).await;
        }
    });
}

/// `manual` = from the tray: report "up to date" and errors, ignore "Later".
pub async fn check(app: AppHandle, manual: bool) {
    let Some((_, endpoint)) = config() else {
        return;
    };
    {
        let state = app.state::<Updates>();
        let mut busy = state.busy.lock().unwrap();
        if *busy {
            return;
        }
        *busy = true;
    }
    if manual {
        set_item(&app, "Checking for Updates…", false);
    }
    let result = run(&app, endpoint, manual).await;
    *app.state::<Updates>().busy.lock().unwrap() = false;
    if let Err(err) = result {
        log(&format!("check failed: {err}"));
        if manual {
            message(
                &app,
                MessageDialogKind::Error,
                format!("Could not check for updates: {err}"),
            );
        }
    }
    reset_item(&app);
}

async fn run(app: &AppHandle, endpoint: &str, manual: bool) -> Result<(), String> {
    let url = endpoint.parse().map_err(|e| format!("{e}"))?;
    let updater = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        *app.state::<Updates>().pending.lock().unwrap() = None;
        if manual {
            let current = app.package_info().version.to_string();
            message(
                app,
                MessageDialogKind::Info,
                format!("You're up to date. Nonla Desk {current} is the latest version."),
            );
        }
        return Ok(());
    };

    log(&format!(
        "{} is available (running {})",
        update.version, update.current_version
    ));
    *app.state::<Updates>().pending.lock().unwrap() = Some(update.version.clone());
    reset_item(app);

    let skipped = app.state::<Updates>().skipped.lock().unwrap().clone();
    if !manual && skipped.as_deref() == Some(update.version.as_str()) {
        return Ok(());
    }

    shell::show_main(app);
    let mut text = format!(
        "Nonla Desk {} is available. You have {}.",
        update.version, update.current_version
    );
    if let Some(notes) = update
        .body
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty())
    {
        let notes: String = notes.chars().take(600).collect();
        text.push_str(&format!("\n\n{notes}"));
    }
    text.push_str(
        "\n\nThe app restarts after the update. Your mini apps and data stay where they are.",
    );
    if !ask(app, text, "Install and Restart", "Later") {
        *app.state::<Updates>().skipped.lock().unwrap() = Some(update.version.clone());
        return Ok(());
    }

    let version = update.version.clone();
    set_item(app, "Downloading update… 0%", false);
    progress(
        app,
        Some(&format!("Downloading Nonla Desk {version}… 0%")),
        0,
    );

    let mut downloaded: u64 = 0;
    let mut last_percent: u32 = 101;
    let installed = update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk as u64;
                let Some(total) = total.filter(|t| *t > 0) else {
                    return;
                };
                let percent = ((downloaded * 100) / total).min(100) as u32;
                if percent != last_percent {
                    last_percent = percent;
                    set_item(app, &format!("Downloading update… {percent}%"), false);
                    progress(
                        app,
                        Some(&format!("Downloading Nonla Desk {version}… {percent}%")),
                        percent,
                    );
                }
            },
            || {
                set_item(app, "Installing update…", false);
                progress(
                    app,
                    Some("Installing. Nonla Desk restarts in a moment."),
                    100,
                );
            },
        )
        .await;

    if let Err(err) = installed {
        progress(app, None, 0);
        log(&format!("install failed: {err}"));
        message(
            app,
            MessageDialogKind::Error,
            format!("The update could not be installed: {err}\n\nYour current version keeps working. Try again from the menu bar."),
        );
        return Ok(());
    }

    log(&format!("installed {version}, restarting"));
    backend::stop_all().await;
    server::cleanup();
    app.restart();
}
