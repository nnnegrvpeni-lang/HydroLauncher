pub mod commands;
pub mod config;
pub mod error;
pub mod models;
pub mod services;
pub mod state;
pub mod storage;

pub use error::{AppError, AppResult};

use commands::{
    accounts::{
        create_account, delete_account, get_accounts, get_active_account, microsoft_login,
        rename_account, set_active_account,
    },
    instances::{
        add_quick_server, backup_instance_world, create_instance, delete_instance,
        delete_instance_screenshot, delete_instance_world, delete_world_backup, duplicate_instance,
        export_instance_archive, get_instance_quick_play, get_instance_screenshots, get_instances,
        import_instance_archive, list_instance_worlds, list_world_backups, open_instance_folder,
        open_instance_log, open_screenshot_file, pick_instance_archive, read_instance_log,
        remove_quick_server, restore_world_backup, toggle_quick_server_favorite, update_instance,
    },
    java_cmd::{download_java_runtime, get_java_runtimes},
    jobs::{cancel_job, dismiss_job, list_jobs, pause_job, resume_job},
    mods::{
        check_mod_updates, export_instance_mrpack, get_horizon_mod_details, get_installed_mods,
        get_modrinth_project, get_modrinth_versions, import_mrpack_file, install_horizon_mod,
        install_local_mod, install_modrinth_mod, install_modrinth_modpack, pick_local_mod,
        pick_mrpack_file, remove_installed_mod, search_horizon_mods, search_modrinth_mods,
        toggle_installed_mod,
    },
    settings_cmd::{
        check_launcher_update, get_app_links, get_settings, get_system_info, open_data_dir,
        open_external_url, pick_directory, quit_app, save_settings_cmd, validate_data_dir,
    },
    skins::{equip_cape, get_skin, pick_skin_file, remove_cape, reset_skin, upload_skin},
    storage::{
        cleanup_storage, get_storage_report, import_drop_content, import_drop_instance,
        inspect_drop_paths,
    },
    versions::{
        check_horizon_update, cleanup_horizon_cache, ensure_java_runtime, get_install_status,
        get_loader_supported_mc_versions, get_loader_versions, get_running_instances,
        get_version_catalog, launch_instance, list_horizon_releases,
        list_installed_horizon_binaries, ping_server, prepare_instance, terminate_instance,
        update_horizon_binaries,
    },
};
use state::AppState;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Listener, Manager};

pub const QUIT_REQUESTED_EVENT: &str = "app://quit-requested";

/// Показывает главное окно из трея и переводит фокус на него.
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = tauri::Manager::get_webview_window(app, "main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Просит интерфейс подтвердить выход, потому что игра ещё запущена.
fn request_quit(app: &tauri::AppHandle) {
    show_main_window(app);
    let _ = app.emit(QUIT_REQUESTED_EVENT, ());
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Открыть HydroLauncher", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Выйти", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

    let mut builder = TrayIconBuilder::with_id("hydro-tray")
        .tooltip("HydroLauncher")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "quit" => {
                if app
                    .state::<services::launch_service::LaunchRegistry>()
                    .has_running()
                {
                    request_quit(app);
                } else {
                    app.exit(0);
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    // Иконка из ресурсов гарантирует, что значок трея виден даже если
    // системная иконка окна недоступна.
    builder = builder.icon(tauri::include_image!("icons/32x32.png"));

    builder.build(app)?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(AppState::new())
        .manage(services::launch_service::LaunchRegistry::new())
        .manage(services::jobs::JobsRegistry::new())
        .setup(|app| {
            // Настройки нужны обработчику закрытия окна до первого открытия вкладки.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(paths) = crate::storage::paths::AppPaths::discover() {
                    if let Ok(settings) =
                        crate::services::settings_service::load_or_init_settings(&paths).await
                    {
                        handle.state::<AppState>().apply_window_prefs(&settings);
                        handle
                            .state::<services::jobs::JobsRegistry>()
                            .ensure_loaded(std::path::Path::new(&settings.data_dir))
                            .await;
                    }
                }
            });
            setup_tray(app)?;

            // Прогресс подготовки и запуска показываем в подсказке трея.
            let progress_handle = app.handle().clone();
            app.listen("launch://progress", move |event| {
                let Ok(progress) = serde_json::from_str::<
                    crate::models::events::LaunchProgressEvent,
                >(event.payload())
                else {
                    return;
                };
                let Some(tray) = progress_handle.tray_by_id("hydro-tray") else {
                    return;
                };
                let text = if progress.percent >= 100.0 {
                    "HydroLauncher — готово".to_string()
                } else {
                    format!("HydroLauncher — {:.0}%", progress.percent)
                };
                let _ = tray.set_tooltip(Some(&text));
            });

            let state_handle = app.handle().clone();
            app.listen("launch://state", move |event| {
                let Ok(state) =
                    serde_json::from_str::<crate::models::events::GameStateEvent>(event.payload())
                else {
                    return;
                };
                if matches!(state.state.as_str(), "running" | "exited" | "crashed") {
                    if let Some(tray) = state_handle.tray_by_id("hydro-tray") {
                        let _ = tray.set_tooltip(Some("HydroLauncher"));
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Правила закрытия относятся только к главному окну: окно входа
            // Microsoft должно закрываться обычным образом.
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if app.state::<AppState>().close_to_tray() {
                    api.prevent_close();
                    let _ = window.hide();
                } else if app
                    .state::<services::launch_service::LaunchRegistry>()
                    .has_running()
                {
                    // Игра запущена: не закрываемся молча, а спрашиваем.
                    api.prevent_close();
                    request_quit(&app);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Аккаунты
            get_accounts,
            create_account,
            set_active_account,
            rename_account,
            delete_account,
            get_active_account,
            microsoft_login,
            // Скины и плащи
            get_skin,
            upload_skin,
            reset_skin,
            equip_cape,
            remove_cape,
            pick_skin_file,
            // Сборки
            get_instances,
            create_instance,
            update_instance,
            delete_instance,
            duplicate_instance,
            open_instance_folder,
            get_instance_quick_play,
            add_quick_server,
            remove_quick_server,
            toggle_quick_server_favorite,
            list_instance_worlds,
            backup_instance_world,
            list_world_backups,
            restore_world_backup,
            delete_world_backup,
            delete_instance_world,
            export_instance_archive,
            pick_instance_archive,
            import_instance_archive,
            read_instance_log,
            open_instance_log,
            get_instance_screenshots,
            delete_instance_screenshot,
            open_screenshot_file,
            // Настройки
            get_settings,
            save_settings_cmd,
            get_system_info,
            pick_directory,
            validate_data_dir,
            open_data_dir,
            check_launcher_update,
            get_app_links,
            open_external_url,
            quit_app,
            // Java
            get_java_runtimes,
            download_java_runtime,
            ensure_java_runtime,
            // Очередь задач установки
            list_jobs,
            pause_job,
            resume_job,
            cancel_job,
            dismiss_job,
            // Хранилище и перетаскивание
            get_storage_report,
            cleanup_storage,
            inspect_drop_paths,
            import_drop_instance,
            import_drop_content,
            // Версии и запуск
            get_version_catalog,
            get_install_status,
            prepare_instance,
            launch_instance,
            terminate_instance,
            get_running_instances,
            get_loader_versions,
            get_loader_supported_mc_versions,
            list_horizon_releases,
            list_installed_horizon_binaries,
            check_horizon_update,
            update_horizon_binaries,
            cleanup_horizon_cache,
            ping_server,
            // Моды (Modrinth & Horizon)
            search_modrinth_mods,
            get_modrinth_project,
            get_modrinth_versions,
            install_modrinth_mod,
            get_installed_mods,
            remove_installed_mod,
            toggle_installed_mod,
            check_mod_updates,
            install_modrinth_modpack,
            import_mrpack_file,
            export_instance_mrpack,
            pick_mrpack_file,
            pick_local_mod,
            install_local_mod,
            search_horizon_mods,
            get_horizon_mod_details,
            install_horizon_mod,
        ])
        .run(tauri::generate_context!())
        .expect("Не удалось запустить HydroLauncher");
}
