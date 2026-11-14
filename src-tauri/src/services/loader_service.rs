use crate::config::endpoints::{
    FABRIC_META_BASE_URL, FORGE_MAVEN_BASE_URL, FORGE_PROMOTIONS_URL, MAVEN_CENTRAL_URL,
    NEOFORGE_MAVEN_BASE_URL, NEOFORGE_VERSIONS_API_URL, QUILT_META_BASE_URL,
};
use crate::error::{AppError, AppResult};
use crate::models::events::LaunchProgressEvent;
use crate::models::instance::{EngineKind, Instance, ModLoaderKind};
use crate::models::mojang::{Library, VersionArguments, VersionDetails};
use crate::services::downloader;
use crate::services::mojang_service::maven_artifact_path;
use crate::storage::paths::AppPaths;
use reqwest::Client;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;
use tauri::{AppHandle, Emitter};
use tokio::process::Command;

#[derive(Debug, Deserialize)]
struct MetaLoaderEntry {
    loader: MetaLoaderInfo,
}

#[derive(Debug, Deserialize)]
struct MetaLoaderInfo {
    version: String,
    #[serde(default)]
    stable: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoaderProfileJson {
    main_class: String,
    #[serde(default)]
    libraries: Vec<Library>,
    arguments: Option<VersionArguments>,
}

#[derive(Debug, Deserialize)]
struct ForgePromotions {
    promos: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct NeoForgeVersions {
    versions: Vec<String>,
}

fn emit_progress(app: &AppHandle, instance_id: &str, message: &str, current: u64, total: u64) {
    let percent = if total == 0 {
        0.0
    } else {
        (current as f64 / total as f64) * 100.0
    };
    let _ = app.emit(
        "launch://progress",
        LaunchProgressEvent {
            instance_id: instance_id.to_string(),
            stage: "loader".to_string(),
            message: message.to_string(),
            current,
            total,
            percent,
        },
    );
}

pub async fn list_loader_versions(
    loader: ModLoaderKind,
    mc_version: &str,
) -> AppResult<Vec<String>> {
    let mc_ver = mc_version.trim();
    if mc_ver.is_empty() || loader == ModLoaderKind::Vanilla {
        return Ok(Vec::new());
    }

    let client = Client::new();
    match loader {
        ModLoaderKind::Vanilla => Ok(Vec::new()),
        ModLoaderKind::Fabric => {
            let url = format!("{FABRIC_META_BASE_URL}/versions/loader/{mc_ver}");
            let entries: Vec<MetaLoaderEntry> = downloader::get_json(&client, &url).await?;
            Ok(entries.into_iter().map(|e| e.loader.version).collect())
        }
        ModLoaderKind::Quilt => {
            let url = format!("{QUILT_META_BASE_URL}/versions/loader/{mc_ver}");
            let entries: Vec<MetaLoaderEntry> = downloader::get_json(&client, &url).await?;
            Ok(entries.into_iter().map(|e| e.loader.version).collect())
        }
        ModLoaderKind::Forge => {
            let xml_url = format!(
                "{FORGE_MAVEN_BASE_URL}/net/minecraftforge/forge/maven-metadata.xml"
            );
            let xml = client
                .get(&xml_url)
                .header("User-Agent", "HydroLauncher/0.1")
                .send()
                .await?
                .error_for_status()?
                .text()
                .await?;
            let prefix = format!("{mc_ver}-");
            let mut versions: Vec<String> = xml
                .split("<version>")
                .skip(1)
                .filter_map(|s| s.split("</version>").next())
                .filter_map(|v| v.strip_prefix(&prefix))
                .map(str::to_string)
                .collect();
            versions.reverse();
            Ok(versions)
        }
        ModLoaderKind::NeoForge => {
            let data: NeoForgeVersions =
                downloader::get_json(&client, NEOFORGE_VERSIONS_API_URL).await?;
            let Some(prefix) = neoforge_prefix_for_mc(mc_ver) else {
                return Ok(Vec::new());
            };
            Ok(data
                .versions
                .into_iter()
                .rev()
                .filter(|v| v.starts_with(&prefix))
                .collect())
        }
    }
}

pub async fn apply_modloader(
    app: &AppHandle,
    paths: &AppPaths,
    data_dir: &Path,
    instance: &Instance,
    java_exec: &str,
    details: &mut VersionDetails,
) -> AppResult<()> {
    if instance.engine == EngineKind::Horizon || instance.loader == ModLoaderKind::Vanilla {
        return Ok(());
    }

    match instance.loader {
        ModLoaderKind::Vanilla => Ok(()),
        ModLoaderKind::Fabric => {
            install_fabric_or_quilt(
                app,
                paths,
                data_dir,
                instance,
                details,
                FABRIC_META_BASE_URL,
                "Fabric",
            )
            .await
        }
        ModLoaderKind::Quilt => {
            install_fabric_or_quilt(
                app,
                paths,
                data_dir,
                instance,
                details,
                QUILT_META_BASE_URL,
                "Quilt",
            )
            .await
        }
        ModLoaderKind::Forge => {
            install_forge(app, paths, data_dir, instance, java_exec, details).await
        }
        ModLoaderKind::NeoForge => {
            install_neoforge(app, paths, data_dir, instance, java_exec, details).await
        }
    }
}

async fn install_fabric_or_quilt(
    app: &AppHandle,
    paths: &AppPaths,
    data_dir: &Path,
    instance: &Instance,
    details: &mut VersionDetails,
    meta_base: &str,
    label: &str,
) -> AppResult<()> {
    let client = Client::new();
    let mc_ver = &instance.minecraft_version;

    let loader_ver = if let Some(v) = instance
        .loader_version
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        v.to_string()
    } else {
        emit_progress(
            app,
            &instance.id,
            &format!("Поиск версии {label} для {mc_ver}…"),
            0,
            1,
        );
        let url = format!("{meta_base}/versions/loader/{mc_ver}");
        let entries: Vec<MetaLoaderEntry> = downloader::get_json(&client, &url).await?;
        entries
            .iter()
            .find(|e| e.loader.stable)
            .or_else(|| entries.first())
            .map(|e| e.loader.version.clone())
            .ok_or_else(|| {
                AppError::NotFound(format!("{label} не поддерживает Minecraft {mc_ver}"))
            })?
    };

    let profile_id = format!("{}-{}-{}", mc_ver, label.to_lowercase(), loader_ver);
    let profile_path = paths
        .version_dir(data_dir, &profile_id)
        .join(format!("{profile_id}.json"));

    let profile: LoaderProfileJson = if profile_path.exists() {
        let bytes = tokio::fs::read(&profile_path).await?;
        serde_json::from_slice(&bytes)?
    } else {
        let url = format!("{meta_base}/versions/loader/{mc_ver}/{loader_ver}/profile/json");
        let resp = client
            .get(&url)
            .header("User-Agent", "HydroLauncher/0.1")
            .send()
            .await?
            .error_for_status()?;
        let bytes = resp.bytes().await?;
        if let Some(parent) = profile_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&profile_path, &bytes).await?;
        serde_json::from_slice(&bytes)?
    };

    let libs_dir = paths.libraries_dir(data_dir);
    let total = profile.libraries.len() as u64;
    for (idx, lib) in profile.libraries.iter().enumerate() {
        let rel = maven_artifact_path(&lib.name);
        let dest = libs_dir.join(&rel);
        if !dest.exists() {
            let base = lib.url.as_deref().unwrap_or(MAVEN_CENTRAL_URL);
            let url = format!("{}{}", base.trim_end_matches('/'), format!("/{rel}"));
            emit_progress(
                app,
                &instance.id,
                &format!("Библиотеки {label} ({}/{})…", idx + 1, total),
                idx as u64,
                total.max(1),
            );
            downloader::download_file(&client, &url, &dest, None).await?;
        }
    }

    merge_loader_profile(details, profile);
    emit_progress(app, &instance.id, &format!("{label} готов"), 1, 1);
    Ok(())
}

async fn install_forge(
    app: &AppHandle,
    paths: &AppPaths,
    data_dir: &Path,
    instance: &Instance,
    java_exec: &str,
    details: &mut VersionDetails,
) -> AppResult<()> {
    let client = Client::new();
    let mc_ver = &instance.minecraft_version;

    let forge_ver = if let Some(v) = instance
        .loader_version
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        v.to_string()
    } else {
        emit_progress(
            app,
            &instance.id,
            &format!("Поиск версии Forge для {mc_ver}…"),
            0,
            1,
        );
        let promos: ForgePromotions = downloader::get_json(&client, FORGE_PROMOTIONS_URL).await?;
        promos
            .promos
            .get(&format!("{mc_ver}-recommended"))
            .or_else(|| promos.promos.get(&format!("{mc_ver}-latest")))
            .cloned()
            .ok_or_else(|| {
                AppError::NotFound(format!("Forge не найден для Minecraft {mc_ver}"))
            })?
    };

    let version_id = format!("{mc_ver}-forge-{forge_ver}");
    let profile_path = paths
        .version_dir(data_dir, &version_id)
        .join(format!("{version_id}.json"));

    if !profile_path.exists() {
        let installer_url = format!(
            "{FORGE_MAVEN_BASE_URL}/net/minecraftforge/forge/{mc_ver}-{forge_ver}/forge-{mc_ver}-{forge_ver}-installer.jar"
        );
        run_installer(
            app,
            data_dir,
            &instance.id,
            java_exec,
            &installer_url,
            &format!("forge-{mc_ver}-{forge_ver}-installer.jar"),
            "Forge",
        )
        .await?;
    }

    let bytes = tokio::fs::read(&profile_path).await.map_err(|_| {
        AppError::NotFound(format!(
            "Установщик Forge не создал профиль {version_id}.json"
        ))
    })?;
    let profile: LoaderProfileJson = serde_json::from_slice(&bytes)?;
    merge_loader_profile(details, profile);
    emit_progress(app, &instance.id, "Forge готов", 1, 1);
    Ok(())
}

async fn install_neoforge(
    app: &AppHandle,
    paths: &AppPaths,
    data_dir: &Path,
    instance: &Instance,
    java_exec: &str,
    details: &mut VersionDetails,
) -> AppResult<()> {
    let client = Client::new();
    let mc_ver = &instance.minecraft_version;

    let nf_ver = if let Some(v) = instance
        .loader_version
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        v.to_string()
    } else {
        emit_progress(
            app,
            &instance.id,
            &format!("Поиск версии NeoForge для {mc_ver}…"),
            0,
            1,
        );
        let data: NeoForgeVersions =
            downloader::get_json(&client, NEOFORGE_VERSIONS_API_URL).await?;
        let prefix = neoforge_prefix_for_mc(mc_ver).ok_or_else(|| {
            AppError::NotFound(format!("NeoForge не поддерживает Minecraft {mc_ver}"))
        })?;
        data.versions
            .iter()
            .rev()
            .find(|v| v.starts_with(&prefix))
            .cloned()
            .ok_or_else(|| {
                AppError::NotFound(format!("NeoForge не найден для Minecraft {mc_ver}"))
            })?
    };

    let version_id = format!("neoforge-{nf_ver}");
    let profile_path = paths
        .version_dir(data_dir, &version_id)
        .join(format!("{version_id}.json"));

    if !profile_path.exists() {
        let installer_url = format!(
            "{NEOFORGE_MAVEN_BASE_URL}/net/neoforged/neoforge/{nf_ver}/neoforge-{nf_ver}-installer.jar"
        );
        run_installer(
            app,
            data_dir,
            &instance.id,
            java_exec,
            &installer_url,
            &format!("neoforge-{nf_ver}-installer.jar"),
            "NeoForge",
        )
        .await?;
    }

    let bytes = tokio::fs::read(&profile_path).await.map_err(|_| {
        AppError::NotFound(format!(
            "Установщик NeoForge не создал профиль {version_id}.json"
        ))
    })?;
    let profile: LoaderProfileJson = serde_json::from_slice(&bytes)?;
    merge_loader_profile(details, profile);
    emit_progress(app, &instance.id, "NeoForge готов", 1, 1);
    Ok(())
}

fn neoforge_prefix_for_mc(mc_ver: &str) -> Option<String> {
    let parts: Vec<&str> = mc_ver.split('.').collect();
    if parts.len() >= 2 && parts[0] == "1" {
        let minor = parts[1];
        let patch = parts.get(2).copied().unwrap_or("0");
        Some(format!("{minor}.{patch}."))
    } else {
        None
    }
}

async fn run_installer(
    app: &AppHandle,
    data_dir: &Path,
    instance_id: &str,
    java_exec: &str,
    installer_url: &str,
    installer_name: &str,
    label: &str,
) -> AppResult<()> {
    let launcher_profiles = data_dir.join("launcher_profiles.json");
    if !launcher_profiles.exists() {
        tokio::fs::write(&launcher_profiles, r#"{"profiles":{}}"#).await?;
    }

    let cache_dir = data_dir.join("cache").join("installers");
    tokio::fs::create_dir_all(&cache_dir).await?;
    let installer_path = cache_dir.join(installer_name);

    emit_progress(
        app,
        instance_id,
        &format!("Скачивание установщика {label}…"),
        0,
        2,
    );
    let client = Client::new();
    downloader::download_file(&client, installer_url, &installer_path, None).await?;

    emit_progress(
        app,
        instance_id,
        &format!("Установка {label} (это может занять минуту)…"),
        1,
        2,
    );
    let output = Command::new(java_exec)
        .arg("-jar")
        .arg(&installer_path)
        .arg("--installClient")
        .arg(data_dir)
        .output()
        .await
        .map_err(|e| AppError::Process(format!("Не удалось запустить установщик {label}: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(AppError::Process(format!(
            "Установка {label} завершилась с ошибкой: {}{}",
            stderr.trim(),
            if stderr.trim().is_empty() {
                stdout.trim()
            } else {
                ""
            }
        )));
    }

    Ok(())
}

fn merge_loader_profile(details: &mut VersionDetails, profile: LoaderProfileJson) {
    details.main_class = profile.main_class;
    // Библиотеки загрузчика идут первыми в classpath, чтобы ASM/Mixin не конфликтовали
    let mut merged_libs = profile.libraries;
    merged_libs.extend(details.libraries.drain(..));
    details.libraries = merged_libs;

    if let Some(loader_args) = profile.arguments {
        let base = details.arguments.get_or_insert(VersionArguments {
            game: Vec::new(),
            jvm: Vec::new(),
        });
        base.jvm.extend(loader_args.jvm);
        base.game.extend(loader_args.game);
    }
}
