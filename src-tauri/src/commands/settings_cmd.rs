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
    state.apply_window_prefs(&settings);
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
    state.apply_window_prefs(&saved);
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

#[tauri::command]
pub async fn check_launcher_update(
) -> Result<crate::services::launcher_update_service::LauncherUpdateInfo, AppError> {
    crate::services::launcher_update_service::check_launcher_update().await
}

/// Ссылки на веб-страницы, которые открываются из интерфейса.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppLinks {
    pub modrinth_project: String,
    pub horizon_mod: String,
    pub repo: String,
}

#[tauri::command]
pub fn get_app_links() -> AppLinks {
    use crate::config::endpoints::{HORIZON_WEB_MOD_URL, HYDRO_REPO_URL, MODRINTH_WEB_PROJECT_URL};
    AppLinks {
        modrinth_project: MODRINTH_WEB_PROJECT_URL.to_string(),
        horizon_mod: HORIZON_WEB_MOD_URL.to_string(),
        repo: HYDRO_REPO_URL.to_string(),
    }
}

/// Выход из лаунчера: по желанию сначала останавливает запущенные игры.
#[tauri::command]
pub async fn quit_app(
    app: tauri::AppHandle,
    registry: State<'_, crate::services::launch_service::LaunchRegistry>,
    stop_games: bool,
) -> Result<(), AppError> {
    if stop_games {
        registry.stop_all().await;
        // Даём watcher-задачам убить процессы и записать сессию.
        tokio::time::sleep(std::time::Duration::from_millis(400)).await;
    }
    app.exit(0);
    Ok(())
}

/// Открывает внешнюю ссылку в системном браузере. Разрешены только https-URL.
#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), AppError> {
    let target = url.trim();
    if !target.starts_with("https://") || target.len() > 2048 {
        return Err(AppError::Validation("Разрешены только https-ссылки".into()));
    }

    #[cfg(target_os = "windows")]
    std::process::Command::new("rundll32")
        .arg("url.dll,FileProtocolHandler")
        .arg(target)
        .spawn()
        .map_err(|e| AppError::Process(format!("Не удалось открыть ссылку: {e}")))?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(target)
        .spawn()
        .map_err(|e| AppError::Process(format!("Не удалось открыть ссылку: {e}")))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(target)
        .spawn()
        .map_err(|e| AppError::Process(format!("Не удалось открыть ссылку: {e}")))?;

    Ok(())
}
