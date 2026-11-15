use crate::error::{AppError, AppResult};
use crate::models::events::LaunchProgressEvent;
use crate::storage::paths::AppPaths;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldBackupEntry {
    pub world_folder: String,
    pub file_name: String,
    pub created_ms: u64,
    pub size_bytes: u64,
}

pub fn backups_root(paths: &AppPaths, data_dir: &Path, instance_id: &str) -> PathBuf {
    paths.instance_dir(data_dir, instance_id).join("backups")
}

/// Проверяет имя папки мира: без разделителей и переходов вверх.
pub fn validate_world_folder(folder: &str) -> AppResult<String> {
    let name = folder.trim();
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains(['/', '\\'])
        || name.contains('\0')
    {
        return Err(AppError::Validation("Некорректное имя мира".into()));
    }
    Ok(name.to_string())
}

fn validate_backup_file(file_name: &str) -> AppResult<()> {
    let name = file_name.trim();
    if !name.ends_with(".zip")
        || name.contains(['/', '\\'])
        || name.contains("..")
        || name.contains('\0')
    {
        return Err(AppError::Validation(
            "Некорректное имя резервной копии".into(),
        ));
    }
    Ok(())
}

/// Суммарный размер папки без перехода по символическим ссылкам.
pub async fn directory_size(path: &Path) -> u64 {
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

/// Дешёвая проверка изменений мира: максимальный mtime среди прямых детей.
pub async fn world_change_stamp(path: &Path) -> u64 {
    let mut stamp = tokio::fs::metadata(path)
        .await
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);

    let Ok(mut entries) = tokio::fs::read_dir(path).await else {
        return stamp;
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        if let Ok(meta) = entry.metadata().await {
            if let Ok(modified) = meta.modified() {
                if let Ok(duration) = modified.duration_since(UNIX_EPOCH) {
                    stamp = stamp.max(duration.as_millis() as u64);
                }
            }
        }
    }
    stamp
}

fn modified_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

/// Создаёт zip-копию мира в `backups/<мир>/<дата>.zip`.
pub async fn backup_world(
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
    world_folder: &str,
) -> AppResult<WorldBackupEntry> {
    let folder = validate_world_folder(world_folder)?;
    let saves_dir = paths.instance_game_dir(data_dir, instance_id).join("saves");
    let source = saves_dir.join(&folder);
    if !source.is_dir() || !source.join("level.dat").is_file() {
        return Err(AppError::NotFound("Мир не найден".into()));
    }

    let target_dir = backups_root(paths, data_dir, instance_id).join(&folder);
    tokio::fs::create_dir_all(&target_dir).await?;

    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let mut file_name = format!("{stamp}.zip");
    let mut target = target_dir.join(&file_name);
    let mut counter = 1;
    while tokio::fs::try_exists(&target).await.unwrap_or(false) {
        file_name = format!("{stamp}-{counter}.zip");
        target = target_dir.join(&file_name);
        counter += 1;
    }

    let source_clone = source.clone();
    let target_clone = target.clone();
    tokio::task::spawn_blocking(move || zip_directory(&source_clone, &target_clone))
        .await
        .map_err(|e| AppError::Process(format!("Не удалось создать резервную копию: {e}")))??;

    let meta = tokio::fs::metadata(&target).await?;
    Ok(WorldBackupEntry {
        world_folder: folder,
        file_name,
        created_ms: modified_ms(&meta),
        size_bytes: meta.len(),
    })
}

/// Все структурированные резервные копии сборки, новые сверху.
pub async fn list_backups(
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
) -> AppResult<Vec<WorldBackupEntry>> {
    // Старые версии делали плоские `backups/<имя>-<дата>.zip`.
    migrate_legacy_backups(paths, data_dir, instance_id).await;

    let root = backups_root(paths, data_dir, instance_id);
    let mut backups = Vec::new();

    let Ok(mut worlds) = tokio::fs::read_dir(&root).await else {
        return Ok(backups);
    };
    while let Ok(Some(world_entry)) = worlds.next_entry().await {
        if !world_entry.file_type().await.map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let world_folder = world_entry.file_name().to_string_lossy().to_string();
        let Ok(mut files) = tokio::fs::read_dir(world_entry.path()).await else {
            continue;
        };
        while let Ok(Some(file_entry)) = files.next_entry().await {
            let file_name = file_entry.file_name().to_string_lossy().to_string();
            if !file_name.ends_with(".zip") {
                continue;
            }
            let Ok(meta) = file_entry.metadata().await else {
                continue;
            };
            backups.push(WorldBackupEntry {
                world_folder: world_folder.clone(),
                file_name,
                created_ms: modified_ms(&meta),
                size_bytes: meta.len(),
            });
        }
    }

    backups.sort_by(|a, b| b.created_ms.cmp(&a.created_ms));
    Ok(backups)
}

/// Имя мира в старом формате бэкапа: буквы/цифры, пробел, `-` и `_`.
fn legacy_backup_stem(name: &str) -> String {
    name.chars()
        .map(|ch| {
            if ch.is_alphanumeric() || matches!(ch, '-' | '_' | ' ') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim()
        .to_string()
}

fn is_backup_timestamp(rest: &str) -> bool {
    let Some(stem) = rest.strip_suffix(".zip") else {
        return false;
    };
    let bytes = stem.as_bytes();
    if bytes.len() < 15 {
        return false;
    }
    let core = &stem[..15];
    let mut chars = core.chars();
    let valid = chars.by_ref().take(8).all(|ch| ch.is_ascii_digit())
        && chars.next() == Some('-')
        && chars.by_ref().take(6).all(|ch| ch.is_ascii_digit());
    if !valid {
        return false;
    }
    stem.len() == 15 || (stem.len() > 16 && stem.as_bytes()[15] == b'-')
}

/// Переносит плоские бэкапы из 0.2.x в `backups/<мир>/`.
async fn migrate_legacy_backups(paths: &AppPaths, data_dir: &Path, instance_id: &str) {
    let root = backups_root(paths, data_dir, instance_id);
    let Ok(mut entries) = tokio::fs::read_dir(&root).await else {
        return;
    };

    let saves_dir = paths.instance_game_dir(data_dir, instance_id).join("saves");
    let mut world_names = Vec::new();
    if let Ok(mut worlds) = tokio::fs::read_dir(&saves_dir).await {
        while let Ok(Some(entry)) = worlds.next_entry().await {
            if entry.file_type().await.map(|kind| kind.is_dir()).unwrap_or(false) {
                world_names.push(entry.file_name().to_string_lossy().to_string());
            }
        }
    }
    if world_names.is_empty() {
        return;
    }

    while let Ok(Some(entry)) = entries.next_entry().await {
        if !entry.file_type().await.map(|kind| kind.is_file()).unwrap_or(false) {
            continue;
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        if !file_name.ends_with(".zip") {
            continue;
        }

        for world in &world_names {
            let prefix = format!("{}-", legacy_backup_stem(world));
            let Some(rest) = file_name.strip_prefix(&prefix) else {
                continue;
            };
            if !is_backup_timestamp(rest) {
                continue;
            }

            let target_dir = root.join(world);
            if tokio::fs::create_dir_all(&target_dir).await.is_err() {
                break;
            }
            let target = target_dir.join(&file_name);
            if !tokio::fs::try_exists(&target).await.unwrap_or(false) {
                let _ = tokio::fs::rename(entry.path(), &target).await;
            }
            break;
        }
    }
}

pub async fn delete_backup(    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
    world_folder: &str,
    file_name: &str,
) -> AppResult<()> {
    let folder = validate_world_folder(world_folder)?;
    validate_backup_file(file_name)?;

    let world_backups = backups_root(paths, data_dir, instance_id).join(&folder);
    let target = world_backups.join(file_name.trim());
    if !target.is_file() {
        return Err(AppError::NotFound("Резервная копия не найдена".into()));
    }
    tokio::fs::remove_file(&target).await?;

    // Если копий больше не осталось, убираем и пустую папку мира.
    let _ = tokio::fs::remove_dir(&world_backups).await;
    Ok(())
}

/// Восстанавливает мир из архива. Текущий мир сохраняется рядом как
/// `<мир>.before-restore-<дата>`, чтобы восстановление не теряло данные.
pub async fn restore_backup(
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
    world_folder: &str,
    file_name: &str,
) -> AppResult<()> {
    let folder = validate_world_folder(world_folder)?;
    validate_backup_file(file_name)?;

    let archive = backups_root(paths, data_dir, instance_id)
        .join(&folder)
        .join(file_name.trim());
    if !archive.is_file() {
        return Err(AppError::NotFound("Резервная копия не найдена".into()));
    }

    let saves_dir = paths.instance_game_dir(data_dir, instance_id).join("saves");
    tokio::fs::create_dir_all(&saves_dir).await?;
    let target = saves_dir.join(&folder);

    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let mut stashed: Option<PathBuf> = None;
    if tokio::fs::try_exists(&target).await? {
        let mut stash = saves_dir.join(format!("{folder}.before-restore-{stamp}"));
        let mut counter = 1;
        while tokio::fs::try_exists(&stash).await.unwrap_or(false) {
            stash = saves_dir.join(format!("{folder}.before-restore-{stamp}-{counter}"));
            counter += 1;
        }
        tokio::fs::rename(&target, &stash).await?;
        stashed = Some(stash);
    }

    let archive_clone = archive.clone();
    let target_clone = target.clone();
    let extracted = tokio::task::spawn_blocking(move || {
        extract_world_zip(&archive_clone, &target_clone)
    })
    .await
    .map_err(|e| AppError::Process(format!("Не удалось восстановить мир: {e}")))?;

    if let Err(err) = extracted {
        let _ = tokio::fs::remove_dir_all(&target).await;
        if let Some(stash) = stashed {
            let _ = tokio::fs::rename(&stash, &target).await;
        }
        return Err(err);
    }

    let _ = tokio::fs::remove_file(
        paths
            .instance_dir(data_dir, instance_id)
            .join("worlds-cache.json"),
    )
    .await;
    Ok(())
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

fn extract_world_zip(source: &Path, dest: &Path) -> Result<(), AppError> {
    let file = std::fs::File::open(source)?;
    let mut archive = zip::ZipArchive::new(file)?;

    // `enclosed_name` отбрасывает абсолютные пути и `..`, защищая от zip-slip.
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let Some(relative) = entry.enclosed_name() else {
            continue;
        };
        let out_path = dest.join(relative);

        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)?;
            continue;
        }
        if entry
            .unix_mode()
            .map(|mode| mode & 0o170000 == 0o120000)
            .unwrap_or(false)
        {
            continue;
        }
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut out_file = std::fs::File::create(&out_path)?;
        std::io::copy(&mut entry, &mut out_file)?;
    }

    Ok(())
}

/// Удаляет старые копии мира, оставляя `retention` самых свежих.
async fn prune_world_backups(
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
    world_folder: &str,
    retention: usize,
) {
    let keep = retention.max(1);
    let entries = list_backups(paths, data_dir, instance_id)
        .await
        .unwrap_or_default()
        .into_iter()
        .filter(|entry| entry.world_folder == world_folder)
        .collect::<Vec<_>>();

    let dir = backups_root(paths, data_dir, instance_id).join(world_folder);
    for entry in entries.into_iter().skip(keep) {
        let _ = tokio::fs::remove_file(dir.join(&entry.file_name)).await;
    }
}

/// Делает резервные копии только тех миров, которые менялись после последней.
/// Возвращает число созданных копий; ошибки по отдельным мирам не фатальны.
pub async fn auto_backup_changed_worlds(
    app: &AppHandle,
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
    retention: usize,
) -> usize {
    let saves_dir = paths.instance_game_dir(data_dir, instance_id).join("saves");
    if !saves_dir.is_dir() {
        return 0;
    }

    let latest = list_backups(paths, data_dir, instance_id)
        .await
        .unwrap_or_default()
        .into_iter()
        .fold(HashMap::<String, u64>::new(), |mut map, entry| {
            let current = map.entry(entry.world_folder).or_insert(0);
            *current = (*current).max(entry.created_ms);
            map
        });

    let mut pending = Vec::new();
    let Ok(mut entries) = tokio::fs::read_dir(&saves_dir).await else {
        return 0;
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if !path.is_dir() || !path.join("level.dat").is_file() {
            continue;
        }
        let folder = entry.file_name().to_string_lossy().to_string();
        if folder.contains(".before-restore-") {
            continue;
        }
        let stamp = world_change_stamp(&path).await;
        if stamp == 0 {
            continue;
        }
        if latest.get(&folder).map(|saved| *saved >= stamp).unwrap_or(false) {
            continue;
        }
        pending.push(folder);
    }

    if pending.is_empty() {
        return 0;
    }

    let total = pending.len() as u64;
    let mut created = 0usize;
    for (index, folder) in pending.into_iter().enumerate() {
        let _ = app.emit(
            "launch://progress",
            LaunchProgressEvent {
                instance_id: instance_id.to_string(),
                stage: "backup".to_string(),
                message: format!("Резервная копия мира «{folder}»…"),
                current: index as u64,
                total,
                percent: (index as f64 / total as f64) * 100.0,
            },
        );

        if backup_world(paths, data_dir, instance_id, &folder)
            .await
            .is_ok()
        {
            created += 1;
            prune_world_backups(paths, data_dir, instance_id, &folder, retention).await;
        }
    }

    let _ = app.emit(
        "launch://progress",
        LaunchProgressEvent {
            instance_id: instance_id.to_string(),
            stage: "backup".to_string(),
            message: "Резервные копии миров готовы".to_string(),
            current: total,
            total,
            percent: 100.0,
        },
    );
    created
}

#[cfg(test)]
mod tests {
    use super::{extract_world_zip, legacy_backup_stem, is_backup_timestamp, validate_world_folder};

    #[test]
    fn validates_world_folder_names() {
        assert!(validate_world_folder("Мир 1").is_ok());
        assert!(validate_world_folder("world_2026").is_ok());
        assert!(validate_world_folder("").is_err());
        assert!(validate_world_folder("..").is_err());
        assert!(validate_world_folder("a/b").is_err());
        assert!(validate_world_folder("a\\b").is_err());
    }

    #[test]
    fn detects_legacy_backup_names() {
        assert_eq!(legacy_backup_stem("Мир 1"), "Мир 1");
        assert!(is_backup_timestamp("20261115-120000.zip"));
        assert!(is_backup_timestamp("20261115-120000-2.zip"));
        assert!(!is_backup_timestamp("backup.zip"));
        assert!(!is_backup_timestamp("2026-11-15.zip"));
    }

    #[test]
    fn restores_files_and_rejects_zip_slip() {
        use std::io::Write;
        use zip::write::SimpleFileOptions;

        let dir = std::env::temp_dir().join(format!("hydro-backup-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let archive_path = dir.join("backup.zip");
        let dest = dir.join("restored");

        let file = std::fs::File::create(&archive_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("level.dat", options).unwrap();
        zip.write_all(b"level").unwrap();
        zip.start_file("region/r.0.0.mca", options).unwrap();
        zip.write_all(b"region").unwrap();
        zip.start_file("../escape.txt", options).unwrap();
        zip.write_all(b"escape").unwrap();
        zip.finish().unwrap();

        extract_world_zip(&archive_path, &dest).unwrap();

        assert_eq!(std::fs::read(dest.join("level.dat")).unwrap(), b"level");
        assert!(dest.join("region/r.0.0.mca").is_file());
        assert!(!dir.join("escape.txt").exists());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
