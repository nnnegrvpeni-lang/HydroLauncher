use crate::error::{AppError, AppResult};
use crate::models::instance::{
    sanitize_version_token, CreateInstanceRequest, Instance, InstancesStore, UpdateInstanceRequest,
};
use crate::storage::json_store::{lock_file, read_json_or_default, read_locked, write_locked};
use crate::storage::paths::AppPaths;
use chrono::Utc;
use std::path::Path;
use uuid::Uuid;

pub async fn load_instances(paths: &AppPaths, data_dir: &Path) -> AppResult<Vec<Instance>> {
    let store: InstancesStore = read_json_or_default(&paths.instances_file(data_dir)).await?;
    Ok(store.instances)
}

/// Оставляет только безопасные ID оформления: строчные буквы, цифры, `_` и `-`.
/// Пустое или подозрительное значение заменяется резервным — так в
/// instances.json не попадут пути и произвольные строки.
fn sanitize_icon_id(value: Option<String>, fallback: &str) -> String {
    value
        .map(|raw| raw.trim().to_ascii_lowercase())
        .filter(|raw| {
            !raw.is_empty()
                && raw.len() <= 48
                && raw
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
        })
        .unwrap_or_else(|| fallback.to_string())
}

pub async fn create_instance(
    paths: &AppPaths,
    data_dir: &Path,
    req: CreateInstanceRequest,
) -> AppResult<Instance> {
    let clean_name = req.name.trim().to_string();
    if clean_name.is_empty() {
        return Err(AppError::Validation(
            "Название сборки не может быть пустым".into(),
        ));
    }
    if req.minecraft_version.trim().is_empty() {
        return Err(AppError::Validation("Не выбрана версия Minecraft".into()));
    }
    let minecraft_version = sanitize_version_token(&req.minecraft_version)
        .ok_or_else(|| AppError::Validation("Некорректная версия Minecraft".into()))?;
    let loader_version = match req.loader_version.as_deref() {
        Some(value) => Some(
            sanitize_version_token(value)
                .ok_or_else(|| AppError::Validation("Некорректная версия загрузчика".into()))?,
        ),
        None => None,
    };

    let file = paths.instances_file(data_dir);
    let _guard = lock_file(&file).await;
    let mut store: InstancesStore = read_locked(&file).await?;

    let id = Uuid::new_v4().to_string();
    let game_dir = paths.instance_game_dir(data_dir, &id);
    tokio::fs::create_dir_all(&game_dir).await?;

    let instance = Instance {
        id,
        name: clean_name,
        minecraft_version,
        engine: req.engine,
        loader: req.loader,
        loader_version,
        auto_update_horizon: true,
        memory_mb_override: None,
        java_path_override: None,
        jvm_args: Vec::new(),
        game_args: Vec::new(),
        icon: sanitize_icon_id(req.icon, ""),
        background: sanitize_icon_id(req.background, ""),
        created_at: Utc::now().to_rfc3339(),
        last_played_at: None,
        play_time_seconds: 0,
    };

    store.instances.push(instance.clone());
    write_locked(&file, &store).await?;
    Ok(instance)
}

pub async fn update_instance(
    paths: &AppPaths,
    data_dir: &Path,
    req: UpdateInstanceRequest,
) -> AppResult<Instance> {
    let clean_name = req.name.trim().to_string();
    if clean_name.is_empty() {
        return Err(AppError::Validation(
            "Название сборки не может быть пустым".into(),
        ));
    }

    let file = paths.instances_file(data_dir);
    let _guard = lock_file(&file).await;
    let mut store: InstancesStore = read_locked(&file).await?;
    let instance = store
        .instances
        .iter_mut()
        .find(|i| i.id == req.id)
        .ok_or_else(|| AppError::NotFound("Сборка не найдена".into()))?;

    instance.name = clean_name;
    // Память ограничиваем так же, как глобальную настройку: иначе импорт или
    // ручной ввод могли передать JVM бессмысленный `-Xmx`.
    instance.memory_mb_override = req.memory_mb_override.map(|value| {
        let total = crate::services::settings_service::collect_system_info(paths).total_memory_mb;
        value.clamp(
            crate::config::endpoints::MIN_MEMORY_MB,
            total.max(crate::config::endpoints::MIN_MEMORY_MB),
        )
    });
    instance.java_path_override = req
        .java_path_override
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    instance.jvm_args = req
        .jvm_args
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    instance.game_args = req
        .game_args
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    instance.loader_version = match req.loader_version.as_deref().map(str::trim) {
        Some(value) if !value.is_empty() => Some(
            sanitize_version_token(value)
                .ok_or_else(|| AppError::Validation("Некорректная версия загрузчика".into()))?,
        ),
        _ => None,
    };
    instance.auto_update_horizon = req.auto_update_horizon;

    if let Some(icon) = req.icon {
        let fallback = instance.icon.clone();
        instance.icon = sanitize_icon_id(Some(icon), &fallback);
    }
    if let Some(background) = req.background {
        let fallback = instance.background.clone();
        instance.background = sanitize_icon_id(Some(background), &fallback);
    }

    let updated = instance.clone();
    write_locked(&file, &store).await?;
    Ok(updated)
}

pub async fn delete_instance(
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
) -> AppResult<()> {
    let file = paths.instances_file(data_dir);
    {
        let _guard = lock_file(&file).await;
        let store: InstancesStore = read_locked(&file).await?;
        if !store.instances.iter().any(|i| i.id == instance_id) {
            return Err(AppError::NotFound("Сборка не найдена".into()));
        }
    }

    // Сначала удаляем папку: если файлы заняты (игра/антивирус), запись в
    // instances.json останется нетронутой и сборка не «исчезнет» из списка.
    let inst_dir = paths.instance_dir(data_dir, instance_id);
    if tokio::fs::try_exists(&inst_dir).await? {
        tokio::fs::remove_dir_all(&inst_dir).await?;
    }

    // Перечитываем список под замком: пока удалялись файлы, статистика
    // другой сборки могла обновиться.
    let _guard = lock_file(&file).await;
    let mut store: InstancesStore = read_locked(&file).await?;
    store.instances.retain(|i| i.id != instance_id);
    write_locked(&file, &store).await?;

    Ok(())
}

/// Создаёт копию сборки вместе со всеми файлами и настройками.
pub async fn duplicate_instance(
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
) -> AppResult<Instance> {
    let file = paths.instances_file(data_dir);
    let source = {
        let _guard = lock_file(&file).await;
        let store: InstancesStore = read_locked(&file).await?;
        store
            .instances
            .iter()
            .find(|i| i.id == instance_id)
            .cloned()
            .ok_or_else(|| AppError::NotFound("Сборка не найдена".into()))?
    };

    let new_id = Uuid::new_v4().to_string();
    let source_dir = paths.instance_dir(data_dir, instance_id);
    let target_dir = paths.instance_dir(data_dir, &new_id);

    if tokio::fs::try_exists(&source_dir).await? {
        copy_dir_recursive(&source_dir, &target_dir).await?;
    } else {
        tokio::fs::create_dir_all(paths.instance_game_dir(data_dir, &new_id)).await?;
    }

    let mut copy = source;
    copy.id = new_id;
    copy.name = format!("{} (копия)", copy.name);
    copy.created_at = Utc::now().to_rfc3339();
    copy.last_played_at = None;
    copy.play_time_seconds = 0;

    // Перечитываем список под замком: копирование файлов могло занять время.
    let _guard = lock_file(&file).await;
    let mut store: InstancesStore = read_locked(&file).await?;
    store.instances.push(copy.clone());
    if let Err(err) = write_locked(&file, &store).await {
        let _ = tokio::fs::remove_dir_all(&target_dir).await;
        return Err(err);
    }

    Ok(copy)
}

/// Рекурсивно копирует папку, пропуская символические ссылки.
async fn copy_dir_recursive(source: &Path, target: &Path) -> AppResult<()> {
    let mut stack = vec![(source.to_path_buf(), target.to_path_buf())];
    while let Some((from, to)) = stack.pop() {
        tokio::fs::create_dir_all(&to).await?;
        let mut entries = tokio::fs::read_dir(&from).await?;
        while let Some(entry) = entries.next_entry().await? {
            let file_type = entry.file_type().await?;
            if file_type.is_symlink() {
                continue;
            }
            let dest = to.join(entry.file_name());
            if file_type.is_dir() {
                stack.push((entry.path(), dest));
            } else {
                tokio::fs::copy(entry.path(), dest).await?;
            }
        }
    }
    Ok(())
}

pub async fn record_play_session(
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
    elapsed_seconds: u64,
) -> AppResult<()> {
    let file = paths.instances_file(data_dir);
    let _guard = lock_file(&file).await;
    let mut store: InstancesStore = read_locked(&file).await?;
    if let Some(inst) = store.instances.iter_mut().find(|i| i.id == instance_id) {
        inst.last_played_at = Some(Utc::now().to_rfc3339());
        inst.play_time_seconds = inst.play_time_seconds.saturating_add(elapsed_seconds);
        write_locked(&file, &store).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::sanitize_icon_id;

    #[test]
    fn keeps_valid_icon_ids() {
        assert_eq!(
            sanitize_icon_id(Some("  Grass_Block ".into()), "purple"),
            "grass_block"
        );
        assert_eq!(
            sanitize_icon_id(Some("dark-gray".into()), "purple"),
            "dark-gray"
        );
    }

    #[test]
    fn rejects_paths_and_empty_ids() {
        assert_eq!(
            sanitize_icon_id(Some("../secret".into()), "purple"),
            "purple"
        );
        assert_eq!(sanitize_icon_id(Some("  ".into()), "purple"), "purple");
        assert_eq!(sanitize_icon_id(None, "purple"), "purple");
        assert_eq!(sanitize_icon_id(Some("a".repeat(64)), "purple"), "purple");
    }
}
