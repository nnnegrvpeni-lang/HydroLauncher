use crate::error::AppError;
use crate::models::settings::{AppSettings, SystemInfo};
use crate::services::settings_service;
use crate::state::AppState;
use crate::storage::paths::AppPaths;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, AppError> {
    let paths = AppPaths::discover()?;
    let settings = settings_service::load_or_init_settings(&paths).await?;
    {
        let mut current = state.settings.lock().await;
        *current = Some(settings.clone());
    }
    Ok(settings)
}

#[tauri::command]
pub async fn save_settings_cmd(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<AppSettings, AppError> {
    let paths = AppPaths::discover()?;
    let saved = settings_service::save_settings(&paths, settings).await?;
    {
        let mut current = state.settings.lock().await;
        *current = Some(saved.clone());
    }
    Ok(saved)
}

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, AppError> {
    let paths = AppPaths::discover()?;
    let mut info = settings_service::collect_system_info(&paths);
    if let Ok(settings) = settings_service::load_or_init_settings(&paths).await {
        info.default_data_dir = settings.data_dir;
    }
    Ok(info)
}

#[tauri::command]
pub async fn pick_directory() -> Result<Option<String>, AppError> {
    let file = rfd::FileDialog::new()
        .set_title("Выберите папку для данных лаунчера")
        .pick_folder();
    Ok(file.map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn validate_data_dir(path: String) -> Result<String, AppError> {
    let p = PathBuf::from(&path);
    if p.as_os_str().is_empty() {
        return Err(AppError::Validation(
            "Путь не может быть пустым".into(),
        ));
    }
    tokio::fs::create_dir_all(&p).await?;
    let test_file = p.join(".hydro-write-test");
    tokio::fs::write(&test_file, b"ok").await?;
    tokio::fs::remove_file(&test_file).await?;
    Ok(p.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn open_data_dir(state: State<'_, AppState>) -> Result<(), AppError> {
    let (_, data_dir) = crate::commands::shared::resolve_data_dir(&state).await?;
    tokio::fs::create_dir_all(&data_dir).await?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&data_dir)
        .spawn()
        .map_err(|e| AppError::Process(format!("Не удалось открыть папку: {e}")))?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&data_dir)
        .spawn()
        .map_err(|e| AppError::Process(format!("Не удалось открыть папку: {e}")))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&data_dir)
        .spawn()
        .map_err(|e| AppError::Process(format!("Не удалось открыть папку: {e}")))?;

    Ok(())
}
