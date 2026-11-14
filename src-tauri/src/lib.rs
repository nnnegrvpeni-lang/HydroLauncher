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
        create_account, delete_account, get_accounts, get_active_account, rename_account,
        set_active_account,
    },
    instances::{
        add_quick_server, create_instance, delete_instance, delete_instance_screenshot,
        get_instance_quick_play, get_instance_screenshots, get_instances, instance_store,
        open_instance_folder, open_screenshot_file, remove_quick_server, update_instance,
    },
    java_cmd::{download_java_runtime, get_java_runtimes},
    mods::{
        check_mod_updates, get_horizon_mod_details, get_installed_mods, get_modrinth_project,
        get_modrinth_versions, import_mrpack_file, install_horizon_mod, install_modrinth_mod,
        install_modrinth_modpack, pick_mrpack_file, remove_installed_mod, search_horizon_mods,
        search_modrinth_mods, toggle_installed_mod,
    },
    settings_cmd::{
        get_settings, get_system_info, pick_directory, save_settings_cmd, validate_data_dir,
    },
    versions::{
        check_horizon_update, ensure_java_runtime, get_install_status, get_loader_versions,
        get_running_instances, get_version_catalog, get_version_details, launch_instance,
        prepare_instance, terminate_instance, update_horizon_binaries,
    },
};
use state::AppState;

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::new())
        .manage(services::launch_service::LaunchRegistry::new())
        .invoke_handler(tauri::generate_handler![
            // Аккаунты
            get_accounts,
            create_account,
            set_active_account,
            rename_account,
            delete_account,
            get_active_account,
            // Сборки
            get_instances,
            create_instance,
            update_instance,
            delete_instance,
            instance_store,
            open_instance_folder,
            get_instance_quick_play,
            add_quick_server,
            remove_quick_server,
            get_instance_screenshots,
            delete_instance_screenshot,
            open_screenshot_file,
            // Настройки
            get_settings,
            save_settings_cmd,
            get_system_info,
            pick_directory,
            validate_data_dir,
            // Java
            get_java_runtimes,
            download_java_runtime,
            ensure_java_runtime,
            // Версии и запуск
            get_version_catalog,
            get_version_details,
            get_install_status,
            prepare_instance,
            launch_instance,
            terminate_instance,
            get_running_instances,
            get_loader_versions,
            check_horizon_update,
            update_horizon_binaries,
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
            pick_mrpack_file,
            search_horizon_mods,
            get_horizon_mod_details,
            install_horizon_mod,
        ])
        .run(tauri::generate_context!())
        .expect("Не удалось запустить HydroLauncher");
}
