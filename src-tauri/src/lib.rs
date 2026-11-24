//! Nonla Desk: a macOS desktop for mini apps that AI agents write through the
//! `nonla` CLI. See CLAUDE.md for the architecture.

mod backend;
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
mod updater;

use tauri::RunEvent;

pub fn run() {
    if let Err(e) = db::init() {
        eprintln!("[db] failed to open {}: {e}", paths::db_path().display());
        std::process::exit(1);
    }

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            shell::show_main(app)
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init());
    // Only builds made with updater keys (scripts/build-app.ts) get the updater.
    if let Some(plugin) = updater::plugin() {
        builder = builder.plugin(plugin);
    }

    let app = builder
        .manage(updater::Updates::default())
        .setup(|app| {
            let handle = app.handle().clone();
            shell::setup(&handle)?;
            server::start(handle.clone());
            if !paths::IS_DEV {
                cli::ensure_link();
            }
            updater::start_checks(&handle);
            tauri::async_runtime::spawn(async move { ops::load_all(&handle).await });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_version,
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
        ])
        .build(tauri::generate_context!())
        .expect("error while building Nonla Desk");

    app.run(|app, event| match event {
        RunEvent::Reopen {
            has_visible_windows,
            ..
        } if !has_visible_windows => {
            shell::show_main(app);
        }
        RunEvent::Exit => {
            tauri::async_runtime::block_on(backend::stop_all());
            server::cleanup();
        }
        _ => {}
    });
}
