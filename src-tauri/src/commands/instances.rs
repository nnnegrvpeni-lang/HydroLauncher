use crate::models::instance::{Instance, InstancesStore};
use crate::services::instance_service;
use crate::state::AppState;
use crate::storage::json_store;
use crate::{commands::shared, models::instance::CreateInstanceRequest, AppError};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn get_instances(state: State<'_, AppState>) -> Result<Vec<Instance>, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    instance_service::load_instances(&paths, &data_dir).await
}

#[tauri::command]
pub async fn create_instance(
    state: State<'_, AppState>,
    request: CreateInstanceRequest,
) -> Result<Instance, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    instance_service::create_instance(&paths, &data_dir, request).await
}

#[tauri::command]
pub async fn update_instance(
    state: State<'_, AppState>,
    request: crate::models::instance::UpdateInstanceRequest,
) -> Result<Instance, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    instance_service::update_instance(&paths, &data_dir, request).await
}

#[tauri::command]
pub async fn delete_instance(
    state: State<'_, AppState>,
    registry: State<'_, crate::services::launch_service::LaunchRegistry>,
    instance_id: String,
) -> Result<(), AppError> {
    shared::ensure_instance_idle(&registry, &instance_id).await?;
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    instance_service::delete_instance(&paths, &data_dir, &instance_id).await
}

#[tauri::command]
pub async fn duplicate_instance(
    state: State<'_, AppState>,
    registry: State<'_, crate::services::launch_service::LaunchRegistry>,
    instance_id: String,
) -> Result<Instance, AppError> {
    shared::ensure_instance_idle(&registry, &instance_id).await?;
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    instance_service::duplicate_instance(&paths, &data_dir, &instance_id).await
}

#[tauri::command]
pub async fn instance_store(state: State<'_, AppState>) -> Result<InstancesStore, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    crate::storage::json_store::read_json_or_default(&paths.instances_file(&data_dir)).await
}

#[tauri::command]
pub async fn open_instance_folder(
    state: State<'_, AppState>,
    instance_id: String,
    subfolder: Option<String>,
) -> Result<(), AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let target = match subfolder.as_deref() {
        Some("mods") => paths.instance_mods_dir(&data_dir, &instance_id),
        _ => paths.instance_game_dir(&data_dir, &instance_id),
    };
    tokio::fs::create_dir_all(&target).await?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&target)
        .spawn()
        .map_err(|e| AppError::Process(format!("Не удалось открыть папку: {e}")))?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&target)
        .spawn()
        .map_err(|e| AppError::Process(format!("Не удалось открыть папку: {e}")))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&target)
        .spawn()
        .map_err(|e| AppError::Process(format!("Не удалось открыть папку: {e}")))?;

    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickPlayWorld {
    pub folder_name: String,
    pub modified_ms: u64,
    pub icon_data_url: Option<String>,
}

fn encode_base64(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = *chunk.get(1).unwrap_or(&0) as usize;
        let b2 = *chunk.get(2).unwrap_or(&0) as usize;
        out.push(TABLE[b0 >> 2] as char);
        out.push(TABLE[((b0 & 0x03) << 4) | (b1 >> 4)] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((b1 & 0x0f) << 2) | (b2 >> 6)] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[b2 & 0x3f] as char
        } else {
            '='
        });
    }
    out
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickPlayServer {
    pub id: String,
    pub name: String,
    pub address: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceQuickPlay {
    pub worlds: Vec<QuickPlayWorld>,
    pub servers: Vec<QuickPlayServer>,
}

#[tauri::command]
pub async fn get_instance_quick_play(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<InstanceQuickPlay, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let saves_dir = paths.instance_game_dir(&data_dir, &instance_id).join("saves");

    let mut worlds: Vec<QuickPlayWorld> = Vec::new();
    if saves_dir.exists() {
        if let Ok(mut entries) = tokio::fs::read_dir(&saves_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let path = entry.path();
                if !path.is_dir() || !path.join("level.dat").exists() {
                    continue;
                }
                let folder_name = entry.file_name().to_string_lossy().to_string();
                let modified_ms = entry
                    .metadata()
                    .await
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                let icon_path = path.join("icon.png");
                let icon_data_url = if icon_path.is_file() {
                    tokio::fs::read(&icon_path)
                        .await
                        .ok()
                        .filter(|bytes| !bytes.is_empty() && bytes.len() <= 512 * 1024)
                        .map(|bytes| format!("data:image/png;base64,{}", encode_base64(&bytes)))
                } else {
                    None
                };
                worlds.push(QuickPlayWorld {
                    folder_name,
                    modified_ms,
                    icon_data_url,
                });
            }
        }
    }
    worlds.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    worlds.truncate(5);

    let servers_path = paths
        .instance_dir(&data_dir, &instance_id)
        .join("quick-servers.json");
    let servers: Vec<QuickPlayServer> = json_store::read_json_or_default(&servers_path)
        .await
        .unwrap_or_default();

    Ok(InstanceQuickPlay { worlds, servers })
}

#[tauri::command]
pub async fn add_quick_server(
    state: State<'_, AppState>,
    instance_id: String,
    name: String,
    address: String,
) -> Result<Vec<QuickPlayServer>, AppError> {
    let clean_address = address.trim().to_string();
    if clean_address.is_empty() {
        return Err(AppError::Validation("Введите адрес сервера".into()));
    }
    let clean_name = if name.trim().is_empty() {
        clean_address.clone()
    } else {
        name.trim().to_string()
    };

    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let servers_path = paths
        .instance_dir(&data_dir, &instance_id)
        .join("quick-servers.json");
    let mut servers: Vec<QuickPlayServer> = json_store::read_json_or_default(&servers_path)
        .await
        .unwrap_or_default();

    servers.insert(
        0,
        QuickPlayServer {
            id: Uuid::new_v4().to_string(),
            name: clean_name,
            address: clean_address,
        },
    );
    json_store::write_json_atomic(&servers_path, &servers).await?;
    Ok(servers)
}

#[tauri::command]
pub async fn remove_quick_server(
    state: State<'_, AppState>,
    instance_id: String,
    server_id: String,
) -> Result<Vec<QuickPlayServer>, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let servers_path = paths
        .instance_dir(&data_dir, &instance_id)
        .join("quick-servers.json");
    let mut servers: Vec<QuickPlayServer> = json_store::read_json_or_default(&servers_path)
        .await
        .unwrap_or_default();
    servers.retain(|s| s.id != server_id);
    json_store::write_json_atomic(&servers_path, &servers).await?;
    Ok(servers)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceScreenshot {
    pub file_name: String,
    pub modified_ms: u64,
    pub size_bytes: u64,
    pub data_url: Option<String>,
}

#[tauri::command]
pub async fn get_instance_screenshots(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<Vec<InstanceScreenshot>, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let dir = paths
        .instance_game_dir(&data_dir, &instance_id)
        .join("screenshots");
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut list = Vec::new();
    let mut entries = tokio::fs::read_dir(&dir).await?;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        let lower = file_name.to_lowercase();
        let mime = if lower.ends_with(".png") {
            "image/png"
        } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
            "image/jpeg"
        } else if lower.ends_with(".webp") {
            "image/webp"
        } else {
            continue;
        };

        let meta = entry.metadata().await.ok();
        let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_ms = meta
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let data_url = if size_bytes > 0 && size_bytes <= 10 * 1024 * 1024 {
            tokio::fs::read(&path)
                .await
                .ok()
                .map(|bytes| format!("data:{mime};base64,{}", encode_base64(&bytes)))
        } else {
            None
        };

        list.push(InstanceScreenshot {
            file_name,
            modified_ms,
            size_bytes,
            data_url,
        });
    }

    list.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(list)
}

#[tauri::command]
pub async fn delete_instance_screenshot(
    state: State<'_, AppState>,
    instance_id: String,
    file_name: String,
) -> Result<(), AppError> {
    if file_name.is_empty()
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains("..")
    {
        return Err(AppError::Validation("Некорректное имя файла".into()));
    }
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let target = paths
        .instance_game_dir(&data_dir, &instance_id)
        .join("screenshots")
        .join(&file_name);
    if target.exists() {
        tokio::fs::remove_file(target).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn open_screenshot_file(
    state: State<'_, AppState>,
    instance_id: String,
    file_name: String,
) -> Result<(), AppError> {
    if file_name.is_empty()
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains("..")
    {
        return Err(AppError::Validation("Некорректное имя файла".into()));
    }
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let target = paths
        .instance_game_dir(&data_dir, &instance_id)
        .join("screenshots")
        .join(&file_name);
    if !target.exists() {
        return Err(AppError::NotFound("Скриншот не найден".into()));
    }

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&target)
        .spawn()
        .map_err(|e| AppError::Process(format!("Не удалось открыть файл: {e}")))?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&target)
        .spawn()
        .map_err(|e| AppError::Process(format!("Не удалось открыть файл: {e}")))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&target)
        .spawn()
        .map_err(|e| AppError::Process(format!("Не удалось открыть файл: {e}")))?;

    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceWorld {
    pub folder_name: String,
    pub modified_ms: u64,
    pub size_bytes: u64,
    pub icon_data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldBackup {
    pub file_name: String,
    pub path: String,
    pub size_bytes: u64,
}

/// Проверяет имя папки мира: без разделителей, переходов вверх и пустых имён.
fn world_dir(saves_dir: &Path, folder_name: &str) -> Result<PathBuf, AppError> {
    let name = folder_name.trim();
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains(['/', '\\'])
        || name.contains('\0')
    {
        return Err(AppError::Validation("Некорректное имя мира".into()));
    }
    Ok(saves_dir.join(name))
}

/// Суммарный размер папки без перехода по символическим ссылкам.
async fn directory_size(path: &Path) -> u64 {
    let mut total = 0u64;
    let mut stack = vec![path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(mut entries) = tokio::fs::read_dir(&dir).await else {
            continue;
        };
        while let Ok(Some(entry)) = entries.next_entry().await {
            let Ok(file_type) = entry.file_type().await else {
                continue;
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                stack.push(entry.path());
            } else if let Ok(meta) = entry.metadata().await {
                total = total.saturating_add(meta.len());
            }
        }
    }
    total
}

async fn world_icon_data_url(world_path: &Path) -> Option<String> {
    let icon_path = world_path.join("icon.png");
    if !icon_path.is_file() {
        return None;
    }
    tokio::fs::read(&icon_path)
        .await
        .ok()
        .filter(|bytes| !bytes.is_empty() && bytes.len() <= 512 * 1024)
        .map(|bytes| format!("data:image/png;base64,{}", encode_base64(&bytes)))
}

#[tauri::command]
pub async fn list_instance_worlds(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<Vec<InstanceWorld>, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let saves_dir = paths.instance_game_dir(&data_dir, &instance_id).join("saves");
    if !saves_dir.exists() {
        return Ok(Vec::new());
    }

    let mut worlds = Vec::new();
    let mut entries = tokio::fs::read_dir(&saves_dir).await?;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if !path.is_dir() || !path.join("level.dat").is_file() {
            continue;
        }
        let folder_name = entry.file_name().to_string_lossy().to_string();
        let modified_ms = entry
            .metadata()
            .await
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        worlds.push(InstanceWorld {
            icon_data_url: world_icon_data_url(&path).await,
            folder_name,
            modified_ms,
            size_bytes: directory_size(&path).await,
        });
    }

    worlds.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(worlds)
}

/// Создаёт zip-архив мира в `<сборка>/backups`.
#[tauri::command]
pub async fn backup_instance_world(
    state: State<'_, AppState>,
    registry: State<'_, crate::services::launch_service::LaunchRegistry>,
    instance_id: String,
    folder_name: String,
) -> Result<WorldBackup, AppError> {
    shared::ensure_instance_idle(&registry, &instance_id).await?;
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let saves_dir = paths.instance_game_dir(&data_dir, &instance_id).join("saves");
    let source = world_dir(&saves_dir, &folder_name)?;
    if !source.is_dir() || !source.join("level.dat").is_file() {
        return Err(AppError::NotFound("Мир не найден".into()));
    }

    let backups_dir = paths.instance_dir(&data_dir, &instance_id).join("backups");
    tokio::fs::create_dir_all(&backups_dir).await?;

    let clean_name: String = folder_name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, '-' | '_' | ' ') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let file_name = format!("{}-{}.zip", clean_name.trim(), stamp);
    let target = backups_dir.join(&file_name);

    let source_clone = source.clone();
    let target_clone = target.clone();
    tokio::task::spawn_blocking(move || zip_directory(&source_clone, &target_clone))
        .await
        .map_err(|e| AppError::Process(format!("Не удалось создать резервную копию: {e}")))??;

    let size_bytes = tokio::fs::metadata(&target).await?.len();
    Ok(WorldBackup {
        file_name,
        path: target.to_string_lossy().into_owned(),
        size_bytes,
    })
}

fn zip_directory(source: &Path, target: &Path) -> Result<(), AppError> {
    use zip::write::SimpleFileOptions;

    let file = std::fs::File::create(target)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let base = source.to_path_buf();
    let mut stack = vec![base.clone()];
    while let Some(dir) = stack.pop() {
        for entry in std::fs::read_dir(&dir)?.flatten() {
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                stack.push(path);
                continue;
            }
            let relative = path.strip_prefix(&base).unwrap_or(&path);
            let archive_name = relative.to_string_lossy().replace('\\', "/");
            zip.start_file(archive_name, options)?;
            let mut input = std::fs::File::open(&path)?;
            std::io::copy(&mut input, &mut zip)?;
        }
    }

    zip.finish()?;
    Ok(())
}

#[tauri::command]
pub async fn delete_instance_world(
    state: State<'_, AppState>,
    registry: State<'_, crate::services::launch_service::LaunchRegistry>,
    instance_id: String,
    folder_name: String,
) -> Result<(), AppError> {
    shared::ensure_instance_idle(&registry, &instance_id).await?;
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let saves_dir = paths.instance_game_dir(&data_dir, &instance_id).join("saves");
    let target = world_dir(&saves_dir, &folder_name)?;
    if !target.is_dir() {
        return Err(AppError::NotFound("Мир не найден".into()));
    }
    tokio::fs::remove_dir_all(&target).await?;
    Ok(())
}
