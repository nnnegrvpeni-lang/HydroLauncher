use crate::config::endpoints::{horizon_release_by_tag_url, HORIZON_RELEASES_API_URL};
use crate::error::{AppError, AppResult};
use crate::models::events::LaunchProgressEvent;
use crate::models::mojang::{VersionDetails, VersionSummary};
use crate::services::downloader::{download_file, get_json_cached};
use crate::storage::paths::{sanitize_tag, AppPaths};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    name: Option<String>,
    published_at: Option<String>,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HorizonReleaseSummary {
    pub tag_name: String,
    pub name: String,
    pub published_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
    updated_at: Option<String>,
}

#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct HorizonMeta {
    tag_name: String,
    updated_at: Option<String>,
    asset_size: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HorizonUpdateInfo {
    pub installed: bool,
    pub update_available: bool,
    pub tag_name: String,
    /// Тег локально распакованных бинарников (None, если ничего не установлено).
    pub installed_tag: Option<String>,
    pub current_updated_at: Option<String>,
    pub latest_updated_at: Option<String>,
}

/// Тег по умолчанию: плавающий nightly-релиз движка.
const DEFAULT_HORIZON_TAG: &str = "nightly";

/// Возвращает реальный тег релиза: пустое значение означает nightly.
pub fn effective_tag(tag: Option<&str>) -> String {
    tag.map(str::trim)
        .filter(|t| !t.is_empty())
        .unwrap_or(DEFAULT_HORIZON_TAG)
        .to_string()
}

fn client_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "horizon-client.exe"
    } else {
        "horizon-client"
    }
}

fn prepare_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "horizon-prepare.exe"
    } else {
        "horizon-prepare"
    }
}

fn expected_archive_name() -> AppResult<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => Ok("horizon-windows-x64.zip"),
        ("macos", "aarch64") => Ok("horizon-macos-arm64.zip"),
        ("macos", "x86_64") => Ok("horizon-macos-x64.zip"),
        ("linux", "x86_64") => Ok("horizon-linux-x86_64.tar.gz"),
        (os, arch) => Err(AppError::Validation(format!(
            "Horizon пока не поддерживает платформу {os}/{arch}"
        ))),
    }
}

fn emit_progress(app: &AppHandle, instance_id: &str, stage: &str, message: &str, current: u64, total: u64) {
    let percent = if total == 0 {
        0.0
    } else {
        (current as f64 / total as f64) * 100.0
    };
    let _ = app.emit(
        "launch://progress",
        LaunchProgressEvent {
            instance_id: instance_id.to_string(),
            stage: stage.to_string(),
            message: message.to_string(),
            current,
            total,
            percent,
        },
    );
}

fn find_binary_in_dir(dir: &Path, binary_name: &str) -> Option<PathBuf> {
    let direct = dir.join(binary_name);
    if direct.is_file() {
        return Some(direct);
    }
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_binary_in_dir(&path, binary_name) {
                return Some(found);
            }
        }
    }
    None
}

/// Переносит старую однослотовую раскладку (`bin/*`, `horizon-meta.json`,
/// `prepared/<mc>`) в раскладку по тегам. Выполняется один раз при апгрейде.
fn migrate_legacy_layout(paths: &AppPaths, data_dir: &Path) {
    let legacy_meta = paths.horizon_dir(data_dir).join("horizon-meta.json");
    if !legacy_meta.exists() {
        return;
    }

    let legacy_tag = std::fs::read(&legacy_meta)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<HorizonMeta>(&bytes).ok())
        .map(|meta| meta.tag_name)
        .filter(|tag| !tag.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_HORIZON_TAG.to_string());

    let bin_dir = paths.horizon_bin_dir(data_dir);
    let target_bin = paths.horizon_bin_tag_dir(data_dir, &legacy_tag);
    if bin_dir.exists() && !target_bin.exists() {
        if let Ok(read_dir) = std::fs::read_dir(&bin_dir) {
            let children: Vec<PathBuf> = read_dir.flatten().map(|entry| entry.path()).collect();
            if !children.is_empty() && std::fs::create_dir_all(&target_bin).is_ok() {
                for child in children {
                    let Some(name) = child.file_name().map(|n| n.to_owned()) else {
                        continue;
                    };
                    let dest = target_bin.join(name);
                    if !dest.exists() {
                        let _ = std::fs::rename(&child, &dest);
                    }
                }
            }
        }
    }

    let legacy_meta_target = paths.horizon_meta_file(data_dir, &legacy_tag);
    if !legacy_meta_target.exists() {
        if let Some(parent) = legacy_meta_target.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::rename(&legacy_meta, &legacy_meta_target);
    } else {
        let _ = std::fs::remove_file(&legacy_meta);
    }

    migrate_legacy_prepared(paths, data_dir, &legacy_tag);
}

/// Старая раскладка хранила подготовленные ресурсы в `prepared/<mc>/`.
/// Новая — в `prepared/<mc>/<tag>/`.
fn migrate_legacy_prepared(paths: &AppPaths, data_dir: &Path, legacy_tag: &str) {
    let prepared_root = paths.horizon_dir(data_dir).join("prepared");
    let Ok(mc_entries) = std::fs::read_dir(&prepared_root) else {
        return;
    };

    for entry in mc_entries.flatten() {
        let mc_path = entry.path();
        if !mc_path.is_dir() {
            continue;
        }
        let target = mc_path.join(sanitize_tag(legacy_tag));
        if target.exists() {
            continue;
        }
        let Ok(children) = std::fs::read_dir(&mc_path) else {
            continue;
        };
        let children: Vec<PathBuf> = children.flatten().map(|child| child.path()).collect();
        if children.is_empty() {
            continue;
        }
        if std::fs::create_dir_all(&target).is_err() {
            continue;
        }
        for child in children {
            let Some(name) = child.file_name().map(|n| n.to_owned()) else {
                continue;
            };
            let dest = target.join(name);
            if !dest.exists() {
                let _ = std::fs::rename(&child, &dest);
            }
        }
    }
}

pub fn resolve_horizon_binaries(
    paths: &AppPaths,
    data_dir: &Path,
    tag: Option<&str>,
) -> Option<(PathBuf, PathBuf)> {
    migrate_legacy_layout(paths, data_dir);
    let bin_dir = paths.horizon_bin_tag_dir(data_dir, &effective_tag(tag));
    let client = find_binary_in_dir(&bin_dir, client_binary_name())?;
    let prepare = find_binary_in_dir(&bin_dir, prepare_binary_name())?;
    Some((client, prepare))
}

pub async fn list_horizon_releases() -> AppResult<Vec<HorizonReleaseSummary>> {
    let archive_name = expected_archive_name()?;
    let client = crate::services::downloader::build_client()?;
    let releases: Vec<GitHubRelease> =
        crate::services::downloader::get_json_cached(&client, HORIZON_RELEASES_API_URL).await?;
    Ok(releases
        .into_iter()
        .filter(|r| {
            r.tag_name.starts_with("nightly")
                && r.assets.iter().any(|a| a.name == archive_name)
        })
        .map(|r| HorizonReleaseSummary {
            name: r.name.unwrap_or_else(|| r.tag_name.clone()),
            tag_name: r.tag_name,
            published_at: r.published_at,
        })
        .collect())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledHorizonBinary {
    pub tag_name: String,
    pub updated_at: Option<String>,
    pub asset_size: u64,
}

/// Возвращает теги движка, бинарники которых реально лежат на диске.
pub async fn list_installed_horizon_binaries(
    paths: &AppPaths,
    data_dir: &Path,
) -> AppResult<Vec<InstalledHorizonBinary>> {
    migrate_legacy_layout(paths, data_dir);
    let meta_dir = paths.horizon_meta_dir(data_dir);
    let mut entries = match tokio::fs::read_dir(&meta_dir).await {
        Ok(entries) => entries,
        Err(_) => return Ok(Vec::new()),
    };

    let mut installed = Vec::new();
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let meta = match crate::storage::json_store::read_json_or_default::<HorizonMeta>(&path).await {
            Ok(meta) if !meta.tag_name.trim().is_empty() => meta,
            _ => continue,
        };
        if resolve_horizon_binaries(paths, data_dir, Some(&meta.tag_name)).is_none() {
            continue;
        }
        installed.push(InstalledHorizonBinary {
            tag_name: meta.tag_name,
            updated_at: meta.updated_at,
            asset_size: meta.asset_size,
        });
    }

    Ok(installed)
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HorizonCleanupResult {
    pub removed_tags: Vec<String>,
    pub freed_bytes: u64,
}

/// Удаляет бинарники и подготовленные ресурсы Horizon, которые не использует
/// ни одна сборка. Возвращает освобождённое место.
pub async fn cleanup_unused_horizon(
    paths: &AppPaths,
    data_dir: &Path,
    used_tags: &[String],
) -> AppResult<HorizonCleanupResult> {
    use std::collections::HashSet;

    let used: HashSet<String> = used_tags
        .iter()
        .map(|tag| crate::storage::paths::sanitize_tag(tag))
        .collect();

    let mut removed_tags: Vec<String> = Vec::new();
    let mut freed_bytes = 0u64;

    if let Ok(mut entries) = tokio::fs::read_dir(paths.horizon_meta_dir(data_dir)).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let meta_path = entry.path();
            if meta_path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                continue;
            }
            let Ok(meta) =
                crate::storage::json_store::read_json_or_default::<HorizonMeta>(&meta_path).await
            else {
                continue;
            };
            let tag = meta.tag_name.trim().to_string();
            if tag.is_empty() {
                continue;
            }
            let safe = crate::storage::paths::sanitize_tag(&tag);
            if used.contains(&safe) {
                continue;
            }

            let bin_dir = paths.horizon_bin_tag_dir(data_dir, &safe);
            freed_bytes += directory_size(&bin_dir).await;
            let _ = tokio::fs::remove_dir_all(&bin_dir).await;

            if let Ok(meta_info) = tokio::fs::metadata(&meta_path).await {
                freed_bytes += meta_info.len();
            }
            let _ = tokio::fs::remove_file(&meta_path).await;
            removed_tags.push(tag);
        }
    }

    // prepared/<версия>/<тег>
    let prepared_root = paths.horizon_dir(data_dir).join("prepared");
    if let Ok(mut versions) = tokio::fs::read_dir(&prepared_root).await {
        while let Ok(Some(version_entry)) = versions.next_entry().await {
            let version_dir = version_entry.path();
            if !version_dir.is_dir() {
                continue;
            }
            let Ok(mut tag_dirs) = tokio::fs::read_dir(&version_dir).await else {
                continue;
            };
            let mut kept_any = false;
            while let Ok(Some(tag_entry)) = tag_dirs.next_entry().await {
                let tag_dir = tag_entry.path();
                if !tag_dir.is_dir() {
                    kept_any = true;
                    continue;
                }
                let tag_name = tag_entry.file_name().to_string_lossy().to_string();
                if used.contains(&tag_name) {
                    kept_any = true;
                    continue;
                }
                freed_bytes += directory_size(&tag_dir).await;
                if tokio::fs::remove_dir_all(&tag_dir).await.is_ok()
                    && !removed_tags
                        .iter()
                        .any(|tag| crate::storage::paths::sanitize_tag(tag) == tag_name)
                {
                    removed_tags.push(tag_name);
                }
            }
            if !kept_any {
                let _ = tokio::fs::remove_dir(&version_dir).await;
            }
        }
    }

    Ok(HorizonCleanupResult {
        removed_tags,
        freed_bytes,
    })
}

/// Размер папки без перехода по символическим ссылкам.
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

pub async fn ensure_horizon_binaries(
    app: &AppHandle,
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
    preferred_tag: Option<&str>,
    auto_update: bool,
) -> AppResult<(PathBuf, PathBuf)> {
    let pinned = preferred_tag.map(str::trim).filter(|t| !t.is_empty()).is_some();
    let tag = effective_tag(preferred_tag);

    if let Some(pair) = resolve_horizon_binaries(paths, data_dir, Some(&tag)) {
        if pinned || !auto_update {
            return Ok(pair);
        }
        match check_horizon_update(paths, data_dir, Some(DEFAULT_HORIZON_TAG)).await {
            Ok(info) if !info.update_available => return Ok(pair),
            Err(_) => return Ok(pair),
            _ => {}
        }
    }
    download_horizon_binaries(app, paths, data_dir, instance_id, Some(&tag)).await
}

pub async fn check_horizon_update(
    paths: &AppPaths,
    data_dir: &Path,
    tag: Option<&str>,
) -> AppResult<HorizonUpdateInfo> {
    let tag = effective_tag(tag);
    let installed = resolve_horizon_binaries(paths, data_dir, Some(&tag)).is_some();
    let meta_path = paths.horizon_meta_file(data_dir, &tag);
    let local_meta: Option<HorizonMeta> = if meta_path.exists() {
        crate::storage::json_store::read_json_or_default(&meta_path)
            .await
            .ok()
    } else {
        None
    };

    let client = crate::services::downloader::build_client()?;
    let release_url = horizon_release_by_tag_url(&tag);
    let release: GitHubRelease = get_json_cached(&client, &release_url).await?;
    let archive_name = expected_archive_name()?;
    let asset = release.assets.iter().find(|a| a.name == archive_name);
    let latest_updated = asset
        .and_then(|a| a.updated_at.clone())
        .or_else(|| release.published_at.clone());
    let latest_size = asset.map(|a| a.size).unwrap_or(0);

    let current_updated = local_meta.as_ref().and_then(|m| m.updated_at.clone());
    let update_available = if !installed {
        true
    } else if let Some(ref meta) = local_meta {
        meta.tag_name != release.tag_name
            || meta.updated_at != latest_updated
            || (latest_size > 0 && meta.asset_size != latest_size)
    } else {
        true
    };

    Ok(HorizonUpdateInfo {
        installed,
        update_available,
        tag_name: release.tag_name,
        installed_tag: local_meta.map(|meta| meta.tag_name),
        current_updated_at: current_updated,
        latest_updated_at: latest_updated,
    })
}

pub async fn update_horizon_binaries(
    app: &AppHandle,
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
    tag: Option<&str>,
) -> AppResult<HorizonUpdateInfo> {
    let clean_tag = tag.map(str::trim).filter(|t| !t.is_empty());
    download_horizon_binaries(app, paths, data_dir, instance_id, clean_tag).await?;
    check_horizon_update(paths, data_dir, clean_tag).await
}

async fn download_horizon_binaries(
    app: &AppHandle,
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
    tag: Option<&str>,
) -> AppResult<(PathBuf, PathBuf)> {
    let tag = effective_tag(tag);

    emit_progress(
        app,
        instance_id,
        "horizon",
        "Получение информации о релизе Horizon…",
        0,
        1,
    );

    let client = crate::services::downloader::build_client()?;

    let release_url = horizon_release_by_tag_url(&tag);
    let release: GitHubRelease = get_json_cached(&client, &release_url).await?;
    let archive_name = expected_archive_name()?;
    let asset = release
        .assets
        .iter()
        .find(|a| a.name == archive_name)
        .ok_or_else(|| {
            AppError::NotFound(format!(
                "В релизе Horizon '{}' не найден архив {}",
                release.tag_name, archive_name
            ))
        })?;

    let bin_dir = paths.horizon_bin_tag_dir(data_dir, &release.tag_name);
    if bin_dir.exists() {
        let _ = tokio::fs::remove_dir_all(&bin_dir).await;
    }
    tokio::fs::create_dir_all(&bin_dir).await?;

    let archive_path = paths.horizon_dir(data_dir).join(archive_name);
    emit_progress(
        app,
        instance_id,
        "horizon",
        &format!(
            "Скачивание Horizon ({}, {:.1} МБ)…",
            release.tag_name,
            asset.size as f64 / (1024.0 * 1024.0)
        ),
        0,
        1,
    );

    download_file(&client, &asset.browser_download_url, &archive_path, None).await?;

    emit_progress(
        app,
        instance_id,
        "horizon",
        "Распаковка движка Horizon…",
        1,
        2,
    );

    let archive_clone = archive_path.clone();
    let dest_clone = bin_dir.clone();
    tokio::task::spawn_blocking(move || extract_archive(&archive_clone, &dest_clone))
        .await
        .map_err(|e| AppError::Custom(format!("Ошибка распаковки Horizon: {e}")))??;

    let _ = tokio::fs::remove_file(&archive_path).await;

    let meta = HorizonMeta {
        tag_name: release.tag_name.clone(),
        updated_at: asset.updated_at.clone().or(release.published_at.clone()),
        asset_size: asset.size,
    };
    let meta_path = paths.horizon_meta_file(data_dir, &release.tag_name);
    if let Some(parent) = meta_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let _ = crate::storage::json_store::write_json_atomic(&meta_path, &meta).await;

    emit_progress(app, instance_id, "horizon", "Движок Horizon установлен", 1, 1);

    resolve_horizon_binaries(paths, data_dir, Some(&release.tag_name)).ok_or_else(|| {
        AppError::NotFound("После распаковки не найдены бинарники horizon-client / horizon-prepare".into())
    })
}

fn extract_archive(archive_path: &Path, dest_dir: &Path) -> AppResult<()> {
    let name = archive_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    if name.ends_with(".zip") {
        let file = std::fs::File::open(archive_path)?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| AppError::Custom(format!("Не удалось открыть ZIP Horizon: {e}")))?;
        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| AppError::Custom(format!("Ошибка чтения ZIP Horizon: {e}")))?;
            let Some(rel_path) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
                continue;
            };
            let out_path = dest_dir.join(rel_path);
            if entry.is_dir() {
                std::fs::create_dir_all(&out_path)?;
            } else {
                if let Some(parent) = out_path.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                let mut out_file = std::fs::File::create(&out_path)?;
                std::io::copy(&mut entry, &mut out_file)?;
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if let Some(mode) = entry.unix_mode() {
                        let _ = std::fs::set_permissions(&out_path, std::fs::Permissions::from_mode(mode));
                    }
                }
            }
        }
    } else if name.ends_with(".tar.gz") {
        let file = std::fs::File::open(archive_path)?;
        let gz = flate2::read::GzDecoder::new(file);
        let mut archive = tar::Archive::new(gz);
        archive.unpack(dest_dir)?;
    } else {
        return Err(AppError::Validation(format!(
            "Неподдерживаемый формат архива Horizon: {name}"
        )));
    }

    Ok(())
}

pub async fn is_horizon_prepared(prepare_bin: &Path, prepared_dir: &Path) -> bool {
    if !prepared_dir.exists() {
        return false;
    }
    let prepare_root = prepare_bin
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| prepared_dir.to_path_buf());
    Command::new(prepare_bin)
        .arg("--check")
        .arg("--output")
        .arg(prepared_dir)
        .current_dir(&prepare_root)
        .output()
        .await
        .map(|out| out.status.success())
        .unwrap_or(false)
}

pub async fn ensure_horizon_prepared(
    app: &AppHandle,
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
    details: &VersionDetails,
    summary: &VersionSummary,
    prepare_bin: &Path,
    tag: Option<&str>,
    java_exec: &str,
) -> AppResult<PathBuf> {
    let tag = effective_tag(tag);
    let prepared_dir = paths.horizon_prepared_dir(data_dir, &details.id, &tag);
    let prepare_root = prepare_bin
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| paths.horizon_bin_tag_dir(data_dir, &tag));

    // Быстрая проверка: если ресурсы уже подготовлены под эту версию horizon-prepare
    if prepared_dir.exists() {
        let check = Command::new(prepare_bin)
            .arg("--check")
            .arg("--output")
            .arg(&prepared_dir)
            .current_dir(&prepare_root)
            .output()
            .await;
        if let Ok(out) = check {
            if out.status.success() {
                return Ok(prepared_dir);
            }
        }
    }

    tokio::fs::create_dir_all(&prepared_dir).await?;

    let client = crate::services::downloader::build_client()?;

    // horizon-prepare проверяет точный SHA-1 оригинального <version>.json от Mojang
    let version_dir = paths.version_dir(data_dir, &details.id);
    let version_json = version_dir.join(format!("{}.json", details.id));
    download_file(&client, &summary.url, &version_json, summary.sha1.as_deref()).await?;

    // Для первой подготовки horizon-prepare требуется server.jar версии 26.3
    let server_jar = version_dir.join("server.jar");
    let server_dl = details.downloads.server.as_ref().ok_or_else(|| {
        AppError::NotFound(format!(
            "В манифесте версии {} отсутствует ссылка на server.jar",
            details.id
        ))
    })?;
    if !tokio::fs::try_exists(&server_jar).await.unwrap_or(false) {
        emit_progress(
            app,
            instance_id,
            "horizon-prepare",
            "Скачивание server.jar для подготовки ресурсов Horizon…",
            0,
            1,
        );
    }
    download_file(&client, &server_dl.url, &server_jar, Some(&server_dl.sha1)).await?;

    let client_jar = version_dir.join(format!("{}.jar", details.id));
    let libraries_dir = paths.libraries_dir(data_dir);
    let assets_dir = paths.assets_dir(data_dir);

    let mut cmd = Command::new(prepare_bin);
    cmd.current_dir(&prepare_root)
        .arg("--prepare")
        .arg("--output")
        .arg(&prepared_dir)
        .arg("--complete")
        .arg("--progress")
        .arg("json")
        .arg("--version-json")
        .arg(&version_json)
        .arg("--client-jar")
        .arg(&client_jar)
        .arg("--libraries-dir")
        .arg(&libraries_dir)
        .arg("--assets-dir")
        .arg(&assets_dir)
        .arg("--server-jar")
        .arg(&server_jar);

    if let Some(java_home) = Path::new(java_exec).parent().and_then(|p| p.parent()) {
        cmd.arg("--java-home").arg(java_home);
    }

    emit_progress(
        app,
        instance_id,
        "horizon-prepare",
        "Подготовка ресурсов Minecraft 26.3 для Horizon…",
        0,
        100,
    );

    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Process(format!("Не удалось запустить horizon-prepare: {e}")))?;

    let stderr_handle = child.stderr.take().map(|stderr| {
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            let mut buf = Vec::new();
            while let Ok(Some(line)) = lines.next_line().await {
                if !line.trim().is_empty() {
                    buf.push(line);
                }
            }
            buf.join("\n")
        })
    });

    let mut last_error: Option<String> = None;
    if let Some(stdout) = child.stdout.take() {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                if let Some(err) = val.get("error").and_then(|v| v.as_str()) {
                    last_error = Some(err.to_string());
                } else if let Some(frac) = val.get("fraction").and_then(|v| v.as_f64()) {
                    let pct = (frac.clamp(0.0, 1.0) * 100.0).round() as u64;
                    emit_progress(
                        app,
                        instance_id,
                        "horizon-prepare",
                        "Подготовка ресурсов Horizon…",
                        pct,
                        100,
                    );
                } else if let Some(msg) = val.get("message").and_then(|v| v.as_str()) {
                    emit_progress(app, instance_id, "horizon-prepare", msg, 50, 100);
                }
            }
        }
    }

    let stderr_text = match stderr_handle {
        Some(h) => h.await.unwrap_or_default(),
        None => String::new(),
    };

    let status = child
        .wait()
        .await
        .map_err(|e| AppError::Process(format!("Ошибка ожидания horizon-prepare: {e}")))?;

    if !status.success() {
        let err_msg = last_error
            .or_else(|| (!stderr_text.is_empty()).then_some(stderr_text))
            .unwrap_or_else(|| format!("horizon-prepare завершился с кодом {:?}", status.code()));
        return Err(AppError::Process(err_msg));
    }

    emit_progress(
        app,
        instance_id,
        "done",
        "Ресурсы Horizon готовы к запуску",
        100,
        100,
    );

    Ok(prepared_dir)
}
