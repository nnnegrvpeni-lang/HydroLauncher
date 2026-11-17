use crate::commands::shared;
use crate::error::AppError;
use crate::services::drop_service::{self, DropItem, DropKind};
use crate::services::instance_service;
use crate::services::jobs::{JobKind, JobRetry, JobSpec, JobsRegistry};
use crate::services::launch_service::LaunchRegistry;
use crate::services::storage_service::{self, CleanupKind, StorageReport};
use crate::state::AppState;
use serde::Serialize;
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DropImportResult {
    pub kind: DropKind,
    pub instance_id: String,
    /// Имя мира, файла или папки — интерфейс показывает его в уведомлении.
    pub name: String,
}

#[tauri::command]
pub async fn get_storage_report(state: State<'_, AppState>) -> Result<StorageReport, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    storage_service::report(&paths, &data_dir).await
}

/// Очистка кэша и логов. Пока игра запущена, файлы могут быть заняты, поэтому
/// операция отклоняется целиком.
#[tauri::command]
pub async fn cleanup_storage(
    state: State<'_, AppState>,
    registry: State<'_, LaunchRegistry>,
    kind: String,
) -> Result<u64, AppError> {
    if registry.has_active().await {
        return Err(AppError::Validation(
            "Остановите игру перед очисткой хранилища".into(),
        ));
    }
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let kind = CleanupKind::parse(&kind)?;
    storage_service::cleanup(&paths, &data_dir, kind).await
}

/// Определяет тип перетащенных объектов по содержимому, а не по расширению.
#[tauri::command]
pub fn inspect_drop_paths(paths: Vec<String>) -> Vec<DropItem> {
    let paths: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    drop_service::inspect(&paths)
}

/// Импорт папки сборки: экспорт HydroLauncher или Prism/MultiMC.
#[tauri::command]
pub async fn import_drop_instance(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    jobs: State<'_, JobsRegistry>,
    path: String,
) -> Result<crate::models::instance::Instance, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let source = PathBuf::from(&path);
    let title = source
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| format!("Импорт {name}"))
        .unwrap_or_else(|| "Импорт сборки".to_string());

    let queue = jobs.inner().clone();
    let spec = JobSpec::new(JobKind::Modpack, title).retry(JobRetry::new(
        "import_drop_instance",
        serde_json::json!({ "path": path }),
    ));

    queue
        .run(&app, &data_dir, spec, || async {
            drop_service::import_folder(&paths, &data_dir, &source).await
        })
        .await
}

/// Импорт мира, ресурспака или мода в существующую сборку.
#[tauri::command]
pub async fn import_drop_content(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    jobs: State<'_, JobsRegistry>,
    registry: State<'_, LaunchRegistry>,
    instance_id: String,
    path: String,
) -> Result<DropImportResult, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let instances = instance_service::load_instances(&paths, &data_dir).await?;
    let instance = instances
        .into_iter()
        .find(|item| item.id == instance_id)
        .ok_or_else(|| AppError::NotFound("Сборка не найдена".into()))?;

    let source = PathBuf::from(&path);
    let kind = drop_service::classify(&source).kind;
    let label = match kind {
        DropKind::World => "мира",
        DropKind::Resourcepack => "ресурспака",
        DropKind::Mod => "мода",
        _ => {
            return Err(AppError::Validation(
                "Этот объект не импортируется внутрь сборки".into(),
            ))
        }
    };

    let queue = jobs.inner().clone();
    let spec = JobSpec::new(
        JobKind::Import,
        format!("Импорт {label} в «{}»", instance.name),
    )
    .instance(instance.id.clone())
    .retry(JobRetry::new(
        "import_drop_content",
        serde_json::json!({
            "instanceId": instance.id.clone(),
            "path": path.clone(),
        }),
    ));

    queue
        .run(&app, &data_dir, spec, || async {
            shared::with_instance_reserved(&registry, &instance.id, async {
                let name = match kind {
                    DropKind::World => {
                        drop_service::import_world(
                            &paths,
                            &data_dir,
                            &instance.id,
                            &source,
                            None,
                        )
                        .await?
                    }
                    DropKind::Resourcepack => {
                        drop_service::import_resourcepack(
                            &paths,
                            &data_dir,
                            &instance.id,
                            &source,
                        )
                        .await?
                    }
                    DropKind::Mod => {
                        drop_service::import_mod(&paths, &data_dir, &instance, &source).await?
                    }
                    _ => unreachable!("тип проверен выше"),
                };
                Ok(DropImportResult {
                    kind,
                    instance_id: instance.id.clone(),
                    name,
                })
            })
            .await
        })
        .await
}
