use crate::commands::shared;
use crate::models::instance::{EngineKind, Instance, ModLoaderKind};
use crate::services::horizon_mods_service::{
    self, HorizonModDetailsDto, HorizonModsSearchResult, SearchHorizonModsRequest,
};
use crate::services::instance_service;
use crate::services::modrinth_service::{
    self, InstalledModFile, ModUpdateInfo, ModrinthProjectDetails, ModrinthSearchResult,
    ModrinthVersionInfo,
};
use crate::state::AppState;
use crate::AppError;
use serde::Deserialize;
use tauri::State;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchModrinthRequest {
    pub query: String,
    pub project_type: Option<String>,
    pub category: Option<String>,
    pub loader: Option<ModLoaderKind>,
    pub game_version: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[tauri::command]
pub async fn search_modrinth_mods(
    request: SearchModrinthRequest,
) -> Result<ModrinthSearchResult, AppError> {
    modrinth_service::search_mods(
        &request.query,
        request.project_type.as_deref(),
        request.category.as_deref(),
        request.loader,
        request.game_version.as_deref(),
        request.limit.unwrap_or(24),
        request.offset.unwrap_or(0),
    )
    .await
}

#[tauri::command]
pub async fn get_modrinth_project(project_id: String) -> Result<ModrinthProjectDetails, AppError> {
    modrinth_service::get_project(&project_id).await
}

#[tauri::command]
pub async fn get_modrinth_versions(
    project_id: String,
    loader: Option<ModLoaderKind>,
    game_version: Option<String>,
) -> Result<Vec<ModrinthVersionInfo>, AppError> {
    modrinth_service::get_project_versions(&project_id, loader, game_version.as_deref()).await
}

#[tauri::command]
pub async fn install_modrinth_mod(
    state: State<'_, AppState>,
    registry: State<'_, crate::services::launch_service::LaunchRegistry>,
    instance_id: String,
    project_id: String,
    version_id: Option<String>,
) -> Result<InstalledModFile, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    shared::with_instance_reserved(&registry, &instance_id, async {
        let instances = instance_service::load_instances(&paths, &data_dir).await?;
        let instance = instances
            .into_iter()
            .find(|i| i.id == instance_id)
            .ok_or_else(|| AppError::NotFound("Сборка не найдена".into()))?;

        modrinth_service::install_mod(
            &paths,
            &data_dir,
            &instance,
            &project_id,
            version_id.as_deref(),
        )
        .await
    })
    .await
}

#[tauri::command]
pub async fn get_installed_mods(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<Vec<InstalledModFile>, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    modrinth_service::list_installed_mods(&paths, &data_dir, &instance_id).await
}

#[tauri::command]
pub async fn remove_installed_mod(
    state: State<'_, AppState>,
    registry: State<'_, crate::services::launch_service::LaunchRegistry>,
    instance_id: String,
    file_name: String,
) -> Result<(), AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    shared::with_instance_reserved(&registry, &instance_id, async {
        modrinth_service::remove_installed_mod(&paths, &data_dir, &instance_id, &file_name).await
    })
    .await
}

#[tauri::command]
pub async fn search_horizon_mods(
    state: State<'_, AppState>,
    request: SearchHorizonModsRequest,
) -> Result<HorizonModsSearchResult, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    horizon_mods_service::search_mods(&paths, &data_dir, request).await
}

#[tauri::command]
pub async fn get_horizon_mod_details(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<HorizonModDetailsDto, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    horizon_mods_service::get_project_details(&paths, &data_dir, &project_id).await
}

#[tauri::command]
pub async fn install_horizon_mod(
    state: State<'_, AppState>,
    registry: State<'_, crate::services::launch_service::LaunchRegistry>,
    instance_id: String,
    project_id: String,
    version: Option<String>,
) -> Result<InstalledModFile, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    shared::with_instance_reserved(&registry, &instance_id, async {
        horizon_mods_service::install_mod(
            &paths,
            &data_dir,
            &instance_id,
            &project_id,
            version.as_deref(),
        )
        .await
    })
    .await
}

#[tauri::command]
pub async fn toggle_installed_mod(
    state: State<'_, AppState>,
    registry: State<'_, crate::services::launch_service::LaunchRegistry>,
    instance_id: String,
    file_name: String,
) -> Result<String, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    shared::with_instance_reserved(&registry, &instance_id, async {
        modrinth_service::toggle_installed_mod(&paths, &data_dir, &instance_id, &file_name).await
    })
    .await
}

#[tauri::command]
pub async fn check_mod_updates(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<Vec<ModUpdateInfo>, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let instances = instance_service::load_instances(&paths, &data_dir).await?;
    let instance = instances
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or_else(|| AppError::NotFound("Сборка не найдена".into()))?;
    modrinth_service::check_mod_updates(&paths, &data_dir, &instance).await
}

#[tauri::command]
pub async fn install_modrinth_modpack(
    state: State<'_, AppState>,
    project_id: String,
    custom_name: Option<String>,
) -> Result<Instance, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    modrinth_service::install_modrinth_modpack(
        &paths,
        &data_dir,
        &project_id,
        custom_name.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn import_mrpack_file(
    state: State<'_, AppState>,
    file_path: String,
    custom_name: Option<String>,
) -> Result<Instance, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    modrinth_service::import_mrpack_file(
        &paths,
        &data_dir,
        std::path::Path::new(&file_path),
        custom_name.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn pick_mrpack_file() -> Result<Option<String>, AppError> {
    let file = rfd::FileDialog::new()
        .set_title("Выберите файл сборки (.mrpack)")
        .add_filter("Modrinth Modpack", &["mrpack", "zip"])
        .pick_file();
    Ok(file.map(|p| p.to_string_lossy().into_owned()))
}

/// Экспортирует сборку в `.mrpack` и возвращает путь к созданному файлу.
#[tauri::command]
pub async fn export_instance_mrpack(
    state: State<'_, AppState>,
    registry: State<'_, crate::services::launch_service::LaunchRegistry>,
    instance_id: String,
) -> Result<Option<modrinth_service::ExportedMrpack>, AppError> {
    // Быстрая проверка до диалога: не заставляем выбирать файл, если сборка
    // занята. Точную защиту даёт резерв слота ниже.
    shared::ensure_instance_idle(&registry, &instance_id).await?;
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let instance = instance_service::load_instances(&paths, &data_dir)
        .await?
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or_else(|| AppError::NotFound("Сборка не найдена".into()))?;

    if instance.engine == EngineKind::Horizon {
        return Err(AppError::Validation(
            "Экспорт доступен только для сборок Minecraft Java Edition".into(),
        ));
    }

    let default_name = format!("{}.mrpack", safe_export_name(&instance.name));
    let picked = rfd::FileDialog::new()
        .set_title("Экспорт сборки в .mrpack")
        .set_file_name(&default_name)
        .add_filter("Modrinth Modpack", &["mrpack"])
        .save_file();
    let Some(target) = picked else {
        return Ok(None);
    };

    let exported = shared::with_instance_reserved(&registry, &instance_id, async {
        modrinth_service::export_instance_mrpack(&paths, &data_dir, &instance, &target).await
    })
    .await?;
    Ok(Some(exported))
}

fn safe_export_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, '-' | '_' | ' ') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').to_string();
    let trimmed: String = trimmed.chars().take(64).collect();
    if trimmed.is_empty() {
        "instance".to_string()
    } else {
        trimmed
    }
}

#[tauri::command]
pub fn pick_local_mod() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("Выберите мод .jar")
        .add_filter("Minecraft mod", &["jar"])
        .pick_file()
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn install_local_mod(
    state: State<'_, AppState>,
    registry: State<'_, crate::services::launch_service::LaunchRegistry>,
    instance_id: String,
    file_path: String,
) -> Result<InstalledModFile, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    shared::with_instance_reserved(&registry, &instance_id, async {
        modrinth_service::install_local_mod(
            &paths,
            &data_dir,
            &instance_id,
            std::path::Path::new(&file_path),
        )
        .await
    })
    .await
}
