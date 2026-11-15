use crate::error::{AppError, AppResult};
use crate::services::launch_service::LaunchRegistry;
use crate::state::AppState;
use crate::storage::paths::AppPaths;
use std::path::PathBuf;
use tauri::State;

/// Не даёт менять файлы сборки, пока игра пишет в них.
pub async fn ensure_instance_idle(registry: &LaunchRegistry, instance_id: &str) -> AppResult<()> {
    if registry.contains(instance_id).await {
        return Err(AppError::Validation(
            "Остановите игру перед этим действием".into(),
        ));
    }
    Ok(())
}

pub async fn resolve_data_dir(
    state: &State<'_, AppState>,
) -> AppResult<(AppPaths, PathBuf)> {
    let paths = AppPaths::discover()?;
    let data_dir = data_dir(&paths, state).await?;
    Ok((paths, data_dir))
}

/// Вычисляет актуальную папку данных: пользовательская настройка
/// или системная директория приложения по умолчанию.
pub async fn data_dir(paths: &AppPaths, state: &State<'_, AppState>) -> AppResult<PathBuf> {
    let settings_guard = state.settings.lock().await;
    let data = match &*settings_guard {
        Some(s) => PathBuf::from(&s.data_dir),
        None => paths.default_data_dir().to_path_buf(),
    };
    tokio::fs::create_dir_all(&data).await?;
    Ok(data)
}
