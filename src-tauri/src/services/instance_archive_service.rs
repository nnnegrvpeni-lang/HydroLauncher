use crate::error::{AppError, AppResult};
use crate::models::events::LaunchProgressEvent;
use crate::models::instance::{
    CreateInstanceRequest, EngineKind, Instance, ModLoaderKind, UpdateInstanceRequest,
};
use crate::services::instance_service;
use crate::storage::paths::AppPaths;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Emitter};

const ARCHIVE_FORMAT: u32 = 1;
const MANIFEST_NAME: &str = "hydro-instance.json";
const GAME_PREFIX: &str = "game";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedInstanceArchive {
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstanceArchiveManifest {
    format: u32,
    name: String,
    minecraft_version: String,
    engine: EngineKind,
    loader: ModLoaderKind,
    loader_version: Option<String>,
    memory_mb_override: Option<u64>,
    java_path_override: Option<String>,
    #[serde(default)]
    jvm_args: Vec<String>,
}

#[derive(Debug, Clone)]
struct ArchiveFile {
    archive_path: String,
    source: PathBuf,
    size: u64,
}

/// Что складываем в полный архив: миры, моды и конфиги, без логов и скриншотов.
fn collect_archive_files(game_dir: &Path) -> Vec<ArchiveFile> {
    let mut files = Vec::new();

    for dir in [
        "mods",
        "config",
        "defaultconfigs",
        "saves",
        "resourcepacks",
        "shaderpacks",
        "horizon-mods",
        "horizon-native-mods",
    ] {
        let root = game_dir.join(dir);
        if !root.is_dir() {
            continue;
        }
        let mut stack = vec![(root, dir.to_string())];
        while let Some((current, prefix)) = stack.pop() {
            let Ok(entries) = std::fs::read_dir(&current) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                let Ok(file_type) = entry.file_type() else {
                    continue;
                };
                if file_type.is_symlink() {
                    continue;
                }
                let name = entry.file_name().to_string_lossy().to_string();
                let relative = format!("{prefix}/{name}");
                if file_type.is_dir() {
                    stack.push((path, relative));
                } else if let Ok(meta) = entry.metadata() {
                    files.push(ArchiveFile {
                        archive_path: format!("{GAME_PREFIX}/{relative}"),
                        source: path,
                        size: meta.len(),
                    });
                }
            }
        }
    }

    for name in ["options.txt", "servers.dat"] {
        let path = game_dir.join(name);
        if path.is_file() {
            if let Ok(meta) = std::fs::metadata(&path) {
                files.push(ArchiveFile {
                    archive_path: format!("{GAME_PREFIX}/{name}"),
                    source: path,
                    size: meta.len(),
                });
            }
        }
    }

    files.sort_by(|a, b| a.archive_path.cmp(&b.archive_path));
    files
}

/// Уже сжатые файлы не тратим время на повторное deflate.
fn already_compressed(path: &Path) -> bool {
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(
        extension.as_str(),
        "jar" | "zip" | "png" | "jpg" | "jpeg" | "webp" | "ogg" | "mca" | "mcr" | "hnmod" | "hmod"
            | "hshader" | "gz" | "xz" | "zst"
    )
}

fn write_archive(
    target: &Path,
    manifest: &[u8],
    files: &[ArchiveFile],
    on_progress: impl Fn(u64, u64, &str),
) -> AppResult<()> {
    use zip::write::SimpleFileOptions;

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let output = std::fs::File::create(target)?;
    let mut zip = zip::ZipWriter::new(output);

    zip.start_file(
        MANIFEST_NAME,
        SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated),
    )?;
    zip.write_all(manifest)?;

    let total: u64 = files.iter().map(|file| file.size).sum::<u64>().max(1);
    let mut done = 0u64;
    for (index, file) in files.iter().enumerate() {
        let method = if already_compressed(&file.source) {
            zip::CompressionMethod::Stored
        } else {
            zip::CompressionMethod::Deflated
        };
        zip.start_file(
            file.archive_path.clone(),
            SimpleFileOptions::default().compression_method(method),
        )?;
        let mut input = std::fs::File::open(&file.source)?;
        std::io::copy(&mut input, &mut zip)?;
        done = done.saturating_add(file.size);
        if index % 16 == 0 || index + 1 == files.len() {
            on_progress(done, total, &file.archive_path);
        }
    }

    zip.finish()?;
    Ok(())
}

pub async fn export_instance(
    app: &AppHandle,
    paths: &AppPaths,
    data_dir: &Path,
    instance: &Instance,
    target: &Path,
) -> AppResult<ExportedInstanceArchive> {
    let game_dir = paths.instance_game_dir(data_dir, &instance.id);
    let files = collect_archive_files(&game_dir);
    let manifest = InstanceArchiveManifest {
        format: ARCHIVE_FORMAT,
        name: instance.name.clone(),
        minecraft_version: instance.minecraft_version.clone(),
        engine: instance.engine,
        loader: instance.loader,
        loader_version: instance.loader_version.clone(),
        memory_mb_override: instance.memory_mb_override,
        java_path_override: instance.java_path_override.clone(),
        jvm_args: instance.jvm_args.clone(),
    };
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)?;

    let target_owned = target.to_path_buf();
    let app_for_task = app.clone();
    let instance_id = instance.id.clone();
    let written = tokio::task::spawn_blocking(move || {
        write_archive(&target_owned, &manifest_bytes, &files, |done, total, name| {
            let percent = if total == 0 {
                0.0
            } else {
                (done as f64 / total as f64) * 100.0
            };
            let relative = name.trim_start_matches("game/");
            let _ = app_for_task.emit(
                "launch://progress",
                LaunchProgressEvent {
                    instance_id: instance_id.clone(),
                    stage: "archive".to_string(),
                    message: format!("Экспорт сборки: {relative}"),
                    current: done,
                    total,
                    percent,
                },
            );
        })
    })
    .await
    .map_err(|e| AppError::Process(format!("Не удалось экспортировать сборку: {e}")))?;

    if let Err(err) = written {
        let _ = tokio::fs::remove_file(target).await;
        return Err(err);
    }

    let size_bytes = tokio::fs::metadata(target).await?.len();
    Ok(ExportedInstanceArchive {
        path: target.to_string_lossy().into_owned(),
        size_bytes,
    })
}

fn extract_game_files(
    mut archive: zip::ZipArchive<std::fs::File>,
    game_dir: &Path,
    on_progress: impl Fn(usize, usize),
) -> AppResult<()> {
    let total = archive.len();
    for index in 0..total {
        let mut entry = archive.by_index(index)?;
        let Some(relative) = entry.enclosed_name() else {
            continue;
        };

        let mut components = relative.components();
        let is_game = matches!(
            components.next(),
            Some(Component::Normal(name)) if name == std::ffi::OsStr::new(GAME_PREFIX)
        );
        if !is_game {
            continue;
        }
        let rest: PathBuf = components.collect();
        if rest.as_os_str().is_empty() {
            continue;
        }

        let out_path = game_dir.join(&rest);
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

        if index % 16 == 0 || index + 1 == total {
            on_progress(index + 1, total);
        }
    }
    Ok(())
}

async fn unique_name(paths: &AppPaths, data_dir: &Path, base: &str) -> AppResult<String> {
    let existing: HashSet<String> = instance_service::load_instances(paths, data_dir)
        .await?
        .into_iter()
        .map(|instance| instance.name.to_lowercase())
        .collect();

    let base = base.trim();
    let base: String = if base.is_empty() {
        "Импорт".to_string()
    } else {
        base.chars().take(80).collect()
    };
    if !existing.contains(&base.to_lowercase()) {
        return Ok(base);
    }

    for index in 2..1000 {
        let candidate = if index == 2 {
            format!("{base} (импорт)")
        } else {
            format!("{base} (импорт {index})")
        };
        if !existing.contains(&candidate.to_lowercase()) {
            return Ok(candidate);
        }
    }
    Err(AppError::Validation(
        "Слишком много сборок с одинаковым названием".into(),
    ))
}

pub async fn import_instance(
    app: &AppHandle,
    paths: &AppPaths,
    data_dir: &Path,
    source: &Path,
) -> AppResult<Instance> {
    if !source.is_file() {
        return Err(AppError::NotFound("Архив сборки не найден".into()));
    }

    let file = std::fs::File::open(source)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| AppError::Validation(format!("Некорректный архив сборки: {e}")))?;

    let manifest: InstanceArchiveManifest = {
        let mut entry = archive.by_name(MANIFEST_NAME).map_err(|_| {
            AppError::Validation("В архиве нет hydro-instance.json — это не экспорт HydroLauncher".into())
        })?;
        if entry.size() > 1024 * 1024 {
            return Err(AppError::Validation("Манифест сборки слишком большой".into()));
        }
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes)?;
        serde_json::from_slice(&bytes)
            .map_err(|e| AppError::Validation(format!("Некорректный манифест сборки: {e}")))?
    };

    if manifest.format != ARCHIVE_FORMAT {
        return Err(AppError::Validation(
            "Неподдерживаемая версия архива сборки".into(),
        ));
    }
    if manifest.minecraft_version.trim().is_empty() {
        return Err(AppError::Validation(
            "В манифесте не указана версия Minecraft".into(),
        ));
    }

    let name = unique_name(paths, data_dir, &manifest.name).await?;
    let created = instance_service::create_instance(
        paths,
        data_dir,
        CreateInstanceRequest {
            name,
            minecraft_version: manifest.minecraft_version.clone(),
            engine: manifest.engine,
            loader: manifest.loader,
            loader_version: manifest.loader_version.clone(),
        },
    )
    .await?;

    let updated = instance_service::update_instance(
        paths,
        data_dir,
        UpdateInstanceRequest {
            id: created.id.clone(),
            name: created.name.clone(),
            memory_mb_override: manifest.memory_mb_override,
            java_path_override: manifest.java_path_override,
            jvm_args: manifest.jvm_args,
            loader_version: manifest.loader_version,
            auto_update_horizon: true,
        },
    )
    .await
    .unwrap_or(created);

    let game_dir = paths.instance_game_dir(data_dir, &updated.id);
    let app_for_task = app.clone();
    let instance_id = updated.id.clone();
    let extracted = tokio::task::spawn_blocking(move || {
        extract_game_files(archive, &game_dir, |done, total| {
            let percent = if total == 0 {
                0.0
            } else {
                (done as f64 / total as f64) * 100.0
            };
            let _ = app_for_task.emit(
                "launch://progress",
                LaunchProgressEvent {
                    instance_id: instance_id.clone(),
                    stage: "archive".to_string(),
                    message: "Импорт сборки…".to_string(),
                    current: done as u64,
                    total: total as u64,
                    percent,
                },
            );
        })
    })
    .await
    .map_err(|e| AppError::Process(format!("Не удалось распаковать сборку: {e}")))?;

    if let Err(err) = extracted {
        let _ = instance_service::delete_instance(paths, data_dir, &updated.id).await;
        return Err(err);
    }

    Ok(updated)
}

#[cfg(test)]
mod tests {
    use super::already_compressed;
    use std::path::Path;

    #[test]
    fn detects_already_compressed_files() {
        assert!(already_compressed(Path::new("mod.jar")));
        assert!(already_compressed(Path::new("icon.PNG")));
        assert!(already_compressed(Path::new("region.mca")));
        assert!(!already_compressed(Path::new("options.txt")));
        assert!(!already_compressed(Path::new("config.json")));
    }
}
