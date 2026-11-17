use crate::config::endpoints::MOJANG_RESOURCES_BASE_URL;
use crate::config::endpoints::MOJANG_VERSION_MANIFEST_URL;
use crate::error::{AppError, AppResult};
use crate::models::events::LaunchProgressEvent;
use crate::models::mojang::{
    AssetIndexFile, DownloadArtifact, Library, VersionDetails, VersionManifest, VersionSummary,
};
use crate::services::downloader::{download_file, get_json};
use crate::services::java_rules::{library_allows, native_classifier, rule_allows};
use crate::storage::paths::AppPaths;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Semaphore;

pub fn http_client() -> reqwest::Client {
    crate::services::downloader::build_client().unwrap_or_else(|_| reqwest::Client::new())
}

pub struct MojangService {
    client: reqwest::Client,
}

impl MojangService {
    pub fn new() -> Self {
        Self {
            client: http_client(),
        }
    }

    pub async fn fetch_manifest(
        &self,
        paths: &AppPaths,
        data_dir: &Path,
    ) -> AppResult<VersionManifest> {
        let cache_file = paths.version_manifest_cache(data_dir);

        if tokio::fs::try_exists(&cache_file).await.unwrap_or(false) {
            if let Ok(bytes) = tokio::fs::read(&cache_file).await {
                if let Ok(manifest) = serde_json::from_slice::<VersionManifest>(&bytes) {
                    return Ok(manifest);
                }
            }
        }

        let manifest: VersionManifest = get_json(&self.client, MOJANG_VERSION_MANIFEST_URL).await?;
        let json = serde_json::to_vec(&manifest)?;
        if let Some(parent) = cache_file.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        let _ = tokio::fs::write(&cache_file, json).await;
        Ok(manifest)
    }

    pub async fn fetch_version_details(&self, version_url: &str) -> AppResult<VersionDetails> {
        get_json(&self.client, version_url).await
    }

    pub async fn resolve_details_from_manifest(
        &self,
        paths: &AppPaths,
        data_dir: &Path,
        version_id: &str,
    ) -> AppResult<(VersionDetails, VersionSummary)> {
        let manifest = self.fetch_manifest(paths, data_dir).await?;
        let summary = manifest
            .versions
            .iter()
            .find(|v| v.id == version_id)
            .ok_or_else(|| {
                AppError::NotFound(format!(
                    "Версия '{}' не найдена в манифесте Mojang",
                    version_id
                ))
            })?
            .clone();
        let details = self.fetch_version_details(&summary.url).await?;
        Ok((details, summary))
    }
}

pub struct InstallContext {
    pub app: AppHandle,
    pub paths: AppPaths,
    pub data_dir: PathBuf,
    pub instance_id: String,
    pub max_concurrent: usize,
}

fn emit_progress(ctx: &InstallContext, stage: &str, message: &str, current: u64, total: u64) {
    let percent = if total == 0 {
        0.0
    } else {
        (current as f64 / total as f64) * 100.0
    };
    let _ = ctx.app.emit(
        "launch://progress",
        LaunchProgressEvent {
            instance_id: ctx.instance_id.clone(),
            stage: stage.to_string(),
            message: message.to_string(),
            current,
            total,
            percent,
        },
    );
}

/// Маркер полной установки: без него оборванная загрузка считалась бы
/// готовой и игра запускалась бы без библиотек или ассетов.
const INSTALL_MARKER: &str = ".hydro-complete";

pub async fn is_version_installed(paths: &AppPaths, data_dir: &Path, version_id: &str) -> bool {
    let dir = paths.version_dir(data_dir, version_id);
    let jar = dir.join(format!("{}.jar", version_id));
    if !tokio::fs::try_exists(&jar).await.unwrap_or(false) {
        return false;
    }
    tokio::fs::try_exists(dir.join(INSTALL_MARKER))
        .await
        .unwrap_or(false)
}

pub async fn install_version_files(
    ctx: &InstallContext,
    details: &VersionDetails,
) -> AppResult<()> {
    tokio::fs::create_dir_all(&ctx.data_dir).await?;

    download_client_jar(ctx, details).await?;
    download_asset_index(ctx, details).await?;
    download_assets(ctx, details).await?;
    download_libraries(ctx, details).await?;
    download_natives(ctx, details).await?;
    write_version_json(ctx, details).await?;

    let version_dir = ctx.paths.version_dir(&ctx.data_dir, &details.id);
    tokio::fs::write(version_dir.join(INSTALL_MARKER), b"installed\n").await?;

    emit_progress(ctx, "done", "Файлы готовы к запуску", 1, 1);
    Ok(())
}

/// Ставит файлы версии один раз, даже если её одновременно готовят несколько
/// сборок. Замок версии защищает общие папки библиотек и ассетов, а повторная
/// проверка после замка не заставляет качать всё второй раз.
pub async fn ensure_version_files(
    ctx: &InstallContext,
    details: &VersionDetails,
) -> AppResult<()> {
    let key = format!(
        "version-install:{}",
        ctx.paths.version_dir(&ctx.data_dir, &details.id).display()
    );
    let _guard = crate::storage::json_store::lock_key(&key).await;
    if is_version_installed(&ctx.paths, &ctx.data_dir, &details.id).await {
        return Ok(());
    }
    install_version_files(ctx, details).await
}

/// Собирает результат параллельных загрузок: первая ошибка становится
/// причиной провала установки, а не теряется в `JoinHandle`.
async fn collect_download_results(
    handles: Vec<tokio::task::JoinHandle<AppResult<()>>>,
) -> AppResult<()> {
    let mut failed = 0usize;
    let mut first_error: Option<String> = None;

    for handle in handles {
        let outcome = match handle.await {
            Ok(result) => result,
            Err(err) => Err(AppError::Process(format!("Задача загрузки упала: {err}"))),
        };
        if let Err(err) = outcome {
            failed += 1;
            if first_error.is_none() {
                first_error = Some(err.to_string());
            }
        }
    }

    if failed == 0 {
        return Ok(());
    }

    Err(AppError::Validation(format!(
        "Не удалось скачать файлов: {failed}. Первая ошибка: {}",
        first_error.unwrap_or_else(|| "неизвестна".into())
    )))
}

async fn download_client_jar(ctx: &InstallContext, details: &VersionDetails) -> AppResult<()> {
    let version_dir = ctx.paths.version_dir(&ctx.data_dir, &details.id);
    let dest = version_dir.join(format!("{}.jar", details.id));
    emit_progress(ctx, "client", "Скачивание клиента Minecraft…", 0, 1);
    download_file(
        &http_client(),
        &details.downloads.client.url,
        &dest,
        Some(&details.downloads.client.sha1),
    )
    .await?;
    emit_progress(ctx, "client", "Клиент скачан", 1, 1);
    Ok(())
}

async fn download_asset_index(ctx: &InstallContext, details: &VersionDetails) -> AppResult<()> {
    let assets_dir = ctx.paths.assets_dir(&ctx.data_dir);
    let index_dest = assets_dir
        .join("indexes")
        .join(format!("{}.json", details.asset_index.id));
    emit_progress(ctx, "asset-index", "Загрузка индекса ассетов…", 0, 1);
    download_file(
        &http_client(),
        &details.asset_index.url,
        &index_dest,
        Some(&details.asset_index.sha1),
    )
    .await?;
    emit_progress(ctx, "asset-index", "Индекс ассетов загружен", 1, 1);
    Ok(())
}

async fn download_assets(ctx: &InstallContext, details: &VersionDetails) -> AppResult<()> {
    let assets_dir = ctx.paths.assets_dir(&ctx.data_dir);
    let index_path = assets_dir
        .join("indexes")
        .join(format!("{}.json", details.asset_index.id));

    let raw = tokio::fs::read(&index_path).await?;
    let index: AssetIndexFile = serde_json::from_slice(&raw)?;

    let total = index.objects.len() as u64;
    let done = Arc::new(AtomicU64::new(0));
    let semaphore = Arc::new(Semaphore::new(ctx.max_concurrent));
    let mut handles = Vec::new();

    emit_progress(ctx, "assets", "Скачивание ассетов…", 0, total);

    for (name, obj) in index.objects {
        let client = http_client();
        let assets_dir = assets_dir.clone();
        let semaphore = semaphore.clone();
        let done = done.clone();
        let app = ctx.app.clone();
        let instance_id = ctx.instance_id.clone();

        handles.push(tokio::spawn(async move {
            let _permit = semaphore.acquire_owned().await;
            let hash_prefix = obj
                .hash
                .get(..2)
                .ok_or_else(|| {
                    AppError::Validation(format!("Некорректный хеш ассета: {}", obj.hash))
                })?
                .to_string();
            let dest = assets_dir.join("objects").join(&hash_prefix).join(&obj.hash);
            let url = format!("{}/{}/{}", MOJANG_RESOURCES_BASE_URL, hash_prefix, obj.hash);
            download_file(&client, &url, &dest, Some(&obj.hash)).await?;

            let current = done.fetch_add(1, Ordering::Relaxed) + 1;
            if current % 64 == 0 {
                let percent = if total == 0 {
                    0.0
                } else {
                    (current as f64 / total as f64) * 100.0
                };
                let _ = app.emit(
                    "launch://progress",
                    LaunchProgressEvent {
                        instance_id,
                        stage: "assets".into(),
                        message: format!("Ассеты: {} / {}", current, total),
                        current,
                        total,
                        percent,
                    },
                );
            }
            let _ = name;
            Ok::<(), AppError>(())
        }));
    }

    collect_download_results(handles).await?;
    emit_progress(ctx, "assets", "Ассеты скачаны", total, total);
    Ok(())
}

fn artifact_path(coords: &str, artifact: &DownloadArtifact) -> String {
    artifact
        .path
        .clone()
        .unwrap_or_else(|| maven_artifact_path(coords))
}

/// Классификатор нативов из карты `natives` самой библиотеки: в старых
/// манифестах там встречается `${arch}` (32/64), и без подстановки игра
/// получала не тот бинарник.
fn native_classifier_for(lib: &Library) -> Option<String> {
    let template = lib
        .natives
        .as_ref()?
        .get(crate::services::java_rules::normalized_os())?;
    let arch = if std::env::consts::ARCH == "x86" {
        "32"
    } else {
        "64"
    };
    Some(template.replace("${arch}", arch))
}

fn library_artifact<'a>(
    lib: &'a Library,
) -> Option<(&'a DownloadArtifact, Option<&'a DownloadArtifact>)> {
    let downloads = lib.downloads.as_ref()?;
    let artifact = downloads.artifact.as_ref()?;
    let natives = downloads.classifiers.as_ref().and_then(|classifiers| {
        native_classifier_for(lib)
            .and_then(|key| classifiers.get(&key))
            .or_else(|| classifiers.get(native_classifier()))
    });
    Some((artifact, natives))
}

async fn download_libraries(ctx: &InstallContext, details: &VersionDetails) -> AppResult<()> {
    let libs_dir = ctx.paths.libraries_dir(&ctx.data_dir);
    let allowed: Vec<(&Library, &DownloadArtifact)> = details
        .libraries
        .iter()
        .filter(|l| library_allows(l))
        .filter_map(|l| {
            library_artifact(l).map(|(artifact, _)| (l, artifact))
        })
        .collect();

    let total = allowed.len() as u64;
    emit_progress(ctx, "libraries", "Скачивание библиотек…", 0, total);

    let done = Arc::new(AtomicU64::new(0));
    let semaphore = Arc::new(Semaphore::new(ctx.max_concurrent));
    let mut handles = Vec::new();

    for (lib, artifact) in allowed {
        let maven_path = artifact_path(&lib.name, artifact);
        let client = http_client();
        let dest = libs_dir.join(&maven_path);
        let url = artifact.url.clone();
        let sha = artifact.sha1.clone();
        let semaphore = semaphore.clone();
        let done = done.clone();
        let app = ctx.app.clone();
        let instance_id = ctx.instance_id.clone();

        handles.push(tokio::spawn(async move {
            let _permit = semaphore.acquire_owned().await;
            download_file(&client, &url, &dest, Some(&sha)).await?;
            let current = done.fetch_add(1, Ordering::Relaxed) + 1;
            if current % 8 == 0 {
                let percent = if total == 0 {
                    0.0
                } else {
                    (current as f64 / total as f64) * 100.0
                };
                let _ = app.emit(
                    "launch://progress",
                    LaunchProgressEvent {
                        instance_id,
                        stage: "libraries".into(),
                        message: format!("Библиотеки: {} / {}", current, total),
                        current,
                        total,
                        percent,
                    },
                );
            }
            Ok::<(), AppError>(())
        }));
    }

    collect_download_results(handles).await?;
    emit_progress(ctx, "libraries", "Библиотеки скачаны", total, total);
    Ok(())
}

/// Преобразует Maven-координаты "group:artifact:version[:classifier]" в относительный путь.
pub fn maven_artifact_path(coords: &str) -> String {
    let parts: Vec<&str> = coords.split(':').collect();
    if parts.len() < 3 {
        return coords.replace(':', "/");
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let classifier_ext = parts
        .get(3)
        .map(|c| format!("-{}", c))
        .unwrap_or_default();
    format!(
        "{}/{}/{}/{}-{}{}.jar",
        group, artifact, version, artifact, version, classifier_ext
    )
}

async fn download_natives(ctx: &InstallContext, details: &VersionDetails) -> AppResult<()> {
    let natives_dir = ctx.paths.natives_dir(&ctx.data_dir, &details.id);
    tokio::fs::create_dir_all(&natives_dir).await?;

    let natives_libs: Vec<(&Library, &DownloadArtifact)> = details
        .libraries
        .iter()
        .filter(|l| library_allows(l))
        .filter_map(|l| library_artifact(l).and_then(|(_, n)| n.map(|n| (l, n))))
        .collect();

    let total = natives_libs.len() as u64;
    emit_progress(ctx, "natives", "Распаковка нативных библиотек…", 0, total);

    for (idx, (lib, natives_artifact)) in natives_libs.iter().enumerate() {
        let maven_path = artifact_path(&lib.name, natives_artifact);
        let jar_path = ctx.paths.libraries_dir(&ctx.data_dir).join(&maven_path);

        // Скачиваем или сверяем всегда: лежащий в кэше jar мог быть обрезан
        // или подменён, а распаковка идёт прямо в игру.
        download_file(
            &http_client(),
            &natives_artifact.url,
            &jar_path,
            Some(&natives_artifact.sha1),
        )
        .await?;

        extract_native_binaries(&jar_path, &natives_dir).await?;
        emit_progress(
            ctx,
            "natives",
            "Распаковка нативных библиотек…",
            (idx + 1) as u64,
            total,
        );
    }

    Ok(())
}

async fn extract_native_binaries(jar_path: &Path, dest: &Path) -> AppResult<()> {
    let file = std::fs::File::open(jar_path)?;
    let mut archive = zip::ZipArchive::new(std::io::BufReader::new(file))?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        if entry.is_dir() {
            continue;
        }
        // Только обычные компоненты пути: запись не должна выходить за папку
        // нативов, даже если в jar лежит абсолютный путь.
        let Some(relative) = entry.enclosed_name() else {
            continue;
        };
        if !relative
            .components()
            .all(|component| matches!(component, std::path::Component::Normal(_)))
        {
            continue;
        }
        let name = entry.name().to_string();
        if name.starts_with("META-INF") {
            continue;
        }
        let lower = name.to_ascii_lowercase();
        let is_binary = lower.ends_with(".dll")
            || lower.ends_with(".so")
            || lower.ends_with(".dylib")
            || lower.ends_with(".jnilib");
        if !is_binary {
            continue;
        }
        let out_path = dest.join(relative);
        if let Some(parent) = out_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let mut out_file = std::fs::File::create(&out_path)?;
        std::io::copy(&mut entry, &mut out_file)?;
    }
    Ok(())
}

async fn write_version_json(ctx: &InstallContext, details: &VersionDetails) -> AppResult<()> {
    let version_dir = ctx.paths.version_dir(&ctx.data_dir, &details.id);
    tokio::fs::create_dir_all(&version_dir).await?;
    let dest = version_dir.join(format!("{}.json", details.id));
    let json = serde_json::to_vec_pretty(details)?;
    tokio::fs::write(dest, json).await?;
    Ok(())
}

pub fn collect_classpath(details: &VersionDetails, libs_dir: &Path, client_jar: &Path) -> String {
    let separator = if std::env::consts::OS == "windows" {
        ";"
    } else {
        ":"
    };

    let mut seen = std::collections::HashSet::new();
    let mut entries: Vec<String> = Vec::new();
    for l in details.libraries.iter().filter(|l| library_allows(l)) {
        let rel = if let Some((artifact, _)) = library_artifact(l) {
            artifact_path(&l.name, artifact)
        } else if l.downloads.is_none() && l.natives.is_none() {
            maven_artifact_path(&l.name)
        } else {
            continue;
        };
        let full = libs_dir.join(rel).to_string_lossy().into_owned();
        if seen.insert(full.clone()) {
            entries.push(full);
        }
    }
    let client_str = client_jar.to_string_lossy().into_owned();
    if seen.insert(client_str.clone()) {
        entries.push(client_str);
    }
    entries.join(separator)
}

pub fn compute_launch_args(
    details: &VersionDetails,
    assets_dir: &Path,
    natives_dir: &Path,
    libs_dir: &Path,
    classpath: &str,
    username: &str,
    user_uuid: &str,
    game_dir: &Path,
    memory_mb: u64,
    extra_jvm_args: &[String],
    extra_game_args: &[String],
) -> Vec<String> {
    let natives_str = natives_dir.to_string_lossy().replace('\\', "/");
    let libs_str = libs_dir.to_string_lossy().replace('\\', "/");
    let classpath_str = classpath.replace('\\', "/");
    let game_dir_str = game_dir.to_string_lossy().replace('\\', "/");
    let assets_str = assets_dir.to_string_lossy().replace('\\', "/");

    let mut args: Vec<String> = vec![
        format!("-Xmx{}M", memory_mb),
        "-Dfile.encoding=UTF-8".to_string(),
    ];

    // Манифест сам задаёт classpath и путь к нативам в JVM-аргументах, поэтому
    // добавляем свои только при их отсутствии: два `-cp` в одной команде
    // бессмысленны, а последний молча затирает первый.
    let manifest_jvm = active_jvm_values(details);
    let has_library_path = manifest_jvm.iter().any(|value| {
        value
            .split_whitespace()
            .any(|token| token.starts_with("-Djava.library.path="))
    });
    if !has_library_path {
        args.push(format!("-Djava.library.path={}", natives_str));
    }
    let has_classpath = manifest_jvm.iter().any(|value| {
        value
            .split_whitespace()
            .any(|token| token == "-cp" || token == "-classpath")
    });
    if !has_classpath {
        args.push("-cp".to_string());
        args.push(classpath_str.clone());
    }

    args.extend(extra_jvm_args.iter().cloned());

    if let Some(launch_args) = &details.arguments {
        for entry in &launch_args.jvm {
            match entry {
                crate::models::mojang::ArgumentEntry::Simple(s) => {
                    args.push(replace_jvm_placeholders(
                        s,
                        &natives_str,
                        &libs_str,
                        &classpath_str,
                        &details.id,
                    ));
                }
                crate::models::mojang::ArgumentEntry::Conditional { rules, value } => {
                    if conditional_allows(rules) {
                        match value {
                            crate::models::mojang::ArgumentValue::Single(s) => {
                                args.push(replace_jvm_placeholders(
                                    s,
                                    &natives_str,
                                    &libs_str,
                                    &classpath_str,
                                    &details.id,
                                ));
                            }
                            crate::models::mojang::ArgumentValue::Multiple(list) => {
                                args.extend(
                                    list.iter().map(|value| {
                                        replace_jvm_placeholders(
                                            value,
                                            &natives_str,
                                            &libs_str,
                                            &classpath_str,
                                            &details.id,
                                        )
                                    }),
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    args.push(details.main_class.clone());

    if let Some(launch_args) = &details.arguments {
        for entry in &launch_args.game {
            match entry {
                crate::models::mojang::ArgumentEntry::Simple(s) => {
                    args.push(replace_game_placeholders(
                        s,
                        username,
                        user_uuid,
                        &game_dir_str,
                        &assets_str,
                        &details.asset_index.id,
                        &details.id,
                    ));
                }
                crate::models::mojang::ArgumentEntry::Conditional { rules, value } => {
                    if conditional_allows(rules) {
                        match value {
                            crate::models::mojang::ArgumentValue::Single(s) => {
                                args.push(replace_game_placeholders(
                                    s,
                                    username,
                                    user_uuid,
                                    &game_dir_str,
                                    &assets_str,
                                    &details.asset_index.id,
                                    &details.id,
                                ));
                            }
                            crate::models::mojang::ArgumentValue::Multiple(list) => {
                                args.extend(list.iter().map(|value| {
                                    replace_game_placeholders(
                                        value,
                                        username,
                                        user_uuid,
                                        &game_dir_str,
                                        &assets_str,
                                        &details.asset_index.id,
                                        &details.id,
                                    )
                                }));
                            }
                        }
                    }
                }
            }
        }
    } else if let Some(legacy) = &details.minecraft_arguments {
        // Сначала делим строку на аргументы, потом подставляем значения:
        // путь с пробелами остаётся одним аргументом.
        for token in split_quoted_args(legacy) {
            args.push(replace_legacy_placeholders(
                &token,
                username,
                user_uuid,
                &game_dir_str,
                &assets_str,
                &details.asset_index.id,
                &details.id,
            ));
        }
    }

    args.extend(extra_game_args.iter().cloned());

    args
}

/// Значения JVM-аргументов, которые действительно попадут в командную строку.
fn active_jvm_values(details: &VersionDetails) -> Vec<String> {
    let mut values = Vec::new();
    let Some(launch_args) = &details.arguments else {
        return values;
    };
    for entry in &launch_args.jvm {
        match entry {
            crate::models::mojang::ArgumentEntry::Simple(value) => values.push(value.clone()),
            crate::models::mojang::ArgumentEntry::Conditional { rules, value } => {
                if !conditional_allows(rules) {
                    continue;
                }
                match value {
                    crate::models::mojang::ArgumentValue::Single(value) => {
                        values.push(value.clone())
                    }
                    crate::models::mojang::ArgumentValue::Multiple(list) => {
                        values.extend(list.iter().cloned())
                    }
                }
            }
        }
    }
    values
}

/// Делит строку аргументов как оболочка: пробелы внутри кавычек не разделяют
/// аргументы, сами кавычки в результат не попадают.
fn split_quoted_args(input: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut has_chars = false;

    for ch in input.chars() {
        match quote {
            Some(opened) if ch == opened => quote = None,
            Some(_) => {
                current.push(ch);
                has_chars = true;
            }
            None if ch == '"' || ch == '\'' => {
                quote = Some(ch);
                has_chars = true;
            }
            None if ch.is_whitespace() => {
                if has_chars {
                    result.push(std::mem::take(&mut current));
                    has_chars = false;
                }
            }
            None => {
                current.push(ch);
                has_chars = true;
            }
        }
    }
    if has_chars {
        result.push(current);
    }
    result
}

fn replace_legacy_placeholders(
    template: &str,
    username: &str,
    user_uuid: &str,
    game_dir_str: &str,
    assets_str: &str,
    assets_index_id: &str,
    version_id: &str,
) -> String {
    template
        .replace("${auth_player_name}", username)
        .replace("${version_name}", version_id)
        .replace("${game_directory}", game_dir_str)
        .replace("${assets_root}", assets_str)
        .replace("${assets_index_name}", assets_index_id)
        .replace("${auth_uuid}", user_uuid)
        .replace("${auth_access_token}", "0")
        .replace("${auth_session}", "0")
        .replace("${user_type}", "legacy")
        .replace("${version_type}", "HydroLauncher")
        .replace("${user_properties}", "{}")
        .replace("${profile_name}", username)
}

fn replace_jvm_placeholders(
    template: &str,
    natives_str: &str,
    libs_str: &str,
    classpath_str: &str,
    version_id: &str,
) -> String {
    template
        .replace("${natives_directory}", natives_str)
        .replace("${library_directory}", libs_str)
        .replace("${classpath}", classpath_str)
        .replace("${classpath_separator}", classpath_separator_str())
        .replace("${launcher_name}", "HydroLauncher")
        .replace("${launcher_version}", env!("CARGO_PKG_VERSION"))
        .replace("${version_name}", version_id)
}

fn classpath_separator_str() -> &'static str {
    if std::env::consts::OS == "windows" {
        ";"
    } else {
        ":"
    }
}

fn replace_game_placeholders(
    template: &str,
    username: &str,
    user_uuid: &str,
    game_dir_str: &str,
    assets_str: &str,
    assets_index_id: &str,
    version_id: &str,
) -> String {
    template
        .replace("${auth_player_name}", username)
        .replace("${auth_uuid}", user_uuid)
        .replace("${auth_access_token}", "0")
        .replace("${auth_xuid}", "0")
        .replace("${clientid}", "hydro-launcher")
        .replace("${user_type}", "legacy")
        .replace("${user_properties}", "{}")
        .replace("${version_name}", version_id)
        .replace("${version_type}", "HydroLauncher")
        .replace("${game_directory}", game_dir_str)
        .replace("${assets_root}", assets_str)
        .replace("${assets_index_name}", assets_index_id)
        .replace("${resolution_width}", "1280")
        .replace("${resolution_height}", "720")
        .replace("${quickPlayPath}", "")
        .replace("${quickPlaySingleplayer}", "")
        .replace("${quickPlayMultiplayer}", "")
        .replace("${quickPlayRealms}", "")
}

fn conditional_allows(rules: &[crate::models::mojang::LibraryRule]) -> bool {
    if rules.is_empty() {
        return true;
    }
    rules
        .iter()
        .filter(|r| r.action == "allow")
        .any(rule_allows)
        && !rules
            .iter()
            .filter(|r| r.action == "disallow")
            .any(rule_allows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::mojang::VersionDetails;
    use std::path::Path;

    fn base_details(extra: serde_json::Value) -> VersionDetails {
        let mut value = serde_json::json!({
            "id": "1.21.4",
            "type": "release",
            "mainClass": "net.minecraft.client.main.Main",
            "assetIndex": {
                "id": "17",
                "sha1": "0000",
                "size": 1,
                "url": "https://example.invalid/17.json"
            },
            "assets": "17",
            "downloads": {
                "client": {
                    "sha1": "0000",
                    "size": 1,
                    "url": "https://example.invalid/client.jar"
                }
            },
            "libraries": []
        });
        if let (Some(target), Some(extra)) = (value.as_object_mut(), extra.as_object()) {
            for (key, item) in extra {
                target.insert(key.clone(), item.clone());
            }
        }
        serde_json::from_value(value).expect("тестовый манифест должен разбираться")
    }

    #[test]
    fn splits_legacy_arguments_respecting_quotes() {
        let args = split_quoted_args("--width 1280 --title \"My World\" 'two words'");
        assert_eq!(
            args,
            vec!["--width", "1280", "--title", "My World", "two words"]
        );
    }

    #[test]
    fn legacy_launch_keeps_path_with_spaces_as_one_argument() {
        let details = base_details(serde_json::json!({
            "minecraftArguments":
                "--username ${auth_player_name} --gameDir ${game_directory} --session ${auth_session}"
        }));

        let args = compute_launch_args(
            &details,
            Path::new("/assets"),
            Path::new("/natives"),
            Path::new("/libraries"),
            "/libraries/a.jar",
            "Steve",
            "uuid",
            Path::new("C:/games/My World"),
            1024,
            &[],
            &[],
        );

        assert!(args.contains(&"Steve".to_string()));
        assert!(args.contains(&"C:/games/My World".to_string()));
        let session = args
            .iter()
            .position(|value| value == "--session")
            .expect("сессия должна быть в аргументах");
        assert_eq!(args[session + 1], "0");
        assert!(!args.iter().any(|value| value.contains("${auth_session}")));
    }

    #[test]
    fn manifest_classpath_is_not_duplicated() {
        let details = base_details(serde_json::json!({
            "arguments": {
                "game": ["--version", "${version_name}"],
                "jvm": [
                    "-Djava.library.path=${natives_directory}",
                    { "rules": [], "value": ["-cp", "${classpath}"] }
                ]
            }
        }));

        let args = compute_launch_args(
            &details,
            Path::new("/assets"),
            Path::new("/natives"),
            Path::new("/libraries"),
            "/libraries/a.jar",
            "Steve",
            "uuid",
            Path::new("/game"),
            1024,
            &[],
            &["--width".to_string(), "1920".to_string()],
        );

        assert_eq!(
            args.iter().filter(|value| value.as_str() == "-cp").count(),
            1,
            "в команде должен остаться один classpath"
        );
        assert_eq!(
            args.iter()
                .filter(|value| value.starts_with("-Djava.library.path="))
                .count(),
            1
        );
        assert_eq!(args[args.len() - 2], "--width");
        assert_eq!(args[args.len() - 1], "1920");
    }
}
