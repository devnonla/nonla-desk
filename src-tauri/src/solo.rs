//! Solo mode: this process is one mini app installed as its own macOS app
//! (see `bundle.rs`). One window, one app's backend, its own Dock icon. It
//! shares `~/.nonla-desk` and the database with the desktop but does not run the
//! CLI socket, the tray or the updater.

use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::time::{Duration, SystemTime};

use serde_json::{json, Value};
use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::window::Color;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use crate::miniapp::{self, FileKind, MiniApp};
use crate::{backend, bundle, ops, paths, shell};

pub const WINDOW: &str = "solo";
const TRAY_ID: &str = "solo-tray";
const PANEL: &str = "tray";

/// The app this process is, when it was started from an installed bundle.
pub fn app_id() -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    let marker = exe.parent()?.parent()?.join("Resources/solo.json");
    let v: Value = serde_json::from_str(&std::fs::read_to_string(marker).ok()?).ok()?;
    v["id"].as_str().map(str::to_string)
}

pub fn setup(app: &AppHandle, id: &str) -> Result<(), Box<dyn std::error::Error>> {
    let rec = miniapp::get(id)?.ok_or("This app no longer exists in Nonla Desk")?;

    let win = WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::App("index.html".into()))
        .title(&rec.name)
        .inner_size(980.0, 700.0)
        .min_inner_size(420.0, 320.0)
        .background_color(Color(0xff, 0xff, 0xff, 0xff))
        .build()?;
    // An app with a menu bar panel keeps running when its window is closed.
    let handle = app.clone();
    let w = win.clone();
    win.on_window_event(move |e| {
        if let WindowEvent::CloseRequested { api, .. } = e {
            if handle.tray_by_id(TRAY_ID).is_some() {
                api.prevent_close();
                let _ = w.hide();
                // Menu bar only, like Passwords: no Dock icon while the window is hidden.
                let _ = handle.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
        }
    });
    create_menu(app, &rec.name)?;
    sync_tray(app, &rec);

    backend::wait_for_lock();
    let handle = app.clone();
    let id = id.to_string();
    tauri::async_runtime::spawn(async move {
        // If the desktop is running this app's backend, ask it to let go.
        let release_id = id.clone();
        let _ = tauri::async_runtime::spawn_blocking(move || release_in_desktop(&release_id)).await;
        if rec.enabled {
            let _ = backend::start(&handle, &rec).await;
        }
        watch(handle, rec).await;
    });
    Ok(())
}

/// Bring the app's window back (Dock click, tray menu).
pub fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(WINDOW) {
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Menu bar icon and popover for apps that have a panel; removed when they do not.
fn sync_tray(app: &AppHandle, rec: &MiniApp) {
    let has_tray = app.tray_by_id(TRAY_ID).is_some();
    let wanted = rec.enabled && miniapp::has_file(&rec.id, FileKind::Panel);
    if wanted && !has_tray {
        if let Err(e) = create_tray(app, rec) {
            eprintln!("[solo] tray: {e}");
            return;
        }
        if app.get_webview_window(PANEL).is_none() {
            let _ = shell::create_tray_panel(app);
        }
    } else if !wanted && has_tray {
        app.remove_tray_by_id(TRAY_ID);
        if let Some(w) = app.get_webview_window(PANEL) {
            let _ = w.destroy();
        }
        show(app);
    }
}

fn create_tray(app: &AppHandle, rec: &MiniApp) -> tauri::Result<()> {
    let open = MenuItemBuilder::with_id("solo-open", format!("Open {}", rec.name)).build(app)?;
    let quit = MenuItemBuilder::with_id("solo-quit", format!("Quit {}", rec.name)).build(app)?;
    let menu = MenuBuilder::new(app)
        .item(&open)
        .separator()
        .item(&quit)
        .build()?;

    let own_icon = bundle::tray_icon(&rec.id);
    let template = own_icon.is_none();
    let icon = match own_icon {
        Some(i) => i,
        None => Image::from_bytes(include_bytes!("../icons/tray@2x.png"))?,
    };
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(template)
        .tooltip(&rec.name)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id().as_ref() {
            "solo-open" => show(app),
            "solo-quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = e
            {
                shell::toggle_tray_panel(tray.app_handle(), rect);
            }
        })
        .build(app)?;
    Ok(())
}

fn create_menu(app: &AppHandle, name: &str) -> tauri::Result<()> {
    let app_menu = SubmenuBuilder::new(app, name)
        .hide_with_text(format!("Hide {name}"))
        .hide_others()
        .show_all()
        .separator()
        .quit_with_text(format!("Quit {name}"))
        .build()?;
    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let view = SubmenuBuilder::new(app, "View").fullscreen().build()?;
    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;
    let menu = MenuBuilder::new(app)
        .items(&[&app_menu, &edit, &view, &window])
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

/// Tell the running desktop (if any) to stop this app's backend so this process can own it.
fn release_in_desktop(id: &str) {
    let Ok(mut stream) = UnixStream::connect(paths::socket_path()) else {
        return;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));
    let req = json!({ "cmd": "release", "args": { "app": id } });
    if writeln!(stream, "{req}").is_ok() {
        let mut line = String::new();
        let _ = BufReader::new(stream).read_line(&mut line);
    }
}

// ─── Follow edits made through the CLI ───────────────────────────────────────

/// Code and metadata are changed by `nonladesk` in the desktop process. This process
/// has no socket, so it notices through the files and the database row instead.
fn signature(rec: &MiniApp) -> Vec<Option<SystemTime>> {
    let mut files: Vec<PathBuf> = [FileKind::Frontend, FileKind::Backend, FileKind::Panel]
        .into_iter()
        .map(|k| miniapp::file_path(&rec.id, k))
        .collect();
    files.push(miniapp::icon_svg_path(&rec.id));
    files
        .iter()
        .map(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok())
        .collect()
}

async fn watch(app: AppHandle, first: MiniApp) {
    let id = first.id.clone();
    let mut seen = (first.updated_at.clone(), first.enabled, signature(&first));
    let mut name = first.name;
    loop {
        tokio::time::sleep(Duration::from_secs(1)).await;
        let rec = match miniapp::get(&id) {
            Ok(Some(rec)) => rec,
            Ok(None) => {
                app.exit(0);
                return;
            }
            Err(_) => continue,
        };
        let now = (rec.updated_at.clone(), rec.enabled, signature(&rec));
        if now == seen {
            continue;
        }
        seen = now;
        if rec.name != name {
            name = rec.name.clone();
            if let Some(w) = app.get_webview_window(WINDOW) {
                let _ = w.set_title(&name);
            }
            let _ = create_menu(&app, &name);
            app.remove_tray_by_id(TRAY_ID);
        }
        let _ = ops::reload(&app, &id).await;
        sync_tray(&app, &rec);
    }
}
