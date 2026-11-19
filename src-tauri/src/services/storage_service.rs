use crate::error::{AppError, AppResult};
use crate::services::instance_service;
use crate::storage::paths::AppPaths;
use serde::Serialize;
use std::path::Path;

/// Размер одной категории хранилища. Названия переводит интерфейс.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageCategory {
    pub id: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceStorage {
    pub id: String,
    pub name: String,
    pub total_bytes: u64,
    pub worlds_bytes: u64,
    pub mods_bytes: u64,
    pub backups_bytes: u64,
    pub logs_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageReport {
    pub total_bytes: u64,
    pub categories: Vec<StorageCategory>,
    /// Сборки по убыванию размера: сверху те, что занимают больше всего.
    pub instances: Vec<InstanceStorage>,
}

/// Что можно безопасно удалить. Всё остальное лаунчер не трогает.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CleanupKind {
    Cache,
    Logs,
}

impl CleanupKind {
    pub fn parse(value: &str) -> AppResult<Self> {
        match value {
            "cache" => Ok(CleanupKind::Cache),
            "logs" => Ok(CleanupKind::Logs),
            _ => Err(AppError::Validation("Неизвестная категория очистки".into())),
        }
    }
}

fn dir_size(path: &Path) -> u64 {
    let Ok(metadata) = std::fs::symlink_metadata(path) else {
        return 0;
    };
    if metadata.is_file() {
        return metadata.len();
    }
    if !metadata.is_dir() {
        return 0;
    }

    let mut total = 0;
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    for entry in entries.flatten() {
        total += dir_size(&entry.path());
    }
    total
}

fn top_level_sizes(data_dir: &Path) -> (Vec<StorageCategory>, u64) {
    const KNOWN: [&str; 6] = [
        "instances",
        "assets",
        "libraries",
        "versions",
        "runtimes",
        "cache",
    ];

    let mut sizes: Vec<(String, u64)> = KNOWN.iter().map(|id| (id.to_string(), 0)).collect();
    let mut other = 0;

    if let Ok(entries) = std::fs::read_dir(data_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let size = dir_size(&path);
            let name = entry.file_name().to_string_lossy().to_lowercase();
            match sizes.iter_mut().find(|(id, _)| *id == name) {
                Some((_, value)) => *value += size,
                None => other += size,
            }
        }
    }

    let mut categories: Vec<StorageCategory> = sizes
        .into_iter()
        .map(|(id, size_bytes)| StorageCategory { id, size_bytes })
        .collect();
    categories.push(StorageCategory {
        id: "other".to_string(),
        size_bytes: other,
    });
    (categories, other)
}

fn instance_storage(instance_dir: &Path, id: &str, name: &str) -> InstanceStorage {
    let game_dir = instance_dir.join("game");
    InstanceStorage {
        id: id.to_string(),
        name: name.to_string(),
        total_bytes: dir_size(instance_dir),
        worlds_bytes: dir_size(&game_dir.join("saves")),
        mods_bytes: dir_size(&game_dir.join("mods"))
            + dir_size(&game_dir.join("horizon-mods"))
            + dir_size(&game_dir.join("horizon-native-mods")),
        backups_bytes: dir_size(&instance_dir.join("backups")),
        logs_bytes: dir_size(&game_dir.join("logs")) + dir_size(&game_dir.join("crash-reports")),
    }
}

pub async fn report(paths: &AppPaths, data_dir: &Path) -> AppResult<StorageReport> {
    let instances = instance_service::load_instances(paths, data_dir).await?;
    let data_dir = data_dir.to_path_buf();
    let instances_dir = paths.instances_dir(&data_dir);

    tokio::task::spawn_blocking(move || {
        let (categories, _) = top_level_sizes(&data_dir);
        let total_bytes = categories.iter().map(|item| item.size_bytes).sum();

        let mut list: Vec<InstanceStorage> = instances
            .iter()
            .map(|instance| {
                instance_storage(
                    &instances_dir.join(&instance.id),
                    &instance.id,
                    &instance.name,
                )
            })
            .collect();
        list.sort_by(|a, b| b.total_bytes.cmp(&a.total_bytes));

        StorageReport {
            total_bytes,
            categories,
            instances: list,
        }
    })
    .await
    .map_err(|err| AppError::Process(format!("Не удалось посчитать размеры: {err}")))
}

fn clear_dir(path: &Path) -> u64 {
    let freed = dir_size(path);
    let _ = std::fs::remove_dir_all(path);
    let _ = std::fs::create_dir_all(path);
    freed
}

/// Удаляет только кэш или логи. Миры, моды и настройки не затрагиваются.
pub async fn cleanup(paths: &AppPaths, data_dir: &Path, kind: CleanupKind) -> AppResult<u64> {
    let paths = paths.clone();
    let data_dir = data_dir.to_path_buf();

    tokio::task::spawn_blocking(move || match kind {
        CleanupKind::Cache => Ok(clear_dir(&data_dir.join("cache"))),
        CleanupKind::Logs => {
            let instances = paths.instances_dir(&data_dir);
            let mut freed = 0;
            if let Ok(entries) = std::fs::read_dir(&instances) {
                for entry in entries.flatten() {
                    let game_dir = entry.path().join("game");
                    freed += clear_dir(&game_dir.join("logs"));
                    freed += clear_dir(&game_dir.join("crash-reports"));
                }
            }
            Ok(freed)
        }
    })
    .await
    .map_err(|err| AppError::Process(format!("Не удалось очистить хранилище: {err}")))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_dir() -> PathBuf {
        std::env::temp_dir().join(format!("hydro-storage-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn counts_nested_files() {
        let root = temp_dir();
        std::fs::create_dir_all(root.join("nested")).unwrap();
        std::fs::write(root.join("a.txt"), b"12345").unwrap();
        std::fs::write(root.join("nested").join("b.txt"), b"123").unwrap();

        assert_eq!(dir_size(&root), 8);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn groups_known_categories_and_other() {
        let root = temp_dir();
        std::fs::create_dir_all(root.join("assets")).unwrap();
        std::fs::create_dir_all(root.join("custom")).unwrap();
        std::fs::write(root.join("assets").join("a"), b"1234").unwrap();
        std::fs::write(root.join("custom").join("b"), b"12").unwrap();
        std::fs::write(root.join("accounts.json"), b"1").unwrap();

        let (categories, _) = top_level_sizes(&root);
        let get = |id: &str| {
            categories
                .iter()
                .find(|item| item.id == id)
                .map(|item| item.size_bytes)
                .unwrap_or_default()
        };
        assert_eq!(get("assets"), 4);
        assert_eq!(get("other"), 3);
        assert_eq!(get("instances"), 0);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_unknown_cleanup_kind() {
        assert!(CleanupKind::parse("everything").is_err());
        assert_eq!(CleanupKind::parse("cache").unwrap(), CleanupKind::Cache);
        assert_eq!(CleanupKind::parse("logs").unwrap(), CleanupKind::Logs);
    }
}
