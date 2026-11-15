use crate::models::mojang::{VersionDetails, VersionManifest};
use crate::services::java_service::JavaService;
use crate::services::launch_service;
use crate::services::mojang_service::{is_version_installed, MojangService};
use crate::services::settings_service;
use crate::state::AppState;
use crate::{commands::shared, AppError};
use crate::storage::paths::AppPaths;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionCatalog {
    pub manifest: VersionManifest,
}

#[tauri::command]
pub async fn get_version_catalog(
    state: State<'_, AppState>,
) -> Result<VersionCatalog, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let service = MojangService::new();
    let manifest = service.fetch_manifest(&paths, &data_dir).await?;
    Ok(VersionCatalog { manifest })
}

#[tauri::command]
pub async fn get_version_details(version_url: String) -> Result<VersionDetails, AppError> {
    // URL версии приходит только из манифеста Mojang, полученного лаунчером.
    if !version_url.starts_with(crate::config::endpoints::MOJANG_PISTON_PREFIX) {
        return Err(AppError::Validation(
            "Ссылка на версию должна указывать на манифест Mojang".into(),
        ));
    }
    let service = MojangService::new();
    Ok(service.fetch_version_details(&version_url).await?)
}

#[tauri::command]
pub async fn prepare_instance(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<(), AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let instances = crate::services::instance_service::load_instances(&paths, &data_dir).await?;
    let instance = instances
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or_else(|| AppError::NotFound("Сборка не найдена".into()))?;

    launch_service::prepare_instance(app, instance).await
}

#[tauri::command]
pub async fn launch_instance(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    instance_id: String,
    quick_play: Option<launch_service::QuickPlayTarget>,
) -> Result<(), AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let instances = crate::services::instance_service::load_instances(&paths, &data_dir).await?;
    let instance = instances
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or_else(|| AppError::NotFound("Сборка не найдена".into()))?;

    launch_service::launch(app, instance, quick_play).await
}

#[tauri::command]
pub async fn terminate_instance(
    app: tauri::AppHandle,
    instance_id: String,
) -> Result<bool, AppError> {
    launch_service::terminate(app, instance_id).await
}

#[tauri::command]
pub async fn get_running_instances(app: tauri::AppHandle) -> Result<Vec<String>, AppError> {
    Ok(launch_service::running_ids(app).await)
}

#[tauri::command]
pub async fn get_install_status(
    state: State<'_, AppState>,
    version_id: String,
) -> Result<bool, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    Ok(is_version_installed(&paths, &data_dir, &version_id).await)
}

#[tauri::command]
pub async fn ensure_java_runtime(
    major_version: u32,
) -> Result<crate::models::java::JavaRuntime, AppError> {
    let paths = AppPaths::discover()?;
    let settings = settings_service::load_or_init_settings(&paths).await?;
    let service = JavaService::new();
    service
        .ensure_runtime(
            &paths,
            std::path::Path::new(&settings.data_dir),
            major_version,
        )
        .await
}

#[tauri::command]
pub async fn get_loader_versions(
    loader: crate::models::instance::ModLoaderKind,
    minecraft_version: String,
) -> Result<Vec<String>, AppError> {
    crate::services::loader_service::list_loader_versions(loader, &minecraft_version).await
}

#[tauri::command]
pub async fn get_loader_supported_mc_versions(
    loader: crate::models::instance::ModLoaderKind,
) -> Result<Vec<String>, AppError> {
    crate::services::loader_service::list_supported_mc_versions(loader).await
}

#[tauri::command]
pub async fn list_horizon_releases() -> Result<Vec<crate::services::horizon_service::HorizonReleaseSummary>, AppError> {
    crate::services::horizon_service::list_horizon_releases().await
}

#[tauri::command]
pub async fn list_installed_horizon_binaries(
    state: State<'_, AppState>,
) -> Result<Vec<crate::services::horizon_service::InstalledHorizonBinary>, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    crate::services::horizon_service::list_installed_horizon_binaries(&paths, &data_dir).await
}

#[tauri::command]
pub async fn check_horizon_update(
    state: State<'_, AppState>,
    tag: Option<String>,
) -> Result<crate::services::horizon_service::HorizonUpdateInfo, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    crate::services::horizon_service::check_horizon_update(&paths, &data_dir, tag.as_deref()).await
}

#[tauri::command]
pub async fn update_horizon_binaries(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    instance_id: Option<String>,
    tag: Option<String>,
) -> Result<crate::services::horizon_service::HorizonUpdateInfo, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    crate::services::horizon_service::update_horizon_binaries(
        &app,
        &paths,
        &data_dir,
        instance_id.as_deref().unwrap_or("horizon-update"),
        tag.as_deref(),
    )
    .await
}
