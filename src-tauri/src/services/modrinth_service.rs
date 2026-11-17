use crate::config::endpoints::MODRINTH_API_BASE_URL;
use crate::error::{AppError, AppResult};
use crate::models::instance::{Instance, ModLoaderKind};
use crate::services::downloader;
use crate::storage::paths::AppPaths;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Предел размера `.mrpack`: архив читается в память целиком, и без лимита
/// подменённый или повреждённый файл мог бы исчерпать память.
const MAX_MRPACK_BYTES: u64 = 1024 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthSearchHit {
    pub project_id: String,
    pub project_type: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub author: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub categories: Vec<String>,
    pub versions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthSearchResult {
    pub hits: Vec<ModrinthSearchHit>,
    pub total_hits: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledModFile {
    pub file_name: String,
    pub kind: String,
    pub size_bytes: u64,
    pub project_id: Option<String>,
    pub title: Option<String>,
    pub icon_url: Option<String>,
    pub version_id: Option<String>,
    pub version_number: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModMetaEntry {
    pub file_name: String,
    pub project_id: String,
    pub title: Option<String>,
    pub icon_url: Option<String>,
    pub version_id: String,
    pub version_number: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthGalleryImage {
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthProjectDetails {
    pub id: String,
    pub project_type: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub body: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub followers: u64,
    pub categories: Vec<String>,
    pub loaders: Vec<String>,
    pub game_versions: Vec<String>,
    pub source_url: Option<String>,
    pub gallery: Vec<ModrinthGalleryImage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthVersionInfo {
    pub id: String,
    pub name: String,
    pub version_number: String,
    pub version_type: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub date_published: String,
    pub downloads: u64,
}

#[derive(Debug, Deserialize)]
struct ApiSearchResponse {
    hits: Vec<ApiSearchHit>,
    total_hits: u64,
}

#[derive(Debug, Deserialize)]
struct ApiSearchHit {
    project_id: String,
    #[serde(default = "default_project_type")]
    project_type: String,
    slug: String,
    title: String,
    description: String,
    author: String,
    icon_url: Option<String>,
    downloads: u64,
    #[serde(default)]
    categories: Vec<String>,
    #[serde(default)]
    versions: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ApiDependency {
    project_id: Option<String>,
    version_id: Option<String>,
    dependency_type: String,
}

#[derive(Debug, Deserialize)]
struct ApiVersion {
    id: String,
    name: Option<String>,
    version_number: String,
    version_type: Option<String>,
    #[serde(default)]
    game_versions: Vec<String>,
    #[serde(default)]
    loaders: Vec<String>,
    date_published: Option<String>,
    downloads: Option<u64>,
    #[serde(default)]
    dependencies: Vec<ApiDependency>,
    files: Vec<ApiVersionFile>,
}

#[derive(Debug, Deserialize)]
struct ApiProjectDetails {
    id: String,
    #[serde(default = "default_project_type")]
    project_type: String,
    slug: String,
    title: String,
    description: String,
    body: String,
    icon_url: Option<String>,
    downloads: u64,
    followers: u64,
    #[serde(default)]
    categories: Vec<String>,
    #[serde(default)]
    loaders: Vec<String>,
    #[serde(default)]
    game_versions: Vec<String>,
    source_url: Option<String>,
    #[serde(default)]
    gallery: Vec<ApiGalleryImage>,
}

#[derive(Debug, Deserialize)]
struct ApiGalleryImage {
    url: String,
    title: Option<String>,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiVersionFile {
    url: String,
    filename: String,
    primary: bool,
    hashes: HashMap<String, String>,
}

fn loader_slug(loader: ModLoaderKind) -> Option<&'static str> {
    match loader {
        ModLoaderKind::Vanilla => None,
        ModLoaderKind::Fabric => Some("fabric"),
        ModLoaderKind::Forge => Some("forge"),
        ModLoaderKind::NeoForge => Some("neoforge"),
        ModLoaderKind::Quilt => Some("quilt"),
    }
}

fn default_project_type() -> String {
    "mod".to_string()
}

pub async fn search_mods(
    query: &str,
    project_type: Option<&str>,
    category: Option<&str>,
    loader: Option<ModLoaderKind>,
    game_version: Option<&str>,
    limit: u32,
    offset: u32,
) -> AppResult<ModrinthSearchResult> {
    let client = crate::services::downloader::build_client()?;
    let mut facets: Vec<Vec<String>> = match project_type.map(str::trim) {
        Some("all") => vec![vec![
            "project_type:mod".to_string(),
            "project_type:shader".to_string(),
            "project_type:resourcepack".to_string(),
        ]],
        Some(pt) if !pt.is_empty() => vec![vec![format!("project_type:{pt}")]],
        _ => vec![vec!["project_type:mod".to_string()]],
    };

    let allows_loader_facet = !matches!(
        project_type.map(str::trim),
        Some("shader") | Some("resourcepack") | Some("datapack")
    );
    if allows_loader_facet {
        if let Some(slug) = loader.and_then(loader_slug) {
            facets.push(vec![format!("categories:{slug}")]);
        }
    }
    if let Some(ver) = game_version.map(str::trim).filter(|v| !v.is_empty()) {
        facets.push(vec![format!("versions:{ver}")]);
    }
    if let Some(cat) = category
        .map(str::trim)
        .filter(|c| !c.is_empty() && *c != "all")
    {
        facets.push(vec![format!("categories:{cat}")]);
    }

    let facets_json = serde_json::to_string(&facets)?;
    let url = format!("{MODRINTH_API_BASE_URL}/search");

    let response = client
        .get(&url)
        .header("User-Agent", crate::services::downloader::USER_AGENT)
        .query(&[
            ("query", query.trim()),
            ("facets", facets_json.as_str()),
            ("index", "downloads"),
            ("limit", &limit.clamp(1, 50).to_string()),
            ("offset", &offset.to_string()),
        ])
        .send()
        .await?
        .error_for_status()?;

    let payload: ApiSearchResponse = response.json().await?;
    let hits = payload
        .hits
        .into_iter()
        .map(|hit| ModrinthSearchHit {
            project_id: hit.project_id,
            project_type: hit.project_type,
            slug: hit.slug,
            title: hit.title,
            description: hit.description,
            author: hit.author,
            icon_url: hit.icon_url.filter(|u| !u.is_empty()),
            downloads: hit.downloads,
            categories: hit.categories,
            versions: hit.versions,
        })
        .collect();

    Ok(ModrinthSearchResult {
        hits,
        total_hits: payload.total_hits,
    })
}

pub async fn get_project(project_id: &str) -> AppResult<ModrinthProjectDetails> {
    let client = crate::services::downloader::build_client()?;
    let url = format!("{MODRINTH_API_BASE_URL}/project/{project_id}");
    let p: ApiProjectDetails = client
        .get(&url)
        .header("User-Agent", crate::services::downloader::USER_AGENT)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(ModrinthProjectDetails {
        id: p.id,
        project_type: p.project_type,
        slug: p.slug,
        title: p.title,
        description: p.description,
        body: p.body,
        icon_url: p.icon_url.filter(|u| !u.is_empty()),
        downloads: p.downloads,
        followers: p.followers,
        categories: p.categories,
        loaders: p.loaders,
        game_versions: p.game_versions,
        source_url: p.source_url.filter(|u| !u.is_empty()),
        gallery: p
            .gallery
            .into_iter()
            .map(|g| ModrinthGalleryImage {
                url: g.url,
                title: g.title.filter(|t| !t.is_empty()),
                description: g.description.filter(|d| !d.is_empty()),
            })
            .collect(),
    })
}

pub async fn get_project_versions(
    project_id: &str,
    loader: Option<ModLoaderKind>,
    game_version: Option<&str>,
) -> AppResult<Vec<ModrinthVersionInfo>> {
    let client = crate::services::downloader::build_client()?;
    let url = format!("{MODRINTH_API_BASE_URL}/project/{project_id}/version");
    let mut query: Vec<(&str, String)> = Vec::new();

    if let Some(slug) = loader.and_then(loader_slug) {
        query.push(("loaders", serde_json::to_string(&[slug])?));
    }
    if let Some(ver) = game_version.map(str::trim).filter(|v| !v.is_empty()) {
        query.push(("game_versions", serde_json::to_string(&[ver])?));
    }

    let versions: Vec<ApiVersion> = client
        .get(&url)
        .header("User-Agent", crate::services::downloader::USER_AGENT)
        .query(&query)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(versions
        .into_iter()
        .take(40)
        .map(|v| ModrinthVersionInfo {
            id: v.id,
            name: v.name.unwrap_or_else(|| v.version_number.clone()),
            version_number: v.version_number,
            version_type: v.version_type.unwrap_or_else(|| "release".into()),
            game_versions: v.game_versions,
            loaders: v.loaders,
            date_published: v.date_published.unwrap_or_default(),
            downloads: v.downloads.unwrap_or(0),
        })
        .collect())
}

pub async fn install_mod(
    paths: &AppPaths,
    data_dir: &Path,
    instance: &Instance,
    project_id: &str,
    version_id: Option<&str>,
) -> AppResult<InstalledModFile> {
    let mut visited = std::collections::HashSet::new();
    install_mod_inner(
        paths,
        data_dir,
        instance,
        project_id,
        version_id,
        &mut visited,
    )
    .await
}

async fn install_mod_inner(
    paths: &AppPaths,
    data_dir: &Path,
    instance: &Instance,
    project_id: &str,
    version_id: Option<&str>,
    visited: &mut std::collections::HashSet<String>,
) -> AppResult<InstalledModFile> {
    visited.insert(project_id.to_string());
    let client = crate::services::downloader::build_client()?;
    let project_url = format!("{MODRINTH_API_BASE_URL}/project/{project_id}");
    let project_info: ApiProjectDetails = client
        .get(&project_url)
        .header("User-Agent", crate::services::downloader::USER_AGENT)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let is_mod = project_info.project_type == "mod";
    let loader = if is_mod {
        Some(loader_slug(instance.loader).ok_or_else(|| {
            AppError::Validation(
                "Vanilla-сборка не поддерживает моды. Выберите сборку с Fabric, Forge, NeoForge или Quilt."
                    .into(),
            )
        })?)
    } else {
        None
    };

    let chosen: ApiVersion = if let Some(vid) = version_id.filter(|s| !s.is_empty()) {
        let url = format!("{MODRINTH_API_BASE_URL}/version/{vid}");
        client
            .get(&url)
            .header("User-Agent", crate::services::downloader::USER_AGENT)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?
    } else {
        let versions_json = serde_json::to_string(&[instance.minecraft_version.as_str()])?;
        let url = format!("{MODRINTH_API_BASE_URL}/project/{project_id}/version");

        let mut query: Vec<(&str, String)> = vec![("game_versions", versions_json)];
        if let Some(l) = loader {
            query.push(("loaders", serde_json::to_string(&[l])?));
        }

        let response = client
            .get(&url)
            .header("User-Agent", crate::services::downloader::USER_AGENT)
            .query(&query)
            .send()
            .await?
            .error_for_status()?;

        let mut versions: Vec<ApiVersion> = response.json().await?;
        if versions.is_empty() && !is_mod {
            // Шейдеры и ресурспаки часто совместимы с соседними версиями, пробуем без фильтра версии
            let fallback: Vec<ApiVersion> = client
                .get(&url)
                .header("User-Agent", crate::services::downloader::USER_AGENT)
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            versions = fallback;
        }
        versions.into_iter().next().ok_or_else(|| {
            AppError::NotFound(format!(
                "Нет совместимой версии для {}",
                instance.minecraft_version
            ))
        })?
    };

    let file = chosen
        .files
        .iter()
        .find(|f| f.primary)
        .or_else(|| chosen.files.first())
        .ok_or_else(|| AppError::NotFound("У выбранной версии нет файлов".into()))?;

    let safe_name = Path::new(&file.filename)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::Validation("Некорректное имя файла".into()))?;

    let kind = match project_info.project_type.as_str() {
        "shader" => "shader",
        "resourcepack" => "resourcepack",
        _ => "mod",
    }
    .to_string();
    let dest_dir = match kind.as_str() {
        "shader" => paths.instance_shaderpacks_dir(data_dir, &instance.id),
        "resourcepack" => paths.instance_resourcepacks_dir(data_dir, &instance.id),
        _ => paths.instance_mods_dir(data_dir, &instance.id),
    };
    tokio::fs::create_dir_all(&dest_dir).await?;

    // Скачиваем до правки списка: при сбое загрузки метаданные не будут
    // ссылаться на отсутствующий файл.
    let dest = dest_dir.join(safe_name);
    let sha1 = file.hashes.get("sha1").map(String::as_str);
    crate::services::jobs::progress(35.0, format!("Скачивание {safe_name}…"));
    downloader::download_file(&client, &file.url, &dest, sha1).await?;
    crate::services::jobs::progress(75.0, "Сохранение списка модов…");

    // Подтягиваем чистое название и иконку проекта с Modrinth
    let project_info = get_project(project_id).await.ok();

    let entry = ModMetaEntry {
        file_name: safe_name.to_string(),
        project_id: project_id.to_string(),
        title: project_info
            .as_ref()
            .map(|p| p.title.clone())
            .or_else(|| chosen.name.clone()),
        icon_url: project_info.and_then(|p| p.icon_url),
        version_id: chosen.id.clone(),
        version_number: chosen.version_number.clone(),
    };

    // Список модов читают и правят несколько команд: держим замок файла на
    // всё время read-modify-write, иначе установка теряет чужие записи, а
    // старый файл проекта удаляется по устаревшему списку.
    let meta_path = paths
        .instance_dir(data_dir, &instance.id)
        .join("mods-meta.json");
    let meta_list = {
        let _guard = crate::storage::json_store::lock_file(&meta_path).await;
        let mut meta_list: Vec<ModMetaEntry> =
            crate::storage::json_store::read_json_or_default(&meta_path)
                .await
                .unwrap_or_default();

        remove_previous_mod_files(
            paths,
            data_dir,
            &instance.id,
            &meta_list,
            project_id,
            safe_name,
        )
        .await;
        meta_list.retain(|m| m.project_id != project_id && m.file_name != safe_name);
        meta_list.push(entry.clone());
        crate::storage::json_store::write_json_atomic(&meta_path, &meta_list).await?;
        meta_list
    };

    // Автоматически устанавливаем обязательные (required) зависимости мода
    if is_mod {
        for dep in &chosen.dependencies {
            if dep.dependency_type != "required" {
                continue;
            }
            if let Some(dep_pid) = dep.project_id.as_deref() {
                if visited.contains(dep_pid) || meta_list.iter().any(|m| m.project_id == dep_pid) {
                    continue;
                }
                let _ = Box::pin(install_mod_inner(
                    paths,
                    data_dir,
                    instance,
                    dep_pid,
                    dep.version_id.as_deref(),
                    visited,
                ))
                .await;
            }
        }
    }

    let metadata = tokio::fs::metadata(&dest).await?;
    Ok(InstalledModFile {
        file_name: safe_name.to_string(),
        kind,
        size_bytes: metadata.len(),
        project_id: Some(entry.project_id),
        title: entry.title,
        icon_url: entry.icon_url,
        version_id: Some(entry.version_id),
        version_number: Some(entry.version_number),
    })
}

/// Удаляет файлы прошлых версий того же проекта из всех папок контента:
/// имя файла у новой версии обычно другое, и без этого в сборке оставались
/// бы два мода сразу.
async fn remove_previous_mod_files(
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
    meta_list: &[ModMetaEntry],
    project_id: &str,
    keep_name: &str,
) {
    for old in meta_list
        .iter()
        .filter(|m| m.project_id == project_id && m.file_name != keep_name)
    {
        for dir in [
            paths.instance_mods_dir(data_dir, instance_id),
            paths.instance_shaderpacks_dir(data_dir, instance_id),
            paths.instance_resourcepacks_dir(data_dir, instance_id),
        ] {
            let old_path = dir.join(&old.file_name);
            if old_path.exists() {
                let _ = tokio::fs::remove_file(old_path).await;
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct ApiHashVersion {
    id: String,
    project_id: String,
    version_number: String,
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiProjectSummary {
    id: String,
    title: String,
    icon_url: Option<String>,
}

async fn compute_sha1_hex(path: &Path) -> Option<String> {
    downloader::hash_file_sha1(path).await.ok()
}

pub async fn list_installed_mods(
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
) -> AppResult<Vec<InstalledModFile>> {
    let mods_dir = paths.instance_mods_dir(data_dir, instance_id);
    let horizon_mods_dir = paths.instance_horizon_mods_dir(data_dir, instance_id);
    let horizon_native_mods_dir = paths.instance_horizon_native_mods_dir(data_dir, instance_id);
    let shaderpacks_dir = paths.instance_shaderpacks_dir(data_dir, instance_id);
    let resourcepacks_dir = paths.instance_resourcepacks_dir(data_dir, instance_id);

    let meta_path = paths
        .instance_dir(data_dir, instance_id)
        .join("mods-meta.json");
    let mut meta_list: Vec<ModMetaEntry> =
        crate::storage::json_store::read_json_or_default(&meta_path)
            .await
            .unwrap_or_default();

    let mut files: Vec<(String, String, u64, std::path::PathBuf)> = Vec::new();
    for (dir, kind, exts) in [
        (
            &mods_dir,
            "mod",
            &[
                ".jar",
                ".jar.disabled",
                ".hmod",
                ".hmod.disabled",
                ".hnmod",
                ".hnmod.disabled",
            ][..],
        ),
        (&horizon_mods_dir, "mod", &[".hmod", ".hmod.disabled"][..]),
        (
            &horizon_native_mods_dir,
            "mod",
            &[".hnmod", ".hnmod.disabled"][..],
        ),
        (
            &shaderpacks_dir,
            "shader",
            &[".hshader", ".hshader.disabled", ".zip", ".zip.disabled"][..],
        ),
        (
            &resourcepacks_dir,
            "resourcepack",
            &[".zip", ".zip.disabled"][..],
        ),
    ] {
        if !dir.exists() {
            continue;
        }
        if let Ok(mut entries) = tokio::fs::read_dir(dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                if let Ok(meta) = entry.metadata().await {
                    if !meta.is_file() {
                        continue;
                    }
                    let name = entry.file_name().to_string_lossy().to_string();
                    if exts.iter().any(|ext| name.ends_with(ext)) {
                        files.push((name, kind.to_string(), meta.len(), entry.path()));
                    }
                }
            }
        }
    }

    if files.is_empty() {
        return Ok(Vec::new());
    }

    // Для .jar файлов без метаданных определяем проект и версию по SHA-1 через Modrinth API
    let mut missing_hashes: Vec<(String, String)> = Vec::new();
    for (name, _, _, path) in &files {
        if !name.ends_with(".jar") && !name.ends_with(".jar.disabled") {
            continue;
        }
        let has_full_meta = meta_list
            .iter()
            .any(|m| &m.file_name == name && m.title.is_some());
        if !has_full_meta {
            if let Some(hash) = compute_sha1_hex(path).await {
                missing_hashes.push((name.clone(), hash));
            }
        }
    }

    if !missing_hashes.is_empty() {
        let client = crate::services::downloader::build_client()?;
        let hash_list: Vec<&str> = missing_hashes.iter().map(|(_, h)| h.as_str()).collect();
        let body = serde_json::json!({
            "hashes": hash_list,
            "algorithm": "sha1"
        });

        if let Ok(resp) = client
            .post(format!("{MODRINTH_API_BASE_URL}/version_files"))
            .header("User-Agent", crate::services::downloader::USER_AGENT)
            .json(&body)
            .send()
            .await
        {
            if let Ok(map) = resp.json::<HashMap<String, ApiHashVersion>>().await {
                let project_ids: Vec<String> = map
                    .values()
                    .map(|v| v.project_id.clone())
                    .collect::<std::collections::HashSet<_>>()
                    .into_iter()
                    .collect();

                let mut projects_map: HashMap<String, ApiProjectSummary> = HashMap::new();
                if !project_ids.is_empty() {
                    if let Ok(ids_json) = serde_json::to_string(&project_ids) {
                        if let Ok(p_resp) = client
                            .get(format!("{MODRINTH_API_BASE_URL}/projects"))
                            .header("User-Agent", crate::services::downloader::USER_AGENT)
                            .query(&[("ids", ids_json.as_str())])
                            .send()
                            .await
                        {
                            if let Ok(list) = p_resp.json::<Vec<ApiProjectSummary>>().await {
                                for p in list {
                                    projects_map.insert(p.id.clone(), p);
                                }
                            }
                        }
                    }
                }

                let mut changed = false;
                for (file_name, hash) in &missing_hashes {
                    if let Some(ver) = map.get(hash) {
                        let proj = projects_map.get(&ver.project_id);
                        meta_list.retain(|m| &m.file_name != file_name);
                        meta_list.push(ModMetaEntry {
                            file_name: file_name.clone(),
                            project_id: ver.project_id.clone(),
                            title: proj.map(|p| p.title.clone()).or_else(|| ver.name.clone()),
                            icon_url: proj
                                .and_then(|p| p.icon_url.clone())
                                .filter(|u| !u.is_empty()),
                            version_id: ver.id.clone(),
                            version_number: ver.version_number.clone(),
                        });
                        changed = true;
                    }
                }

                if changed {
                    let _ =
                        crate::storage::json_store::write_json_atomic(&meta_path, &meta_list).await;
                }
            }
        }
    }

    let mut result = Vec::with_capacity(files.len());
    for (name, kind, size_bytes, _) in files {
        let found = meta_list.iter().find(|m| m.file_name == name);
        result.push(InstalledModFile {
            file_name: name,
            kind,
            size_bytes,
            project_id: found.map(|m| m.project_id.clone()),
            title: found.and_then(|m| m.title.clone()),
            icon_url: found.and_then(|m| m.icon_url.clone()),
            version_id: found.map(|m| m.version_id.clone()),
            version_number: found.map(|m| m.version_number.clone()),
        });
    }

    result.sort_by(|a, b| {
        let ta = a.title.as_deref().unwrap_or(&a.file_name).to_lowercase();
        let tb = b.title.as_deref().unwrap_or(&b.file_name).to_lowercase();
        ta.cmp(&tb)
    });
    Ok(result)
}

pub async fn remove_installed_mod(
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
    file_name: &str,
) -> AppResult<()> {
    if file_name.is_empty()
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains("..")
    {
        return Err(AppError::Validation("Некорректное имя файла мода".into()));
    }

    for dir in [
        paths.instance_mods_dir(data_dir, instance_id),
        paths.instance_horizon_mods_dir(data_dir, instance_id),
        paths.instance_horizon_native_mods_dir(data_dir, instance_id),
        paths.instance_shaderpacks_dir(data_dir, instance_id),
        paths.instance_resourcepacks_dir(data_dir, instance_id),
    ] {
        let target = dir.join(file_name);
        if target.exists() {
            tokio::fs::remove_file(target).await?;
        }
    }

    let meta_path = paths
        .instance_dir(data_dir, instance_id)
        .join("mods-meta.json");
    if meta_path.exists() {
        let _guard = crate::storage::json_store::lock_file(&meta_path).await;
        let mut meta_list: Vec<ModMetaEntry> =
            crate::storage::json_store::read_json_or_default(&meta_path)
                .await
                .unwrap_or_default();
        meta_list.retain(|m| m.file_name != file_name);
        crate::storage::json_store::write_json_atomic(&meta_path, &meta_list).await?;
    }

    Ok(())
}

pub async fn toggle_installed_mod(
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
    file_name: &str,
) -> AppResult<String> {
    if file_name.is_empty()
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains("..")
    {
        return Err(AppError::Validation("Некорректное имя файла мода".into()));
    }

    let new_name = if let Some(stripped) = file_name.strip_suffix(".disabled") {
        stripped.to_string()
    } else {
        format!("{file_name}.disabled")
    };

    let mut renamed = false;
    for dir in [
        paths.instance_mods_dir(data_dir, instance_id),
        paths.instance_horizon_mods_dir(data_dir, instance_id),
        paths.instance_shaderpacks_dir(data_dir, instance_id),
        paths.instance_resourcepacks_dir(data_dir, instance_id),
    ] {
        let src = dir.join(file_name);
        if src.exists() {
            let dst = dir.join(&new_name);
            tokio::fs::rename(&src, &dst).await?;
            renamed = true;
            break;
        }
    }

    if !renamed {
        return Err(AppError::NotFound(format!("Файл {file_name} не найден")));
    }

    let meta_path = paths
        .instance_dir(data_dir, instance_id)
        .join("mods-meta.json");
    if meta_path.exists() {
        let _guard = crate::storage::json_store::lock_file(&meta_path).await;
        let mut meta_list: Vec<ModMetaEntry> =
            crate::storage::json_store::read_json_or_default(&meta_path)
                .await
                .unwrap_or_default();
        for m in &mut meta_list {
            if m.file_name == file_name {
                m.file_name = new_name.clone();
            }
        }
        crate::storage::json_store::write_json_atomic(&meta_path, &meta_list).await?;
    }

    Ok(new_name)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModUpdateInfo {
    pub file_name: String,
    pub project_id: String,
    pub current_version_id: String,
    pub latest_version_id: String,
    pub latest_version_number: String,
}

pub async fn check_mod_updates(
    paths: &AppPaths,
    data_dir: &Path,
    instance: &Instance,
) -> AppResult<Vec<ModUpdateInfo>> {
    let installed = list_installed_mods(paths, data_dir, &instance.id).await?;
    let loader = loader_slug(instance.loader);
    let client = crate::services::downloader::build_client()?;
    let versions_json = serde_json::to_string(&[instance.minecraft_version.as_str()])?;
    let mut updates = Vec::new();

    for mod_item in installed {
        let Some(pid) = mod_item.project_id else {
            continue;
        };
        let Some(cur_vid) = mod_item.version_id else {
            continue;
        };
        let url = format!("{MODRINTH_API_BASE_URL}/project/{pid}/version");
        let mut query: Vec<(&str, String)> = vec![("game_versions", versions_json.clone())];
        if let Some(l) = loader {
            query.push(("loaders", serde_json::to_string(&[l])?));
        }

        if let Ok(resp) = client
            .get(&url)
            .header("User-Agent", crate::services::downloader::USER_AGENT)
            .query(&query)
            .send()
            .await
        {
            if let Ok(list) = resp.json::<Vec<ApiVersion>>().await {
                if let Some(latest) = list.into_iter().next() {
                    if latest.id != cur_vid {
                        updates.push(ModUpdateInfo {
                            file_name: mod_item.file_name,
                            project_id: pid,
                            current_version_id: cur_vid,
                            latest_version_id: latest.id,
                            latest_version_number: latest.version_number,
                        });
                    }
                }
            }
        }
    }

    Ok(updates)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MrpackIndex {
    name: String,
    #[serde(default)]
    files: Vec<MrpackFile>,
    dependencies: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct MrpackFile {
    path: String,
    #[serde(default)]
    hashes: HashMap<String, String>,
    #[serde(default)]
    env: Option<MrpackEnv>,
    #[serde(default)]
    downloads: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct MrpackEnv {
    client: Option<String>,
}

pub async fn install_modrinth_modpack(
    paths: &AppPaths,
    data_dir: &Path,
    project_id: &str,
    custom_name: Option<&str>,
) -> AppResult<Instance> {
    let client = crate::services::downloader::build_client()?;
    let url = format!("{MODRINTH_API_BASE_URL}/project/{project_id}/version");
    let versions: Vec<ApiVersion> = client
        .get(&url)
        .header("User-Agent", crate::services::downloader::USER_AGENT)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let chosen = versions
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound("У выбранного модпака нет версий".into()))?;
    let file = chosen
        .files
        .iter()
        .find(|f| f.primary)
        .or_else(|| chosen.files.first())
        .ok_or_else(|| AppError::NotFound("У выбранной версии модпака нет файла .mrpack".into()))?;

    let bytes = downloader::download_bytes(&client, &file.url, MAX_MRPACK_BYTES).await?;
    if bytes.is_empty() {
        return Err(AppError::Validation("Файл модпака пуст".into()));
    }

    install_mrpack_from_bytes(paths, data_dir, bytes, custom_name).await
}

pub async fn import_mrpack_file(
    paths: &AppPaths,
    data_dir: &Path,
    file_path: &Path,
    custom_name: Option<&str>,
) -> AppResult<Instance> {
    let size = tokio::fs::metadata(file_path).await?.len();
    if size > MAX_MRPACK_BYTES {
        return Err(AppError::Validation("Файл модпака слишком большой".into()));
    }
    let bytes = tokio::fs::read(file_path).await?;
    install_mrpack_from_bytes(paths, data_dir, bytes, custom_name).await
}

async fn install_mrpack_from_bytes(
    paths: &AppPaths,
    data_dir: &Path,
    bytes: Vec<u8>,
    custom_name: Option<&str>,
) -> AppResult<Instance> {
    let index: MrpackIndex = {
        let cursor = std::io::Cursor::new(&bytes);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| AppError::Validation(format!("Некорректный .mrpack архив: {e}")))?;
        let mut idx_file = archive
            .by_name("modrinth.index.json")
            .map_err(|_| AppError::Validation("В архиве отсутствует modrinth.index.json".into()))?;
        let mut buf = Vec::new();
        std::io::Read::read_to_end(&mut idx_file, &mut buf)?;
        serde_json::from_slice(&buf)?
    };

    let mc_version = index
        .dependencies
        .get("minecraft")
        .cloned()
        .ok_or_else(|| AppError::Validation("В модпаке не указана версия Minecraft".into()))?;

    crate::services::jobs::progress(3.0, "Создание сборки…");

    let (loader, loader_version) = if let Some(v) = index.dependencies.get("fabric-loader") {
        (ModLoaderKind::Fabric, Some(v.clone()))
    } else if let Some(v) = index.dependencies.get("quilt-loader") {
        (ModLoaderKind::Quilt, Some(v.clone()))
    } else if let Some(v) = index.dependencies.get("neoforge") {
        (ModLoaderKind::NeoForge, Some(v.clone()))
    } else if let Some(v) = index.dependencies.get("forge") {
        (ModLoaderKind::Forge, Some(v.clone()))
    } else {
        (ModLoaderKind::Vanilla, None)
    };

    let instance_name = custom_name
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&index.name)
        .to_string();

    let instance = crate::services::instance_service::create_instance(
        paths,
        data_dir,
        crate::models::instance::CreateInstanceRequest {
            name: instance_name,
            minecraft_version: mc_version,
            engine: crate::models::instance::EngineKind::Java,
            loader,
            loader_version,
            icon: None,
            background: None,
        },
    )
    .await?;

    let game_dir = paths.instance_game_dir(data_dir, &instance.id);
    if let Err(err) = tokio::fs::create_dir_all(&game_dir).await {
        rollback_mrpack_install(paths, data_dir, &instance.id).await;
        return Err(err.into());
    }

    // Распаковываем overrides/ и client-overrides/
    crate::services::jobs::checkpoint().await?;
    crate::services::jobs::progress(10.0, "Распаковка файлов сборки…");
    let bytes_clone = bytes;
    let game_dir_clone = game_dir.clone();
    let overrides_result = tokio::task::spawn_blocking(move || -> AppResult<()> {
        // Защита от zip-бомбы: модпак не должен уметь заполнить диск.
        const MAX_OVERRIDE_BYTES: u64 = 4 * 1024 * 1024 * 1024;
        const MAX_OVERRIDE_ENTRIES: usize = 20_000;

        let cursor = std::io::Cursor::new(&bytes_clone);
        let mut archive = zip::ZipArchive::new(cursor)?;
        let mut total_bytes: u64 = 0;
        let mut written_entries: usize = 0;

        for i in 0..archive.len() {
            let mut entry = archive.by_index(i)?;
            if entry.is_dir() {
                continue;
            }

            // enclosed_name отсекает абсолютные пути и `..`: на Windows без
            // этого `join` с путём вида `C:/...` писал бы мимо папки сборки.
            let Some(path) = entry.enclosed_name() else {
                continue;
            };
            let relative = match path
                .strip_prefix("overrides")
                .or_else(|_| path.strip_prefix("client-overrides"))
            {
                Ok(value) => value,
                Err(_) => continue,
            };
            if relative.as_os_str().is_empty() {
                continue;
            }
            if !relative
                .components()
                .all(|component| matches!(component, std::path::Component::Normal(_)))
            {
                continue;
            }

            written_entries += 1;
            if written_entries > MAX_OVERRIDE_ENTRIES {
                return Err(AppError::Validation(
                    "В архиве модпака слишком много файлов".into(),
                ));
            }
            total_bytes = total_bytes.saturating_add(entry.size());
            if total_bytes > MAX_OVERRIDE_BYTES {
                return Err(AppError::Validation(
                    "Архив модпака больше допустимого размера".into(),
                ));
            }

            let out_path = game_dir_clone.join(relative);
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut out = std::fs::File::create(&out_path)?;
            std::io::copy(&mut entry, &mut out)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::Process(format!("Ошибка распаковки overrides: {e}")))?;

    if let Err(err) = overrides_result {
        rollback_mrpack_install(paths, data_dir, &instance.id).await;
        return Err(err);
    }

    // Скачиваем файлы модпака параллельно, но не больше лимита одновременных загрузок.
    crate::services::jobs::checkpoint().await?;
    crate::services::jobs::progress(35.0, "Загрузка файлов модпака…");
    let client = crate::services::downloader::build_client()?;
    let mut jobs: Vec<(PathBuf, String, Option<String>)> = Vec::new();
    for mf in index.files {
        if let Some(env) = &mf.env {
            if env.client.as_deref() == Some("unsupported") {
                continue;
            }
        }
        let Some(rel) = safe_mrpack_relative_path(&mf.path) else {
            continue;
        };
        let Some(dl_url) = mf.downloads.first() else {
            continue;
        };
        jobs.push((rel, dl_url.clone(), mf.hashes.get("sha1").cloned()));
    }

    let download_results: Vec<AppResult<()>> = futures_util::stream::iter(jobs)
        .map(|(rel, url, sha1)| {
            let client = client.clone();
            let dest = game_dir.join(rel);
            async move { downloader::download_file(&client, &url, &dest, sha1.as_deref()).await }
        })
        .buffer_unordered(crate::config::endpoints::DEFAULT_CONCURRENT_DOWNLOADS)
        .collect()
        .await;

    if let Some(err) = download_results.into_iter().find_map(Result::err) {
        rollback_mrpack_install(paths, data_dir, &instance.id).await;
        return Err(err);
    }

    crate::services::jobs::progress(95.0, "Проверка установки…");
    Ok(instance)
}

/// Путь файла из `modrinth.index.json` обязан остаться внутри папки игры.
/// В чужих архивах встречаются абсолютные пути, диск и `..`, а `join` с ними
/// пишет мимо сборки.
fn safe_mrpack_relative_path(raw: &str) -> Option<PathBuf> {
    let normalized = raw.replace('\\', "/");
    let path = Path::new(&normalized);
    if path.is_absolute() {
        return None;
    }
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::Normal(part) => result.push(part),
            _ => return None,
        }
    }
    if result.as_os_str().is_empty() {
        None
    } else {
        Some(result)
    }
}

/// Удаляет частично установленную сборку модпака, чтобы не оставлять мусор в списке.
async fn rollback_mrpack_install(paths: &AppPaths, data_dir: &Path, instance_id: &str) {
    let _ = crate::services::instance_service::delete_instance(paths, data_dir, instance_id).await;
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedMrpack {
    pub path: String,
    pub size_bytes: u64,
}

/// Собирает `.mrpack` из установленной сборки: известные моды Modrinth
/// описываются ссылками на скачивание, всё остальное кладётся в `overrides/`.
pub async fn export_instance_mrpack(
    paths: &AppPaths,
    data_dir: &Path,
    instance: &Instance,
    target: &Path,
) -> AppResult<ExportedMrpack> {
    let instance_dir = paths.instance_dir(data_dir, &instance.id);
    let mods_dir = instance_dir.join("game").join("mods");
    let game_dir = instance_dir.join("game");
    let meta_path = instance_dir.join("mods-meta.json");
    let meta_list: Vec<ModMetaEntry> = crate::storage::json_store::read_json_or_default(&meta_path)
        .await
        .unwrap_or_default();

    let mut index_files: Vec<serde_json::Value> = Vec::new();
    let mut overrides: Vec<(String, std::path::PathBuf)> = Vec::new();

    if mods_dir.is_dir() {
        let client = downloader::build_client()?;
        let mut entries = tokio::fs::read_dir(&mods_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let meta = entry.metadata().await?;
            if !meta.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let is_jar = name.ends_with(".jar");
            if !is_jar && !name.ends_with(".jar.disabled") {
                continue;
            }
            let archive_path = format!("mods/{name}");
            let resolved = if is_jar {
                resolve_mrpack_file(&client, &meta_list, &name).await
            } else {
                None
            };
            match resolved {
                Some((download_url, hashes)) => {
                    index_files.push(serde_json::json!({
                        "path": archive_path,
                        "hashes": hashes,
                        "env": { "client": "required", "server": "required" },
                        "downloads": [download_url],
                        "fileSize": meta.len(),
                    }));
                }
                None => overrides.push((archive_path, entry.path())),
            }
        }
    }

    // Настройки и ресурспаки переносим как есть, иначе сборка потеряет конфиги.
    let options_txt = game_dir.join("options.txt");
    if options_txt.is_file() {
        overrides.push(("options.txt".to_string(), options_txt));
    }
    for folder in ["config", "defaultconfigs", "resourcepacks", "shaderpacks"] {
        collect_mrpack_overrides(&game_dir.join(folder), folder, &mut overrides).await;
    }

    let index = serde_json::json!({
        "formatVersion": 1,
        "game": "minecraft",
        "versionId": format!(
            "export-{}",
            chrono::Local::now().format("%Y%m%d-%H%M%S")
        ),
        "name": instance.name,
        "summary": format!("Экспорт сборки «{}»", instance.name),
        "files": index_files,
        "dependencies": mrpack_dependencies(instance),
    });
    let index_bytes = serde_json::to_vec_pretty(&index)?;

    let target_owned = target.to_path_buf();
    tokio::task::spawn_blocking(move || write_mrpack(&target_owned, &index_bytes, &overrides))
        .await
        .map_err(|e| AppError::Process(format!("Не удалось собрать .mrpack: {e}")))??;

    let size_bytes = tokio::fs::metadata(target).await?.len();
    Ok(ExportedMrpack {
        path: target.to_string_lossy().into_owned(),
        size_bytes,
    })
}

async fn collect_mrpack_overrides(
    root: &Path,
    prefix: &str,
    out: &mut Vec<(String, std::path::PathBuf)>,
) {
    if !root.exists() {
        return;
    }
    let mut stack = vec![(root.to_path_buf(), prefix.to_string())];
    while let Some((dir, rel)) = stack.pop() {
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
            let name = entry.file_name().to_string_lossy().to_string();
            let child_rel = format!("{rel}/{name}");
            if file_type.is_dir() {
                stack.push((entry.path(), child_rel));
            } else {
                out.push((child_rel, entry.path()));
            }
        }
    }
}

fn mrpack_dependencies(instance: &Instance) -> serde_json::Value {
    let mut deps = serde_json::Map::new();
    deps.insert(
        "minecraft".to_string(),
        serde_json::Value::String(instance.minecraft_version.clone()),
    );
    if let Some(version) = instance
        .loader_version
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        let key = match instance.loader {
            ModLoaderKind::Fabric => Some("fabric-loader"),
            ModLoaderKind::Quilt => Some("quilt-loader"),
            ModLoaderKind::Forge => Some("forge"),
            ModLoaderKind::NeoForge => Some("neoforge"),
            ModLoaderKind::Vanilla => None,
        };
        if let Some(key) = key {
            deps.insert(
                key.to_string(),
                serde_json::Value::String(version.to_string()),
            );
        }
    }
    serde_json::Value::Object(deps)
}

/// Ищет файл версии на Modrinth, чтобы сохранить прямую ссылку и хеши.
async fn resolve_mrpack_file(
    client: &reqwest::Client,
    meta_list: &[ModMetaEntry],
    file_name: &str,
) -> Option<(String, serde_json::Value)> {
    let meta = meta_list.iter().find(|m| m.file_name == file_name)?;
    let url = format!("{MODRINTH_API_BASE_URL}/version/{}", meta.version_id);
    let response = client
        .get(&url)
        .header("User-Agent", downloader::USER_AGENT)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    let version: ApiVersion = response.json().await.ok()?;
    let file = version
        .files
        .iter()
        .find(|f| f.filename == file_name)
        .or_else(|| {
            if version.files.len() == 1 {
                version.files.first()
            } else {
                None
            }
        })?;

    let mut hashes = serde_json::Map::new();
    for key in ["sha1", "sha512"] {
        if let Some(value) = file.hashes.get(key) {
            hashes.insert(key.to_string(), serde_json::Value::String(value.clone()));
        }
    }
    if hashes.is_empty() {
        return None;
    }
    Some((file.url.clone(), serde_json::Value::Object(hashes)))
}

fn write_mrpack(
    target: &Path,
    index: &[u8],
    overrides: &[(String, std::path::PathBuf)],
) -> AppResult<()> {
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let file = std::fs::File::create(target)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("modrinth.index.json", options)?;
    zip.write_all(index)?;

    for (archive_path, source) in overrides {
        zip.start_file(format!("overrides/{archive_path}"), options)?;
        let mut input = std::fs::File::open(source)?;
        std::io::copy(&mut input, &mut zip)?;
    }

    zip.finish()?;
    Ok(())
}

/// Копирует локальный `.jar` в папку модов и пытается распознать его на Modrinth.
pub async fn install_local_mod(
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
    file_path: &Path,
) -> AppResult<InstalledModFile> {
    if !file_path.is_file() {
        return Err(AppError::NotFound("Файл мода не найден".into()));
    }
    let file_name = file_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::Validation("Некорректное имя файла мода".into()))?
        .to_string();
    let lower = file_name.to_lowercase();
    if !lower.ends_with(".jar") && !lower.ends_with(".jar.disabled") {
        return Err(AppError::Validation(
            "Выберите файл мода в формате .jar".into(),
        ));
    }

    let mods_dir = paths.instance_mods_dir(data_dir, instance_id);
    tokio::fs::create_dir_all(&mods_dir).await?;
    let dest = mods_dir.join(&file_name);
    if tokio::fs::try_exists(&dest).await? {
        return Err(AppError::Validation(
            "Мод с таким именем уже установлен".into(),
        ));
    }

    if let Err(err) = tokio::fs::copy(file_path, &dest).await {
        let _ = tokio::fs::remove_file(&dest).await;
        return Err(err.into());
    }

    let installed = list_installed_mods(paths, data_dir, instance_id).await?;
    let size_bytes = tokio::fs::metadata(&dest).await?.len();
    Ok(installed
        .into_iter()
        .find(|entry| entry.file_name == file_name)
        .unwrap_or(InstalledModFile {
            file_name,
            kind: "mod".to_string(),
            size_bytes,
            project_id: None,
            title: None,
            icon_url: None,
            version_id: None,
            version_number: None,
        }))
}

#[cfg(test)]
mod tests {
    use super::safe_mrpack_relative_path;
    use std::path::PathBuf;

    #[test]
    fn mrpack_paths_stay_inside_game_dir() {
        assert_eq!(
            safe_mrpack_relative_path("mods/example.jar"),
            Some(PathBuf::from("mods").join("example.jar"))
        );
        assert_eq!(
            safe_mrpack_relative_path("mods\\example.jar"),
            Some(PathBuf::from("mods").join("example.jar"))
        );
        // В чужих модпаках встречаются абсолютные пути и переходы вверх.
        assert!(safe_mrpack_relative_path("../outside.jar").is_none());
        assert!(safe_mrpack_relative_path("mods/../../outside.jar").is_none());
        assert!(safe_mrpack_relative_path("").is_none());
        assert!(safe_mrpack_relative_path("/etc/passwd").is_none());
        if cfg!(windows) {
            assert!(safe_mrpack_relative_path("C:/Windows/System32/drivers").is_none());
        }
    }
}
