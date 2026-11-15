use crate::config::endpoints::{
    DEFAULT_CONCURRENT_DOWNLOADS, MIN_MEMORY_MB, RECOMMENDED_MAX_MEMORY_MB, RECOMMENDED_MIN_MEMORY_MB,
};
use crate::error::{AppError, AppResult};
use crate::models::settings::{AppSettings, SystemInfo, ThemeMode};
use crate::storage::json_store::write_json_atomic;
use crate::storage::paths::AppPaths;
use std::path::PathBuf;
use sysinfo::System;

pub fn collect_system_info(paths: &AppPaths) -> SystemInfo {
    let mut sys = System::new_all();
    sys.refresh_memory();

    let total_memory_mb = sys.total_memory() / (1024 * 1024);
    let available_memory_mb = sys.available_memory() / (1024 * 1024);
    let cpu_cores = sys.cpus().len().max(1);
    let os_name = System::long_os_version().unwrap_or_else(|| std::env::consts::OS.to_string());
    let arch = std::env::consts::ARCH.to_string();

    SystemInfo {
        total_memory_mb,
        available_memory_mb,
        cpu_cores,
        os_name,
        arch,
        default_data_dir: paths.default_data_dir().to_string_lossy().into_owned(),
    }
}

pub fn compute_recommended_memory_mb(total_memory_mb: u64) -> u64 {
    let quarter = (total_memory_mb / 4 / 256) * 256;
    quarter.clamp(RECOMMENDED_MIN_MEMORY_MB, RECOMMENDED_MAX_MEMORY_MB)
}

pub async fn load_or_init_settings(paths: &AppPaths) -> AppResult<AppSettings> {
    let config_file = paths.config_file();
    if tokio::fs::try_exists(&config_file).await? {
        let bytes = tokio::fs::read(&config_file).await?;
        if !bytes.is_empty() {
            let settings: AppSettings = serde_json::from_slice(&bytes)?;
            return Ok(settings);
        }
    }

    let sys_info = collect_system_info(paths);
    let defaults = AppSettings {
        theme: ThemeMode::Dark,
        data_dir: sys_info.default_data_dir,
        default_memory_mb: compute_recommended_memory_mb(sys_info.total_memory_mb),
        max_concurrent_downloads: DEFAULT_CONCURRENT_DOWNLOADS,
        close_on_launch: false,
        close_to_tray: false,
        language: crate::models::settings::Language::Ru,
        auto_backup_worlds: false,
        backup_retention: 5,
        show_snapshots: false,
        custom_java_paths: Vec::new(),
    };

    write_json_atomic(&config_file, &defaults).await?;
    Ok(defaults)
}

pub async fn save_settings(paths: &AppPaths, mut settings: AppSettings) -> AppResult<AppSettings> {
    let sys_info = collect_system_info(paths);

    if settings.data_dir.trim().is_empty() {
        return Err(AppError::Validation(
            "Путь к папке данных не может быть пустым".into(),
        ));
    }

    let data_path = PathBuf::from(&settings.data_dir);
    tokio::fs::create_dir_all(&data_path).await?;

    let max_allowed = sys_info.total_memory_mb.max(MIN_MEMORY_MB);
    settings.default_memory_mb = settings.default_memory_mb.clamp(MIN_MEMORY_MB, max_allowed);
    settings.max_concurrent_downloads = settings.max_concurrent_downloads.clamp(1, 32);
    settings.backup_retention = settings.backup_retention.clamp(1, 50);

    write_json_atomic(&paths.config_file(), &settings).await?;
    Ok(settings)
}
