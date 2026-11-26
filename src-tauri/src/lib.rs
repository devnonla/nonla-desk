//! Nonla Desk: a macOS desktop for mini apps that AI agents write through the
//! `nonladesk` CLI. See CLAUDE.md for the architecture.

mod backend;
mod bundle;
mod check;
pub mod cli;
mod commands;
mod db;
mod miniapp;
mod ops;
mod paths;
mod runtime;
mod server;
mod shell;
mod solo;
mod updater;

use tauri::RunEvent;

pub fn run() {
    if let Err(e) = db::init() {
        eprintln!("[db] failed to open {}: {e}", paths::db_path().display());
        std::process::exit(1);
    }

    // Started from an installed standalone bundle: one mini app, no desktop.
    let solo = solo::app_id();

    let mut builder = tauri::Builder::default();
    if solo.is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            shell::show_main(app)
        }));
    }
    builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init());
    // Only builds made with updater keys (scripts/build-app.ts) get the updater.
    if solo.is_none() {
        if let Some(plugin) = updater::plugin() {
            builder = builder.plugin(plugin);
        }
    }

    let solo_id = solo.clone();
    let app = builder
        .manage(updater::Updates::default())
        .setup(move |app| {
            let handle = app.handle().clone();
            if let Some(id) = &solo_id {
                return solo::setup(&handle, id);
            }
            shell::setup(&handle)?;
            server::start(handle.clone());
            if !paths::IS_DEV {
                cli::ensure_link();
            }
            updater::start_checks(&handle);
            let bundles = handle.clone();
            std::thread::spawn(move || bundle::refresh_outdated(&bundles));
            tauri::async_runtime::spawn(async move { ops::load_all(&handle).await });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_version,
            commands::update_info,
            commands::check_for_updates,
            commands::list_mini_apps,
            commands::get_mini_app,
            commands::create_mini_app,
            commands::update_mini_app,
            commands::delete_mini_app,
            commands::toggle_mini_app,
            commands::import_mini_app_zip,
            commands::export_mini_app,
            commands::send_mini_app_ipc,
            commands::mini_app_logs,
            commands::storage_get,
            commands::storage_set,
            commands::storage_delete,
            commands::storage_get_all,
            commands::get_mini_app_config,
            commands::set_mini_app_config,
            commands::notify,
            commands::hide_tray,
            commands::open_main,
            commands::check_result,
            commands::ui_ready,
            commands::solo_app_id,
            commands::standalone_path,
            commands::install_standalone,
            commands::uninstall_standalone,
            commands::open_standalone,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Nonla Desk");

    let is_solo = solo.is_some();
    app.run(move |app, event| match event {
        RunEvent::Reopen {
            has_visible_windows,
            ..
        } if !has_visible_windows => {
            if is_solo {
                solo::show(app);
            } else {
                shell::show_main(app);
            }
        }
        RunEvent::Exit => {
            tauri::async_runtime::block_on(backend::stop_all());
            // The socket belongs to the desktop.
            if !is_solo {
                server::cleanup();
            }
        }
        _ => {}
    });
}
