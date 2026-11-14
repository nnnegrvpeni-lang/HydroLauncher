use crate::error::AppError;
use crate::models::java::JavaRuntime;
use crate::services::java_service::JavaService;
use crate::services::settings_service;
use crate::state::AppState;
use crate::{commands::shared, storage::paths::AppPaths};
use tauri::State;

#[tauri::command]
pub async fn get_java_runtimes(state: State<'_, AppState>) -> Result<Vec<JavaRuntime>, AppError> {
    let paths = AppPaths::discover()?;
    let settings = settings_service::load_or_init_settings(&paths).await?;
    let service = JavaService::new();

    let mut all = service
        .detect_system_runtimes(&settings.custom_java_paths)
        .await?;

    if let Ok(data_dir) = shared::data_dir(&paths, &state).await {
        if let Ok(managed) = service.list_managed_runtimes(&paths, &data_dir).await {
            for runtime in managed {
                if !all.iter().any(|r| r.path == runtime.path) {
                    all.push(runtime);
                }
            }
        }
    }

    Ok(all)
}

#[tauri::command]
pub async fn download_java_runtime(major_version: u32) -> Result<JavaRuntime, AppError> {
    let paths = AppPaths::discover()?;
    let settings = settings_service::load_or_init_settings(&paths).await?;
    let service = JavaService::new();

    service
        .download_runtime(
            &paths,
            std::path::Path::new(&settings.data_dir),
            major_version,
        )
        .await
}
