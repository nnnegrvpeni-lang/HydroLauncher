use crate::error::{AppError, AppResult};
use crate::models::instance::{
    CreateInstanceRequest, Instance, InstancesStore, UpdateInstanceRequest,
};
use crate::storage::json_store::{read_json_or_default, write_json_atomic};
use crate::storage::paths::AppPaths;
use chrono::Utc;
use std::path::Path;
use uuid::Uuid;

pub async fn load_instances(paths: &AppPaths, data_dir: &Path) -> AppResult<Vec<Instance>> {
    let store: InstancesStore = read_json_or_default(&paths.instances_file(data_dir)).await?;
    Ok(store.instances)
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

    let mut store: InstancesStore = read_json_or_default(&paths.instances_file(data_dir)).await?;

    let id = Uuid::new_v4().to_string();
    let game_dir = paths.instance_game_dir(data_dir, &id);
    tokio::fs::create_dir_all(&game_dir).await?;

    let instance = Instance {
        id,
        name: clean_name,
        minecraft_version: req.minecraft_version.trim().to_string(),
        engine: req.engine,
        loader: req.loader,
        loader_version: req.loader_version,
        auto_update_horizon: true,
        memory_mb_override: None,
        java_path_override: None,
        jvm_args: Vec::new(),
        game_args: Vec::new(),
        created_at: Utc::now().to_rfc3339(),
        last_played_at: None,
        play_time_seconds: 0,
    };

    store.instances.push(instance.clone());
    write_json_atomic(&paths.instances_file(data_dir), &store).await?;
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

    let mut store: InstancesStore = read_json_or_default(&paths.instances_file(data_dir)).await?;
    let instance = store
        .instances
        .iter_mut()
        .find(|i| i.id == req.id)
        .ok_or_else(|| AppError::NotFound("Сборка не найдена".into()))?;

    instance.name = clean_name;
    instance.memory_mb_override = req.memory_mb_override;
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
    instance.loader_version = req
        .loader_version
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    instance.auto_update_horizon = req.auto_update_horizon;

    let updated = instance.clone();
    write_json_atomic(&paths.instances_file(data_dir), &store).await?;
    Ok(updated)
}

pub async fn delete_instance(
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
) -> AppResult<()> {
    let mut store: InstancesStore = read_json_or_default(&paths.instances_file(data_dir)).await?;
    let initial_len = store.instances.len();
    store.instances.retain(|i| i.id != instance_id);

    if store.instances.len() == initial_len {
        return Err(AppError::NotFound("Сборка не найдена".into()));
    }

    write_json_atomic(&paths.instances_file(data_dir), &store).await?;

    let inst_dir = paths.instance_dir(data_dir, instance_id);
    if tokio::fs::try_exists(&inst_dir).await? {
        tokio::fs::remove_dir_all(&inst_dir).await?;
    }

    Ok(())
}

pub async fn record_play_session(
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
    elapsed_seconds: u64,
) -> AppResult<()> {
    let mut store: InstancesStore = read_json_or_default(&paths.instances_file(data_dir)).await?;
    if let Some(inst) = store.instances.iter_mut().find(|i| i.id == instance_id) {
        inst.last_played_at = Some(Utc::now().to_rfc3339());
        inst.play_time_seconds = inst.play_time_seconds.saturating_add(elapsed_seconds);
        write_json_atomic(&paths.instances_file(data_dir), &store).await?;
    }
    Ok(())
}
