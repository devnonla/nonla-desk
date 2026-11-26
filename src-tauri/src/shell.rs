//! Windows, menu bar menu, and the tray icon with its popover panel.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::window::Color;
use tauri::{
    AppHandle, Emitter, LogicalPosition, Manager, PhysicalPosition, Rect, TitleBarStyle,
    WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

use crate::{paths, updater};

const MAIN: &str = "main";
const TRAY: &str = "tray";

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    create_main(app)?;
    create_tray_panel(app)?;
    create_menu(app)?;
    create_tray_icon(app)?;
    Ok(())
}

// ─── Main window ─────────────────────────────────────────────────────────────

fn create_main(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let win = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title(if paths::IS_DEV {
            "Nonla Desk - Development"
        } else {
            "Nonla Desk"
        })
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .title_bar_style(TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(LogicalPosition::new(16.0, 20.0))
        .background_color(Color(0xf6, 0xc2, 0x8b, 0xff))
        .build()?;

    // Closing hides the window; the app keeps running in the menu bar so the
    // CLI and mini app backends stay available.
    // Like Passwords: with no window open there is no Dock icon either, only the
    // menu bar one.
    let w = win.clone();
    let handle = app.clone();
    win.on_window_event(move |e| {
        if let WindowEvent::CloseRequested { api, .. } = e {
            api.prevent_close();
            let _ = w.hide();
            let _ = handle.set_activation_policy(tauri::ActivationPolicy::Accessory);
        }
    });
    Ok(win)
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Routes asked for before the main window's UI was listening (e.g. `nonladesk open`
/// right after launch). The UI takes them with `ui_ready`.
static PENDING_ROUTES: Mutex<Vec<String>> = Mutex::new(Vec::new());
static UI_READY: AtomicBool = AtomicBool::new(false);

pub fn navigate(app: &AppHandle, route: &str) {
    show_main(app);
    if route.is_empty() {
        return;
    }
    if UI_READY.load(Ordering::SeqCst) {
        let _ = app.emit_to(MAIN, "navigate-tool", route.to_string());
    } else if let Ok(mut pending) = PENDING_ROUTES.lock() {
        pending.push(route.to_string());
    }
}

/// Called once the UI listens for `navigate-tool`; returns what it missed.
pub fn take_pending_routes() -> Vec<String> {
    UI_READY.store(true, Ordering::SeqCst);
    PENDING_ROUTES
        .lock()
        .map(|mut p| std::mem::take(&mut *p))
        .unwrap_or_default()
}

// ─── Menu bar menu ───────────────────────────────────────────────────────────

fn create_menu(app: &AppHandle) -> tauri::Result<()> {
    let home = MenuItemBuilder::with_id("home", "All Apps")
        .accelerator("CmdOrCtrl+B")
        .build(app)?;
    let learn = MenuItemBuilder::with_id("learn", "Learn More").build(app)?;
    let import = MenuItemBuilder::with_id("import", "Import Mini App…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;

    let about = MenuItemBuilder::with_id("about", "About Nonla Desk").build(app)?;
    let app_menu = SubmenuBuilder::new(app, "Nonla Desk")
        .item(&about)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    let file = SubmenuBuilder::new(app, "File").item(&import).build()?;
    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let view = SubmenuBuilder::new(app, "View")
        .item(&home)
        .separator()
        .fullscreen()
        .build()?;
    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;
    let help = SubmenuBuilder::new(app, "Help").item(&learn).build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&app_menu, &file, &edit, &view, &window, &help])
        .build()?;
    app.set_menu(menu)?;
    app.on_menu_event(|app, e| match e.id().as_ref() {
        "home" => navigate(app, ""),
        "import" => navigate(app, "import"),
        "about" => navigate(app, "about"),
        "learn" => {
            use tauri_plugin_opener::OpenerExt;
            let _ = app
                .opener()
                .open_url("https://github.com/devnonla/nonla-desk", None::<&str>);
        }
        _ => {}
    });
    Ok(())
}

// ─── Tray icon + panel ───────────────────────────────────────────────────────

/// When the panel lost focus. A tray click right after a blur is the click
/// that caused it, so it should not re-open the panel.
static LAST_BLUR: Mutex<Option<Instant>> = Mutex::new(None);

pub fn create_tray_panel(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let win = WebviewWindowBuilder::new(app, TRAY, WebviewUrl::App("index.html".into()))
        .title("Nonla Desk Panel")
        .inner_size(380.0, 520.0)
        .decorations(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .visible(false)
        .focused(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        // No system shadow: it adds a light border line around the rounded wallpaper.
        .shadow(false)
        .transparent(true)
        .build()?;

    let a = app.clone();
    win.on_window_event(move |e| match e {
        WindowEvent::Focused(false) => {
            if let Ok(mut t) = LAST_BLUR.lock() {
                *t = Some(Instant::now());
            }
            hide_tray_panel(&a);
        }
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            hide_tray_panel(&a);
        }
        _ => {}
    });
    Ok(win)
}

pub fn hide_tray_panel(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(TRAY) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
            let _ = app.emit_to(TRAY, "tray-visibility-change", false);
        }
    }
}

pub fn toggle_tray_panel(app: &AppHandle, rect: Rect) {
    let Some(w) = app.get_webview_window(TRAY) else {
        return;
    };
    if w.is_visible().unwrap_or(false) {
        hide_tray_panel(app);
        return;
    }
    let just_blurred = LAST_BLUR
        .lock()
        .ok()
        .and_then(|t| *t)
        .is_some_and(|t| t.elapsed() < Duration::from_millis(250));
    if just_blurred {
        return;
    }

    let scale = w.scale_factor().unwrap_or(2.0);
    let pos: PhysicalPosition<f64> = rect.position.to_physical(scale);
    let size = rect.size.to_physical::<f64>(scale);
    let win_w = w
        .outer_size()
        .map(|s| s.width as f64)
        .unwrap_or(380.0 * scale);
    let mut x = pos.x + size.width / 2.0 - win_w / 2.0;
    let y = pos.y + size.height + 4.0 * scale;
    if let Ok(Some(m)) = w.current_monitor() {
        let left = m.position().x as f64;
        let right = left + m.size().width as f64 - win_w;
        x = x.clamp(left, right.max(left));
    }
    let _ = w.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
    let _ = w.show();
    let _ = w.set_focus();
    let _ = app.emit_to(TRAY, "tray-visibility-change", true);
}

fn create_tray_icon(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItemBuilder::with_id("tray-open", "Open Nonla Desk").build(app)?;
    let quit = MenuItemBuilder::with_id("tray-quit", "Quit Nonla Desk").build(app)?;
    let mut menu = MenuBuilder::new(app).item(&open).separator();
    if updater::config().is_some() {
        let updates = MenuItemBuilder::with_id("tray-updates", "Check for Updates…").build(app)?;
        updater::set_menu_item(app, updates.clone());
        menu = menu.item(&updates).separator();
    }
    let menu = menu.item(&quit).build()?;

    TrayIconBuilder::with_id("nonladesk")
        .icon(Image::from_bytes(include_bytes!("../icons/tray@2x.png"))?)
        .icon_as_template(true)
        .tooltip(if paths::IS_DEV {
            "Nonla Desk [DEV]"
        } else {
            "Nonla Desk"
        })
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id().as_ref() {
            "tray-open" => show_main(app),
            "tray-updates" => {
                tauri::async_runtime::spawn(updater::check(app.clone(), true));
            }
            "tray-quit" => app.exit(0),
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
                toggle_tray_panel(tray.app_handle(), rect);
            }
        })
        .build(app)?;
    Ok(())
}
