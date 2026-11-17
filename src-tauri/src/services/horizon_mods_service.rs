use crate::config::endpoints::HORIZON_MODS_INDEX_URL;
use crate::error::{AppError, AppResult};
use crate::services::downloader::get_json;
use crate::services::modrinth_service::{InstalledModFile, ModMetaEntry};
use crate::storage::paths::AppPaths;
 
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{Duration, SystemTime};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HorizonModsIndex {
    pub schema: Option<u32>,
    pub generated: Option<String>,
    pub projects: Vec<HorizonModProject>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HorizonModProject {
    pub id: String,
    pub kind: String,
    pub name: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub authors: Vec<String>,
    pub license: Option<String>,
    pub source: Option<String>,
    pub icon: Option<String>,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub screenshots: Vec<String>,
    #[serde(default)]
    pub downloads: u64,
    #[serde(default)]
    pub versions: Vec<HorizonModVersion>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HorizonModVersion {
    pub version: String,
    pub published: Option<String>,
    pub changelog: Option<String>,
    pub game: Option<String>,
    pub file: Option<HorizonModFile>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HorizonModFile {
    pub name: String,
    pub url: String,
    pub size: Option<u64>,
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHorizonModsRequest {
    pub query: String,
    pub kind: Option<String>,
    pub category: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HorizonModSearchHit {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub summary: String,
    pub author: String,
    pub icon: Option<String>,
    pub downloads: u64,
    pub categories: Vec<String>,
    pub latest_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HorizonModsSearchResult {
    pub hits: Vec<HorizonModSearchHit>,
    pub total_hits: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HorizonModDetailsDto {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub summary: String,
    pub description: String,
    pub author: String,
    pub icon: Option<String>,
    pub downloads: u64,
    pub categories: Vec<String>,
    pub screenshots: Vec<String>,
    pub source: Option<String>,
    pub license: Option<String>,
    pub versions: Vec<HorizonModVersionDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HorizonModVersionDto {
    pub version: String,
    pub published: String,
    pub game: String,
    pub file_name: String,
    pub file_size: u64,
}

async fn load_index(paths: &AppPaths, data_dir: &Path) -> AppResult<HorizonModsIndex> {
    let cache_file = paths.horizon_mods_cache_file(data_dir);
    let cache_fresh = tokio::fs::metadata(&cache_file)
        .await
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| SystemTime::now().duration_since(t).ok())
        .map(|age| age < Duration::from_secs(15 * 60))
        .unwrap_or(false);

    if cache_fresh {
        if let Ok(bytes) = tokio::fs::read(&cache_file).await {
            if let Ok(parsed) = serde_json::from_slice::<HorizonModsIndex>(&bytes) {
                return Ok(parsed);
            }
        }
    }

    let client = crate::services::downloader::build_client()?;

    match get_json::<HorizonModsIndex>(&client, HORIZON_MODS_INDEX_URL).await {
        Ok(index) => {
            let _ = crate::storage::json_store::write_json_atomic(&cache_file, &index).await;
            Ok(index)
        }
        Err(err) => {
            if let Ok(bytes) = tokio::fs::read(&cache_file).await {
                if let Ok(parsed) = serde_json::from_slice::<HorizonModsIndex>(&bytes) {
                    return Ok(parsed);
                }
            }
            Err(err)
        }
    }
}

pub async fn search_mods(
    paths: &AppPaths,
    data_dir: &Path,
    req: SearchHorizonModsRequest,
) -> AppResult<HorizonModsSearchResult> {
    let index = load_index(paths, data_dir).await?;
    let q = req.query.trim().to_lowercase();
    let kind_filter = req.kind.as_deref().filter(|k| !k.is_empty() && *k != "all");
    let cat_filter = req
        .category
        .as_deref()
        .filter(|c| !c.is_empty() && *c != "all");

    let mut filtered: Vec<HorizonModProject> = index
        .projects
        .into_iter()
        .filter(|p| p.kind != "modpack" && p.kind != "datapack")
        .filter(|p| {
            if let Some(kf) = kind_filter {
                if p.kind != kf {
                    return false;
                }
            }
            if let Some(cf) = cat_filter {
                if !p.categories.iter().any(|c| c.eq_ignore_ascii_case(cf)) {
                    return false;
                }
            }
            if !q.is_empty() {
                let in_name = p.name.to_lowercase().contains(&q);
                let in_id = p.id.to_lowercase().contains(&q);
                let in_sum = p.summary.to_lowercase().contains(&q);
                let in_auth = p.authors.iter().any(|a| a.to_lowercase().contains(&q));
                if !in_name && !in_id && !in_sum && !in_auth {
                    return false;
                }
            }
            true
        })
        .collect();

    filtered.sort_by(|a, b| b.downloads.cmp(&a.downloads));

    let total_hits = filtered.len() as u64;
    let offset = req.offset.unwrap_or(0) as usize;
    let limit = req.limit.unwrap_or(24).clamp(1, 50) as usize;

    let hits = filtered
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|p| HorizonModSearchHit {
            id: p.id,
            kind: p.kind,
            name: p.name,
            summary: p.summary,
            author: p.authors.join(", "),
            icon: p.icon,
            downloads: p.downloads,
            categories: p.categories,
            latest_version: p.versions.first().map(|v| v.version.clone()),
        })
        .collect();

    Ok(HorizonModsSearchResult { hits, total_hits })
}

pub async fn get_project_details(
    paths: &AppPaths,
    data_dir: &Path,
    project_id: &str,
) -> AppResult<HorizonModDetailsDto> {
    let index = load_index(paths, data_dir).await?;
    let p = index
        .projects
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| AppError::NotFound(format!("Мод Horizon '{project_id}' не найден")))?;

    let versions = p
        .versions
        .into_iter()
        .filter_map(|v| {
            let file = v.file?;
            Some(HorizonModVersionDto {
                version: v.version,
                published: v.published.unwrap_or_default(),
                game: v.game.unwrap_or_else(|| "26.3".to_string()),
                file_name: file.name,
                file_size: file.size.unwrap_or(0),
            })
        })
        .collect();

    Ok(HorizonModDetailsDto {
        id: p.id,
        kind: p.kind,
        name: p.name,
        summary: p.summary,
        description: p.description,
        author: p.authors.join(", "),
        icon: p.icon,
        downloads: p.downloads,
        categories: p.categories,
        screenshots: p.screenshots,
        source: p.source,
        license: p.license,
        versions,
    })
}

pub async fn install_mod(
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
    project_id: &str,
    version_str: Option<&str>,
) -> AppResult<InstalledModFile> {
    let index = load_index(paths, data_dir).await?;
    let project = index
        .projects
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| AppError::NotFound(format!("Мод Horizon '{project_id}' не найден")))?;

    let chosen = if let Some(v) = version_str {
        project
            .versions
            .iter()
            .find(|ver| ver.version == v && ver.file.is_some())
            .ok_or_else(|| AppError::NotFound(format!("Версия '{v}' не найдена")))?
    } else {
        project
            .versions
            .iter()
            .find(|ver| ver.file.is_some())
            .ok_or_else(|| AppError::NotFound("У этого мода нет файлов для скачивания".into()))?
    };

    let file = chosen
        .file
        .as_ref()
        .ok_or_else(|| AppError::NotFound("Файл версии отсутствует".into()))?;

    let safe_name = Path::new(&file.name)
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| AppError::Validation("Некорректное имя файла мода".into()))?;

    let dest_dir = match project.kind.as_str() {
        "shader" => paths.instance_shaderpacks_dir(data_dir, instance_id),
        "resourcepack" => paths.instance_resourcepacks_dir(data_dir, instance_id),
        "native-mod" => paths.instance_horizon_native_mods_dir(data_dir, instance_id),
        _ => paths.instance_horizon_mods_dir(data_dir, instance_id),
    };
    tokio::fs::create_dir_all(&dest_dir).await?;

    let meta_path = paths.instance_dir(data_dir, instance_id).join("mods-meta.json");

    let client = crate::services::downloader::build_client()?;
    let dest = dest_dir.join(safe_name);

    // Пишем сразу на диск: ресурспак в сотни мегабайт не должен целиком
    // проходить через память, а временный файл подменяется атомарно.
    crate::services::downloader::download_file(&client, &file.url, &dest, None).await?;

    if let Some(expected_sha256) = &file.sha256 {
        let actual = crate::services::downloader::hash_file_sha256(&dest).await?;
        if !actual.eq_ignore_ascii_case(expected_sha256) {
            let _ = tokio::fs::remove_file(&dest).await;
            return Err(AppError::Validation(format!(
                "Контрольная сумма SHA-256 не совпала для {safe_name}"
            )));
        }
    }

    let size_bytes = tokio::fs::metadata(&dest).await?.len();

    let entry = ModMetaEntry {
        file_name: safe_name.to_string(),
        project_id: project.id.clone(),
        title: Some(project.name.clone()),
        icon_url: project.icon.clone(),
        version_id: chosen.version.clone(),
        version_number: chosen.version.clone(),
    };
    {
        let _guard = crate::storage::json_store::lock_file(&meta_path).await;
        let mut meta_list: Vec<ModMetaEntry> =
            crate::storage::json_store::read_json_or_default(&meta_path)
                .await
                .unwrap_or_default();
        // Файл прошлой версии того же проекта больше не нужен: имя у новой
        // версии обычно другое, и без удаления в сборке остались бы два мода.
        for old in meta_list
            .iter()
            .filter(|m| m.project_id == project.id && m.file_name != safe_name)
        {
            let old_path = dest_dir.join(&old.file_name);
            if old_path.exists() {
                let _ = tokio::fs::remove_file(old_path).await;
            }
        }
        meta_list.retain(|m| m.project_id != project.id && m.file_name != safe_name);
        meta_list.push(entry.clone());
        crate::storage::json_store::write_json_atomic(&meta_path, &meta_list).await?;
    }

    let kind = match project.kind.as_str() {
        "shader" => "shader",
        "resourcepack" => "resourcepack",
        _ => "mod",
    }
    .to_string();
    Ok(InstalledModFile {
        file_name: safe_name.to_string(),
        kind,
        size_bytes,
        project_id: Some(entry.project_id),
        title: entry.title,
        icon_url: entry.icon_url,
        version_id: Some(entry.version_id),
        version_number: Some(entry.version_number),
    })
}
