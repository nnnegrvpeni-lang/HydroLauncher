use crate::error::AppResult;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};
use tokio::io::AsyncWriteExt;
use tokio::sync::{Mutex, OwnedMutexGuard};

/// Замок на конкретный файл. Без него два параллельных read-modify-write
/// (например, статистика после выхода из игры и правка сборки из интерфейса)
/// затирают изменения друг друга.
static FILE_LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();
static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

fn normalized(path: &Path) -> PathBuf {
    // Windows не различает регистр в путях, поэтому и замок должен быть один.
    PathBuf::from(path.to_string_lossy().to_lowercase())
}

/// Захватывает замок файла. Держите его на всё время read-modify-write.
pub async fn lock_file(path: &Path) -> OwnedMutexGuard<()> {
    let map = FILE_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let lock = {
        let mut guard = map.lock().await;
        guard
            .entry(normalized(path))
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    };
    lock.lock_owned().await
}

fn backup_path(path: &Path) -> PathBuf {
    path.with_extension("json.bak")
}

fn quarantine_path(path: &Path) -> PathBuf {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "store".into());
    let ext = path
        .extension()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "json".into());
    path.with_file_name(format!("{stem}.corrupt-{stamp}.{ext}"))
}

/// Читает файл, не заходя в замок. Вызывать только под `lock_file`.
pub async fn read_locked<T>(path: &Path) -> AppResult<T>
where
    T: DeserializeOwned + Default,
{
    if tokio::fs::try_exists(path).await? {
        let bytes = tokio::fs::read(path).await?;
        if !bytes.is_empty() {
            match serde_json::from_slice::<T>(&bytes) {
                Ok(value) => return Ok(value),
                Err(err) => return recover_from_backup(path, err).await,
            }
        }
        return Ok(T::default());
    }

    // Основной файл пропал между переименованиями — поднимаем резервную копию.
    let backup = backup_path(path);
    if tokio::fs::try_exists(&backup).await? {
        let bytes = tokio::fs::read(&backup).await?;
        if let Ok(value) = serde_json::from_slice::<T>(&bytes) {
            let _ = tokio::fs::copy(&backup, path).await;
            return Ok(value);
        }
    }
    Ok(T::default())
}

/// Битый файл не должен блокировать лаунчер: сохраняем его рядом и
/// возвращаемся к резервной копии или к значениям по умолчанию.
async fn recover_from_backup<T>(path: &Path, err: serde_json::Error) -> AppResult<T>
where
    T: DeserializeOwned + Default,
{
    let backup = backup_path(path);
    if tokio::fs::try_exists(&backup).await? {
        let bytes = tokio::fs::read(&backup).await?;
        if let Ok(value) = serde_json::from_slice::<T>(&bytes) {
            let quarantine = quarantine_path(path);
            let _ = tokio::fs::rename(path, &quarantine).await;
            let _ = tokio::fs::copy(&backup, path).await;
            eprintln!(
                "[hydro] {} повреждён ({err}); восстановлен из резервной копии, копия файла: {}",
                path.display(),
                quarantine.display()
            );
            return Ok(value);
        }
    }

    let quarantine = quarantine_path(path);
    let _ = tokio::fs::rename(path, &quarantine).await;
    eprintln!(
        "[hydro] {} повреждён ({err}); сохранён как {} и сброшен к значениям по умолчанию",
        path.display(),
        quarantine.display()
    );
    Ok(T::default())
}

/// Пишет файл, не заходя в замок. Вызывать только под `lock_file`.
pub async fn write_locked<T>(path: &Path, value: &T) -> AppResult<()>
where
    T: Serialize,
{
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let json = serde_json::to_vec_pretty(value)?;
    let tmp_path = path.with_extension(format!(
        "json.tmp{}-{}",
        std::process::id(),
        TMP_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));

    {
        let mut file = tokio::fs::File::create(&tmp_path).await?;
        file.write_all(&json).await?;
        file.sync_all().await?;
    }

    // Прежняя версия остаётся резервной копией на случай обрыва записи.
    let backup = backup_path(path);
    if tokio::fs::try_exists(path).await? {
        let _ = tokio::fs::remove_file(&backup).await;
        tokio::fs::rename(path, &backup).await?;
    }
    tokio::fs::rename(&tmp_path, path).await?;
    Ok(())
}

pub async fn read_json_or_default<T>(path: &Path) -> AppResult<T>
where
    T: DeserializeOwned + Default,
{
    let _guard = lock_file(path).await;
    read_locked(path).await
}

pub async fn write_json_atomic<T>(path: &Path, value: &T) -> AppResult<()>
where
    T: Serialize,
{
    let _guard = lock_file(path).await;
    write_locked(path, value).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
    struct Sample {
        name: String,
        count: u32,
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "hydro-json-{tag}-{}-{}",
            std::process::id(),
            TMP_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn keeps_previous_version_as_backup() {
        let dir = temp_dir("backup");
        let path = dir.join("store.json");
        let first = Sample {
            name: "first".into(),
            count: 1,
        };
        let second = Sample {
            name: "second".into(),
            count: 2,
        };

        write_json_atomic(&path, &first).await.unwrap();
        write_json_atomic(&path, &second).await.unwrap();

        let current: Sample = read_json_or_default(&path).await.unwrap();
        assert_eq!(current, second);

        let backup_raw = std::fs::read_to_string(backup_path(&path)).unwrap();
        let backup: Sample = serde_json::from_str(&backup_raw).unwrap();
        assert_eq!(backup, first);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn recovers_corrupt_file_from_backup() {
        let dir = temp_dir("corrupt");
        let path = dir.join("store.json");
        let saved = Sample {
            name: "saved".into(),
            count: 7,
        };
        write_json_atomic(&path, &saved).await.unwrap();
        write_json_atomic(&path, &saved).await.unwrap();
        std::fs::write(&path, b"{ broken").unwrap();

        let restored: Sample = read_json_or_default(&path).await.unwrap();
        assert_eq!(restored, saved);

        let quarantined: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_name().to_string_lossy().contains(".corrupt-"))
            .collect();
        assert_eq!(quarantined.len(), 1, "битый файл должен сохраняться рядом");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn corrupt_file_without_backup_falls_back_to_default() {
        let dir = temp_dir("default");
        let path = dir.join("store.json");
        std::fs::write(&path, b"not json at all").unwrap();

        let value: Sample = read_json_or_default(&path).await.unwrap();
        assert_eq!(value, Sample::default());
        assert!(!path.exists(), "битый файл должен быть перемещён в карантин");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
