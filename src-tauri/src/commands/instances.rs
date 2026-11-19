use crate::models::instance::{Instance, InstancesStore};
use crate::services::instance_service;
use crate::state::AppState;
use crate::storage::json_store;
use crate::{commands::shared, models::instance::CreateInstanceRequest, AppError, AppResult};
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
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    shared::with_instance_reserved(&registry, &instance_id, async {
        instance_service::delete_instance(&paths, &data_dir, &instance_id).await
    })
    .await
}

#[tauri::command]
pub async fn duplicate_instance(
    state: State<'_, AppState>,
    registry: State<'_, crate::services::launch_service::LaunchRegistry>,
    instance_id: String,
) -> Result<Instance, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    shared::with_instance_reserved(&registry, &instance_id, async {
        instance_service::duplicate_instance(&paths, &data_dir, &instance_id).await
    })
    .await
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
    #[serde(default)]
    pub favorite: bool,
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
    let saves_dir = paths
        .instance_game_dir(&data_dir, &instance_id)
        .join("saves");

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
            favorite: false,
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

#[tauri::command]
pub async fn toggle_quick_server_favorite(
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
    if let Some(server) = servers.iter_mut().find(|server| server.id == server_id) {
        server.favorite = !server.favorite;
    }
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorldSizeCacheEntry {
    stamp_ms: u64,
    size_bytes: u64,
}

#[tauri::command]
pub async fn list_instance_worlds(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<Vec<InstanceWorld>, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let saves_dir = paths
        .instance_game_dir(&data_dir, &instance_id)
        .join("saves");
    if !saves_dir.exists() {
        return Ok(Vec::new());
    }

    // Размер больших миров считаем один раз и переиспользуем, пока мир не изменился.
    let cache_path = paths
        .instance_dir(&data_dir, &instance_id)
        .join("worlds-cache.json");
    let mut cache: std::collections::HashMap<String, WorldSizeCacheEntry> =
        json_store::read_json_or_default(&cache_path)
            .await
            .unwrap_or_default();
    let mut cache_changed = false;
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    let mut worlds = Vec::new();
    let mut entries = tokio::fs::read_dir(&saves_dir).await?;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if !path.is_dir() || !path.join("level.dat").is_file() {
            continue;
        }
        let folder_name = entry.file_name().to_string_lossy().to_string();
        if folder_name.contains(".before-restore-") {
            continue;
        }
        let modified_ms = entry
            .metadata()
            .await
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let stamp = crate::services::world_backup_service::world_change_stamp(&path).await;
        let size_bytes = match cache.get(&folder_name) {
            Some(cached) if stamp > 0 && cached.stamp_ms >= stamp => cached.size_bytes,
            _ => {
                let size = crate::services::world_backup_service::directory_size(&path).await;
                cache.insert(
                    folder_name.clone(),
                    WorldSizeCacheEntry {
                        stamp_ms: stamp,
                        size_bytes: size,
                    },
                );
                cache_changed = true;
                size
            }
        };
        seen.insert(folder_name.clone());

        worlds.push(InstanceWorld {
            icon_data_url: world_icon_data_url(&path).await,
            folder_name,
            modified_ms,
            size_bytes,
        });
    }

    let entries_before = cache.len();
    cache.retain(|name, _| seen.contains(name));
    if cache.len() != entries_before {
        cache_changed = true;
    }
    if cache_changed {
        let _ = json_store::write_json_atomic(&cache_path, &cache).await;
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
) -> Result<crate::services::world_backup_service::WorldBackupEntry, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    shared::with_instance_reserved(&registry, &instance_id, async {
        crate::services::world_backup_service::backup_world(
            &paths,
            &data_dir,
            &instance_id,
            &folder_name,
        )
        .await
    })
    .await
}

#[tauri::command]
pub async fn list_world_backups(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<Vec<crate::services::world_backup_service::WorldBackupEntry>, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    crate::services::world_backup_service::list_backups(&paths, &data_dir, &instance_id).await
}

#[tauri::command]
pub async fn restore_world_backup(
    state: State<'_, AppState>,
    registry: State<'_, crate::services::launch_service::LaunchRegistry>,
    instance_id: String,
    folder_name: String,
    file_name: String,
) -> Result<(), AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    shared::with_instance_reserved(&registry, &instance_id, async {
        crate::services::world_backup_service::restore_backup(
            &paths,
            &data_dir,
            &instance_id,
            &folder_name,
            &file_name,
        )
        .await
    })
    .await
}

#[tauri::command]
pub async fn delete_world_backup(
    state: State<'_, AppState>,
    registry: State<'_, crate::services::launch_service::LaunchRegistry>,
    instance_id: String,
    folder_name: String,
    file_name: String,
) -> Result<(), AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    shared::with_instance_reserved(&registry, &instance_id, async {
        crate::services::world_backup_service::delete_backup(
            &paths,
            &data_dir,
            &instance_id,
            &folder_name,
            &file_name,
        )
        .await
    })
    .await
}

#[tauri::command]
pub async fn delete_instance_world(
    state: State<'_, AppState>,
    registry: State<'_, crate::services::launch_service::LaunchRegistry>,
    instance_id: String,
    folder_name: String,
) -> Result<(), AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    shared::with_instance_reserved(&registry, &instance_id, async {
        let folder = crate::services::world_backup_service::validate_world_folder(&folder_name)?;
        let saves_dir = paths
            .instance_game_dir(&data_dir, &instance_id)
            .join("saves");
        let target = saves_dir.join(&folder);
        if !target.is_dir() {
            return Err(AppError::NotFound("Мир не найден".into()));
        }
        tokio::fs::remove_dir_all(&target).await?;
        // Сбрасываем кэш размеров: записи удалённого мира больше не нужны.
        let _ = tokio::fs::remove_file(
            paths
                .instance_dir(&data_dir, &instance_id)
                .join("worlds-cache.json"),
        )
        .await;
        Ok(())
    })
    .await
}

fn instance_latest_log(
    paths: &crate::storage::paths::AppPaths,
    data_dir: &Path,
    instance_id: &str,
) -> PathBuf {
    paths
        .instance_dir(data_dir, instance_id)
        .join("logs")
        .join("latest.log")
}

const LOG_TAIL_BYTES: u64 = 512 * 1024;

/// Читает последние строки лога, не загружая весь файл в память.
async fn read_log_tail(path: &Path, max_lines: usize) -> AppResult<Vec<String>> {
    if !path.is_file() {
        return Ok(Vec::new());
    }

    use tokio::io::{AsyncReadExt, AsyncSeekExt};

    let size = tokio::fs::metadata(path).await?.len();
    let start = size.saturating_sub(LOG_TAIL_BYTES);

    let mut file = tokio::fs::File::open(path).await?;
    if start > 0 {
        file.seek(std::io::SeekFrom::Start(start)).await?;
    }

    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).await?;

    // Первая строка обрезанного куска почти наверняка неполная.
    if start > 0 {
        if let Some(position) = buffer.iter().position(|byte| *byte == b'\n') {
            buffer.drain(..=position);
        }
    }

    let text = String::from_utf8_lossy(&buffer);
    let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
    if lines.len() > max_lines {
        lines = lines.split_off(lines.len() - max_lines);
    }
    Ok(lines)
}

#[tauri::command]
pub async fn read_instance_log(
    state: State<'_, AppState>,
    instance_id: String,
    max_lines: Option<usize>,
) -> Result<Vec<String>, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let path = instance_latest_log(&paths, &data_dir, &instance_id);
    let limit = max_lines.unwrap_or(200).clamp(1, 5000);
    read_log_tail(&path, limit).await
}

#[tauri::command]
pub async fn open_instance_log(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<(), AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let target = instance_latest_log(&paths, &data_dir, &instance_id);
    if !target.is_file() {
        return Err(AppError::NotFound(
            "Лог ещё не создан: запустите игру".into(),
        ));
    }

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&target)
        .spawn()
        .map_err(|e| AppError::Process(format!("Не удалось открыть лог: {e}")))?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&target)
        .spawn()
        .map_err(|e| AppError::Process(format!("Не удалось открыть лог: {e}")))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&target)
        .spawn()
        .map_err(|e| AppError::Process(format!("Не удалось открыть лог: {e}")))?;

    Ok(())
}

/// Экспортирует сборку целиком (моды, конфиги, миры) в zip.
#[tauri::command]
pub async fn export_instance_archive(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    registry: State<'_, crate::services::launch_service::LaunchRegistry>,
    instance_id: String,
) -> Result<Option<crate::services::instance_archive_service::ExportedInstanceArchive>, AppError> {
    // Проверяем занятость до диалога, а сам архив пишем под резервом слота.
    shared::ensure_instance_idle(&registry, &instance_id).await?;
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let instance = instance_service::load_instances(&paths, &data_dir)
        .await?
        .into_iter()
        .find(|item| item.id == instance_id)
        .ok_or_else(|| AppError::NotFound("Сборка не найдена".into()))?;

    let default_name = format!("{}.zip", safe_export_name(&instance.name));
    let Some(target) = rfd::FileDialog::new()
        .set_title("Экспорт сборки в zip")
        .set_file_name(&default_name)
        .add_filter("Zip archive", &["zip"])
        .save_file()
    else {
        return Ok(None);
    };

    let exported = shared::with_instance_reserved(&registry, &instance_id, async {
        crate::services::instance_archive_service::export_instance(
            Some(&app),
            &paths,
            &data_dir,
            &instance,
            &target,
        )
        .await
    })
    .await?;
    Ok(Some(exported))
}

#[tauri::command]
pub fn pick_instance_archive() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("Выберите архив сборки HydroLauncher")
        .add_filter("Zip archive", &["zip"])
        .pick_file()
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn import_instance_archive(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    file_path: String,
) -> Result<Instance, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    crate::services::instance_archive_service::import_instance(
        Some(&app),
        &paths,
        &data_dir,
        std::path::Path::new(&file_path),
    )
    .await
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
    let trimmed: String = cleaned.trim().trim_matches('.').chars().take(64).collect();
    if trimmed.is_empty() {
        "instance".to_string()
    } else {
        trimmed
    }
}

#[cfg(test)]
mod tests {
    use super::read_log_tail;

    #[tokio::test]
    async fn reads_only_the_tail() {
        let dir = std::env::temp_dir().join(format!("hydro-log-{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(&dir).await.unwrap();
        let path = dir.join("latest.log");
        let content = (0..500)
            .map(|index| format!("line {index}"))
            .collect::<Vec<_>>()
            .join("\n");
        tokio::fs::write(&path, content).await.unwrap();

        let lines = read_log_tail(&path, 10).await.unwrap();
        assert_eq!(lines.len(), 10);
        assert_eq!(lines.first().unwrap(), "line 490");
        assert_eq!(lines.last().unwrap(), "line 499");

        let _ = tokio::fs::remove_dir_all(&dir).await;
    }

    #[tokio::test]
    async fn missing_log_returns_empty_list() {
        let path = std::env::temp_dir().join(format!("hydro-missing-{}.log", uuid::Uuid::new_v4()));
        assert!(read_log_tail(&path, 10).await.unwrap().is_empty());
    }
}
