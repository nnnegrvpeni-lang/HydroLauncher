use crate::error::{AppError, AppResult};
use crate::models::instance::{CreateInstanceRequest, EngineKind, Instance, ModLoaderKind};
use crate::services::{instance_archive_service, instance_service, modrinth_service};
use crate::storage::paths::AppPaths;
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};

/// Что именно лежит в перетащенном объекте. Тип определяется по содержимому,
/// а не по расширению: `.zip` может быть и модпаком, и миром, и ресурспаком.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DropKind {
    Modpack,
    Instance,
    /// Сборка Prism Launcher / MultiMC, папка с `mmc-pack.json`.
    Prism,
    World,
    Resourcepack,
    Mod,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DropItem {
    pub path: String,
    pub file_name: String,
    pub kind: DropKind,
    /// Для папок размер не считается: обход большого мира задержал бы бросок.
    pub size_bytes: u64,
    pub is_dir: bool,
    /// Пояснение для неподдерживаемых объектов.
    pub hint: Option<String>,
}

pub struct Classified {
    pub kind: DropKind,
    pub hint: Option<String>,
}

fn file_name_of(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

fn extension(path: &Path) -> String {
    path.extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

fn zip_names(path: &Path) -> AppResult<Vec<String>> {
    let file = std::fs::File::open(path)?;
    let archive = zip::ZipArchive::new(file)
        .map_err(|e| AppError::Validation(format!("Архив повреждён: {e}")))?;
    Ok(archive
        .file_names()
        .map(|name| name.replace('\\', "/").trim_start_matches('/').to_string())
        .collect())
}

fn classify_zip_names(names: &[String]) -> Classified {
    let has = |name: &str| names.iter().any(|entry| entry == name);
    let has_suffix = |suffix: &str| names.iter().any(|entry| entry.ends_with(suffix));

    if has("modrinth.index.json") {
        return Classified {
            kind: DropKind::Modpack,
            hint: None,
        };
    }
    if has("hydro-instance.json") {
        return Classified {
            kind: DropKind::Instance,
            hint: None,
        };
    }
    if has("mmc-pack.json") || has("instance.cfg") {
        return Classified {
            kind: DropKind::Prism,
            hint: None,
        };
    }
    if has("level.dat") || has_suffix("/level.dat") {
        return Classified {
            kind: DropKind::World,
            hint: None,
        };
    }
    if has("pack.mcmeta") || has_suffix("/pack.mcmeta") {
        return Classified {
            kind: DropKind::Resourcepack,
            hint: None,
        };
    }

    Classified {
        kind: DropKind::Unknown,
        hint: Some("В архиве нет level.dat, pack.mcmeta или манифеста сборки".to_string()),
    }
}

fn classify_zip(path: &Path) -> Classified {
    match zip_names(path) {
        Ok(names) => classify_zip_names(&names),
        Err(err) => Classified {
            kind: DropKind::Unknown,
            hint: Some(err.to_string()),
        },
    }
}

fn classify_dir(path: &Path) -> Classified {
    let has = |name: &str| path.join(name).is_file();

    if has("hydro-instance.json") {
        return Classified {
            kind: DropKind::Instance,
            hint: None,
        };
    }
    if has("instance.cfg") || has("mmc-pack.json") {
        return Classified {
            kind: DropKind::Prism,
            hint: None,
        };
    }
    if has("modrinth.index.json") {
        return Classified {
            kind: DropKind::Unknown,
            hint: Some(
                "Это распакованный модпак — упакуйте папку в .mrpack и перетащите снова"
                    .to_string(),
            ),
        };
    }
    if has("level.dat") {
        return Classified {
            kind: DropKind::World,
            hint: None,
        };
    }
    if has("pack.mcmeta") {
        return Classified {
            kind: DropKind::Resourcepack,
            hint: None,
        };
    }

    Classified {
        kind: DropKind::Unknown,
        hint: Some(
            "Не похоже на сборку, мир или ресурспак: нет level.dat, pack.mcmeta или манифеста"
                .to_string(),
        ),
    }
}

pub fn classify(path: &Path) -> Classified {
    if path.is_dir() {
        return classify_dir(path);
    }
    match extension(path).as_str() {
        "mrpack" => Classified {
            kind: DropKind::Modpack,
            hint: None,
        },
        "jar" => Classified {
            kind: DropKind::Mod,
            hint: None,
        },
        "zip" => classify_zip(path),
        _ => Classified {
            kind: DropKind::Unknown,
            hint: Some(
                "Поддерживаются .mrpack, .zip, .jar, а также папки сборок и миров".to_string(),
            ),
        },
    }
}

pub fn inspect(paths: &[PathBuf]) -> Vec<DropItem> {
    paths
        .iter()
        .map(|path| {
            let classified = classify(path);
            let is_dir = path.is_dir();
            DropItem {
                path: path.to_string_lossy().into_owned(),
                file_name: file_name_of(path),
                kind: classified.kind,
                size_bytes: if is_dir {
                    0
                } else {
                    std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0)
                },
                is_dir,
                hint: classified.hint,
            }
        })
        .collect()
}

/// Имя, безопасное для папки внутри `saves` или `resourcepacks`.
fn sanitize_name(raw: &str, fallback: &str) -> String {
    let cleaned: String = raw
        .trim()
        .chars()
        .filter(|c| {
            !c.is_control() && !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').trim();
    let limited: String = trimmed.chars().take(64).collect();
    if limited.is_empty() {
        fallback.to_string()
    } else {
        limited
    }
}

fn unique_name(parent: &Path, base: &str) -> String {
    if !parent.join(base).exists() {
        return base.to_string();
    }
    for index in 2..1000 {
        let candidate = format!("{base} ({index})");
        if !parent.join(&candidate).exists() {
            return candidate;
        }
    }
    format!("{base} ({})", uuid::Uuid::new_v4())
}

fn unique_file_name(parent: &Path, file_name: &str) -> String {
    if !parent.join(file_name).exists() {
        return file_name.to_string();
    }
    let path = Path::new(file_name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("pack");
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    for index in 2..1000 {
        let candidate = if ext.is_empty() {
            format!("{stem} ({index})")
        } else {
            format!("{stem} ({index}).{ext}")
        };
        if !parent.join(&candidate).exists() {
            return candidate;
        }
    }
    file_name.to_string()
}

/// Префикс верхней папки в архиве мира: `MyWorld/level.dat` → `MyWorld`.
/// `__MACOSX` и прочий мусор при поиске игнорируется.
fn world_root(names: &[String]) -> Option<String> {
    let level = names.iter().find(|name| {
        name == &"level.dat" || name.ends_with("/level.dat") && !name.starts_with("__MACOSX/")
    })?;
    let parent = level
        .strip_suffix("level.dat")
        .unwrap_or_default()
        .trim_end_matches('/');
    if parent.is_empty() {
        None
    } else {
        Some(parent.to_string())
    }
}

fn extract_world(
    archive: &mut zip::ZipArchive<std::fs::File>,
    dest: &Path,
    prefix: Option<&str>,
) -> AppResult<()> {
    const MAX_EXTRACT_BYTES: u64 = 16 * 1024 * 1024 * 1024;

    let mut extracted = 0u64;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let Some(enclosed) = entry.enclosed_name() else {
            continue;
        };
        let normalized = enclosed.to_string_lossy().replace('\\', "/");
        let relative = match prefix {
            Some(prefix) => match normalized.strip_prefix(prefix) {
                Some(rest) => rest.trim_start_matches('/').to_string(),
                None => continue,
            },
            None => normalized,
        };
        if relative.is_empty() || relative.starts_with("__MACOSX/") {
            continue;
        }

        let relative_path = Path::new(&relative);
        if relative_path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
        {
            continue;
        }
        let out_path = dest.join(relative_path);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)?;
            continue;
        }

        extracted = extracted.saturating_add(entry.size());
        if extracted > MAX_EXTRACT_BYTES {
            return Err(AppError::Validation(
                "Архив мира больше допустимого размера".into(),
            ));
        }
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut out_file = std::fs::File::create(&out_path)?;
        std::io::copy(&mut entry, &mut out_file)?;
    }
    Ok(())
}

/// Копирует мир в `saves` выбранной сборки и возвращает имя папки.
pub async fn import_world(
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
    source: &Path,
    name: Option<String>,
) -> AppResult<String> {
    let saves_dir = paths.instance_game_dir(data_dir, instance_id).join("saves");
    tokio::fs::create_dir_all(&saves_dir).await?;

    if source.is_dir() {
        let default_name = file_name_of(source);
        let base = sanitize_name(
            name.as_deref().unwrap_or(default_name.as_str()),
            "Импорт мира",
        );
        let folder = unique_name(&saves_dir, &base);
        let dest = saves_dir.join(&folder);
        instance_service::copy_dir_recursive(source, &dest).await?;
        return Ok(folder);
    }

    let source = source.to_path_buf();
    let prefix = {
        let names = zip_names(&source)?;
        if world_root(&names).is_none()
            && !names
                .iter()
                .any(|entry| entry == "level.dat" || entry.ends_with("/level.dat"))
        {
            return Err(AppError::Validation(
                "В архиве нет level.dat — это не мир".into(),
            ));
        }
        world_root(&names)
    };

    let base_name = name.unwrap_or_else(|| {
        prefix
            .as_deref()
            .and_then(|prefix| prefix.rsplit('/').next())
            .map(str::to_string)
            .unwrap_or_else(|| {
                source
                    .file_stem()
                    .and_then(|stem| stem.to_str())
                    .unwrap_or("world")
                    .to_string()
            })
    });
    let base = sanitize_name(&base_name, "Импорт мира");
    let folder = unique_name(&saves_dir, &base);
    let dest = saves_dir.join(&folder);
    let dest_for_task = dest.clone();

    let extracted = tokio::task::spawn_blocking(move || -> AppResult<()> {
        let file = std::fs::File::open(&source)?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| AppError::Validation(format!("Архив повреждён: {e}")))?;
        extract_world(&mut archive, &dest_for_task, prefix.as_deref())
    })
    .await
    .map_err(|err| AppError::Process(format!("Не удалось распаковать мир: {err}")))?;

    if let Err(err) = extracted {
        let _ = tokio::fs::remove_dir_all(&dest).await;
        return Err(err);
    }
    Ok(folder)
}

/// Копирует ресурспак в папку сборки и возвращает итоговое имя.
pub async fn import_resourcepack(
    paths: &AppPaths,
    data_dir: &Path,
    instance_id: &str,
    source: &Path,
) -> AppResult<String> {
    let target_dir = paths.instance_resourcepacks_dir(data_dir, instance_id);
    tokio::fs::create_dir_all(&target_dir).await?;

    if source.is_dir() {
        let base = sanitize_name(&file_name_of(source), "Ресурспак");
        let folder = unique_name(&target_dir, &base);
        instance_service::copy_dir_recursive(source, &target_dir.join(&folder)).await?;
        return Ok(folder);
    }

    if extension(source) != "zip" {
        return Err(AppError::Validation(
            "Ресурспак должен быть .zip или папкой".into(),
        ));
    }
    let name = unique_file_name(&target_dir, &file_name_of(source));
    tokio::fs::copy(source, target_dir.join(&name)).await?;
    Ok(name)
}

/// Кладёт одиночный `.jar` в сборку через обычный установщик локальных модов.
pub async fn import_mod(
    paths: &AppPaths,
    data_dir: &Path,
    instance: &Instance,
    source: &Path,
) -> AppResult<String> {
    if instance.engine == EngineKind::Horizon {
        return Err(AppError::Validation(
            "Моды .jar устанавливаются только в сборки Java Edition".into(),
        ));
    }
    if extension(source) != "jar" {
        return Err(AppError::Validation("Мод должен быть .jar".into()));
    }
    let installed =
        modrinth_service::install_local_mod(paths, data_dir, &instance.id, source).await?;
    Ok(installed.file_name)
}

#[derive(Debug, Deserialize)]
struct PrismPack {
    #[serde(default)]
    components: Vec<PrismComponent>,
}

#[derive(Debug, Deserialize)]
struct PrismComponent {
    uid: String,
    version: String,
}

fn prism_version(components: &[PrismComponent], uid: &str) -> Option<String> {
    components
        .iter()
        .find(|component| component.uid == uid)
        .map(|component| component.version.clone())
}

fn prism_loader(components: &[PrismComponent]) -> (ModLoaderKind, Option<String>) {
    for (uid, loader) in [
        ("net.fabricmc.fabric-loader", ModLoaderKind::Fabric),
        ("org.quiltmc.quilt-loader", ModLoaderKind::Quilt),
        ("net.minecraftforge", ModLoaderKind::Forge),
        ("net.neoforged", ModLoaderKind::NeoForge),
    ] {
        if let Some(version) = prism_version(components, uid) {
            return (loader, Some(version));
        }
    }
    (ModLoaderKind::Vanilla, None)
}

fn prism_instance_name(source: &Path) -> Option<String> {
    let text = std::fs::read_to_string(source.join("instance.cfg")).ok()?;
    text.lines()
        .map(str::trim)
        .find_map(|line| line.strip_prefix("name="))
        .map(str::to_string)
        .filter(|name| !name.trim().is_empty())
}

/// Импорт сборки Prism Launcher / MultiMC: версия и загрузчик берутся из
/// `mmc-pack.json`, файлы игры — из папки `minecraft` (или `.minecraft`).
pub async fn import_prism(paths: &AppPaths, data_dir: &Path, source: &Path) -> AppResult<Instance> {
    let pack_path = source.join("mmc-pack.json");
    let pack: PrismPack = serde_json::from_slice(&tokio::fs::read(&pack_path).await?)
        .map_err(|e| AppError::Validation(format!("Некорректный mmc-pack.json: {e}")))?;

    let minecraft_version = prism_version(&pack.components, "net.minecraft")
        .ok_or_else(|| AppError::Validation("В сборке не указана версия Minecraft".into()))?;
    let (loader, loader_version) = prism_loader(&pack.components);

    let game_source = [source.join("minecraft"), source.join(".minecraft")]
        .into_iter()
        .find(|candidate| candidate.is_dir())
        .ok_or_else(|| {
            AppError::Validation("В папке сборки нет minecraft/ — импорт невозможен".into())
        })?;

    let raw_name = prism_instance_name(source).unwrap_or_else(|| file_name_of(source));
    let name = instance_archive_service::unique_name(paths, data_dir, &raw_name).await?;

    let created = instance_service::create_instance(
        paths,
        data_dir,
        CreateInstanceRequest {
            name,
            minecraft_version,
            engine: EngineKind::Java,
            loader,
            loader_version,
            icon: None,
            background: None,
        },
    )
    .await?;

    let game_dir = paths.instance_game_dir(data_dir, &created.id);
    if let Err(err) = instance_service::copy_dir_recursive(&game_source, &game_dir).await {
        let _ = instance_service::delete_instance(paths, data_dir, &created.id).await;
        return Err(err);
    }

    Ok(created)
}

/// Импорт папки сборки: свой экспорт HydroLauncher или сборка Prism/MultiMC.
pub async fn import_folder(
    paths: &AppPaths,
    data_dir: &Path,
    source: &Path,
) -> AppResult<Instance> {
    if !source.is_dir() {
        return Err(AppError::NotFound("Папка сборки не найдена".into()));
    }
    if source.join("hydro-instance.json").is_file() {
        return instance_archive_service::import_instance_folder(paths, data_dir, source).await;
    }
    if source.join("mmc-pack.json").is_file() || source.join("instance.cfg").is_file() {
        return import_prism(paths, data_dir, source).await;
    }
    Err(AppError::Validation(
        "Папка не похожа на сборку HydroLauncher, Prism или MultiMC".into(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_dir() -> PathBuf {
        std::env::temp_dir().join(format!("hydro-drop-{}", uuid::Uuid::new_v4()))
    }

    fn write_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let file = std::fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        for (name, data) in entries {
            zip.start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(data).unwrap();
        }
        zip.finish().unwrap();
    }

    #[test]
    fn detects_folder_kinds() {
        let root = temp_dir();
        let world = root.join("world");
        let pack = root.join("pack");
        let prism = root.join("prism");
        std::fs::create_dir_all(&world).unwrap();
        std::fs::create_dir_all(&pack).unwrap();
        std::fs::create_dir_all(&prism).unwrap();
        std::fs::write(world.join("level.dat"), b"x").unwrap();
        std::fs::write(pack.join("pack.mcmeta"), b"{}").unwrap();
        std::fs::write(prism.join("instance.cfg"), b"name=Test").unwrap();

        assert_eq!(classify(&world).kind, DropKind::World);
        assert_eq!(classify(&pack).kind, DropKind::Resourcepack);
        assert_eq!(classify(&prism).kind, DropKind::Prism);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn detects_zip_kinds_by_content() {
        let root = temp_dir();
        std::fs::create_dir_all(&root).unwrap();

        let mrpack = root.join("pack.zip");
        write_zip(&mrpack, &[("modrinth.index.json", b"{}")]);
        assert_eq!(classify(&mrpack).kind, DropKind::Modpack);

        let instance = root.join("instance.zip");
        write_zip(&instance, &[("hydro-instance.json", b"{}")]);
        assert_eq!(classify(&instance).kind, DropKind::Instance);

        let world = root.join("world.zip");
        write_zip(&world, &[("MyWorld/level.dat", b"x")]);
        assert_eq!(classify(&world).kind, DropKind::World);
        assert_eq!(
            world_root(&zip_names(&world).unwrap()),
            Some("MyWorld".into())
        );

        let resourcepack = root.join("res.zip");
        write_zip(&resourcepack, &[("pack.mcmeta", b"{}")]);
        assert_eq!(classify(&resourcepack).kind, DropKind::Resourcepack);

        let unknown = root.join("unknown.zip");
        write_zip(&unknown, &[("readme.txt", b"hi")]);
        assert_eq!(classify(&unknown).kind, DropKind::Unknown);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn sanitizes_folder_names() {
        assert_eq!(sanitize_name("My World", "fallback"), "My World");
        assert_eq!(sanitize_name("..\\evil/world", "fallback"), "evilworld");
        assert_eq!(sanitize_name("   ", "fallback"), "fallback");
    }
}
