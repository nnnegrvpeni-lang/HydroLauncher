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
            "Дождитесь завершения запуска или остановите игру".into(),
        ));
    }
    Ok(())
}

/// Занимает слот сборки на время разрушительной операции. Проверка «сборка
/// свободна» и сама операция выполняются без окна, в которое мог бы вклиниться
/// запуск: иначе игра стартовала бы с файлами, которые сейчас перезаписываются.
pub async fn with_instance_reserved<T, F>(
    registry: &LaunchRegistry,
    instance_id: &str,
    action: F,
) -> AppResult<T>
where
    F: std::future::Future<Output = AppResult<T>>,
{
    if !registry.try_reserve_quiet(instance_id).await {
        return Err(AppError::Validation(
            "Дождитесь завершения запуска или остановите игру".into(),
        ));
    }
    let result = action.await;
    registry.release(instance_id).await;
    result
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
