use crate::config::endpoints::ADOPTIUM_API_BASE_URL;
use crate::error::{AppError, AppResult};
use crate::models::java::JavaRuntime;
use crate::services::downloader::download_file;
use crate::storage::paths::AppPaths;
use std::path::{Path, PathBuf};
use tokio::process::Command;

pub struct JavaService {
    client: reqwest::Client,
}

impl JavaService {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .user_agent("HydroLauncher/0.1")
                .build()
                .expect("Не удалось создать HTTP-клиент"),
        }
    }

    pub async fn detect_system_runtimes(
        &self,
        extra_paths: &[String],
    ) -> AppResult<Vec<JavaRuntime>> {
        let mut candidates: Vec<PathBuf> = Vec::new();

        if let Ok(java_home) = std::env::var("JAVA_HOME") {
            candidates.push(PathBuf::from(java_home).join(java_exec_name()));
        }
        if let Ok(path_var) = std::env::var("PATH") {
            for dir in std::env::split_paths(&path_var) {
                candidates.push(dir.join(java_exec_name()));
            }
        }
        for extra in extra_paths {
            let path = PathBuf::from(extra);
            if path.is_dir() {
                candidates.push(path.join(java_exec_name()));
            } else {
                candidates.push(path);
            }
        }
        candidates.extend(well_known_locations());

        let mut found: Vec<JavaRuntime> = Vec::new();
        let mut seen: Vec<PathBuf> = Vec::new();

        for candidate in candidates {
            if !candidate.is_file() {
                continue;
            }
            let canonical = candidate.canonicalize().unwrap_or(candidate.clone());
            if seen.contains(&canonical) {
                continue;
            }
            seen.push(canonical.clone());

            if let Ok(runtime) = probe_java(&candidate).await {
                found.push(runtime);
            }
        }

        Ok(found)
    }

    pub async fn list_managed_runtimes(
        &self,
        paths: &AppPaths,
        data_dir: &Path,
    ) -> AppResult<Vec<JavaRuntime>> {
        let runtimes_dir = paths.runtimes_dir(data_dir);
        if !tokio::fs::try_exists(&runtimes_dir).await? {
            return Ok(Vec::new());
        }

        let mut result = Vec::new();
        let mut entries = tokio::fs::read_dir(&runtimes_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let exec = entry.path().join("bin").join(java_exec_name());
            if exec.is_file() {
                if let Ok(runtime) = probe_java(&exec).await {
                    result.push(runtime);
                }
            }
        }
        Ok(result)
    }

    pub async fn download_runtime(
        &self,
        paths: &AppPaths,
        data_dir: &Path,
        major_version: u32,
    ) -> AppResult<JavaRuntime> {
        let download_url = adoptium_binary_url(major_version);
        let archive_name = self
            .resolve_archive_name(&download_url, major_version)
            .await?;

        let runtimes_dir = paths.runtimes_dir(data_dir);
        let dest_dir = runtimes_dir.join(format!("jdk-{}", major_version));
        tokio::fs::create_dir_all(&dest_dir).await?;

        let archive_path = dest_dir.join(&archive_name);
        download_file(&self.client, &download_url, &archive_path, None).await?;

        extract_archive(&archive_path, &dest_dir)?;
        let _ = tokio::fs::remove_file(&archive_path).await;

        // При распаковке может появиться вложенная папка "jdk-XX.Y.Z+N" — нормализуем.
        let home_dir = find_java_home_dir(&dest_dir)?;
        let exec = home_dir.join("bin").join(java_exec_name());
        if !exec.is_file() {
            return Err(AppError::JavaRequired(format!(
                "После распаковки JDK {} не найден исполняемый файл java",
                major_version
            )));
        }

        probe_java(&exec).await
    }

    /// Возвращает существующий управляемый рантайм нужной мажорной версии
    /// или скачивает и распаковывает его.
    pub async fn ensure_runtime(
        &self,
        paths: &AppPaths,
        data_dir: &Path,
        major_version: u32,
    ) -> AppResult<JavaRuntime> {
        let managed = self.list_managed_runtimes(paths, data_dir).await?;
        if let Some(existing) = managed.iter().find(|r| r.major_version == major_version) {
            return Ok(existing.clone());
        }
        self.download_runtime(paths, data_dir, major_version).await
    }

    /// Определяет имя архива: из заголовка Content-Disposition, иначе — запасной вариант.
    async fn resolve_archive_name(&self, url: &str, major_version: u32) -> AppResult<String> {
        let response = self.client.get(url).send().await?.error_for_status()?;

        let fallback = default_archive_name(major_version);
        let disposition = response
            .headers()
            .get(reqwest::header::CONTENT_DISPOSITION)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        let name = disposition
            .rsplit_once("filename=")
            .map(|(_, tail)| tail.trim().trim_matches('"').to_string())
            .filter(|s| !s.is_empty());

        Ok(name.unwrap_or_else(|| fallback.to_string()))
    }
}

/// Прямой redirect-endpoint Adoptium, отдающий архив последнего GA-релиза JRE.
fn adoptium_binary_url(major_version: u32) -> String {
    format!(
        "{}/binary/latest/{}/ga/{}/{}/jre/hotspot/normal/eclipse?project=jdk",
        ADOPTIUM_API_BASE_URL,
        major_version,
        adoptium_os(),
        adoptium_arch()
    )
}

fn adoptium_os() -> &'static str {
    match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "mac",
        "linux" => "linux",
        other => other,
    }
}

fn adoptium_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "aarch64",
        other => other,
    }
}

fn default_archive_name(major_version: u32) -> String {
    if std::env::consts::OS == "windows" {
        format!("temurin-{}.zip", major_version)
    } else {
        format!("temurin-{}.tar.gz", major_version)
    }
}

fn java_exec_name() -> &'static str {
    if std::env::consts::OS == "windows" {
        "java.exe"
    } else {
        "java"
    }
}

fn well_known_locations() -> Vec<PathBuf> {
    if std::env::consts::OS != "windows" {
        return Vec::new();
    }
    let mut result = Vec::new();
    let roots = [
        "C:\\Program Files\\Java",
        "C:\\Program Files (x86)\\Java",
        "C:\\Program Files\\Eclipse Adoptium",
        "C:\\Program Files\\Microsoft",
        "C:\\Program Files\\Amazon Corretto",
        "C:\\Program Files\\Zulu",
    ];
    for root in roots {
        if let Ok(entries) = std::fs::read_dir(root) {
            for entry in entries.flatten() {
                result.push(entry.path().join("bin").join(java_exec_name()));
            }
        }
    }
    result
}

pub async fn probe_java(exec: &Path) -> AppResult<JavaRuntime> {
    let output = Command::new(exec)
        .arg("-version")
        .output()
        .await
        .map_err(|e| {
            AppError::Process(format!(
                "Не удалось запустить '{}': {}",
                exec.display(),
                e
            ))
        })?;

    // java -version пишет сведения о версии в stderr
    let stderr = String::from_utf8_lossy(&output.stderr);
    let version_line = stderr.lines().next().unwrap_or("").trim().to_string();

    let (version, major) = parse_java_version(&version_line)?;

    Ok(JavaRuntime {
        path: exec.to_string_lossy().into_owned(),
        version,
        major_version: major,
        vendor: detect_vendor(&version_line),
        arch: std::env::consts::ARCH.to_string(),
        is_managed: false,
    })
}

fn detect_vendor(version_line: &str) -> String {
    let lowered = version_line.to_lowercase();
    if lowered.contains("temurin") || lowered.contains("adoptium") {
        "Eclipse Temurin".into()
    } else if lowered.contains("corretto") {
        "Amazon Corretto".into()
    } else if lowered.contains("zulu") {
        "Azul Zulu".into()
    } else if lowered.contains("oracle") {
        "Oracle JDK".into()
    } else if lowered.contains("openjdk") {
        "OpenJDK".into()
    } else {
        "Unknown".into()
    }
}

fn parse_java_version(version_line: &str) -> AppResult<(String, u32)> {
    // Примеры: 'java version "17.0.11"' | 'openjdk version "21.0.3"'
    let quoted = version_line
        .split('"')
        .nth(1)
        .ok_or_else(|| {
            AppError::JavaRequired(format!(
                "Не удалось разобрать версию Java: {}",
                version_line
            ))
        })?
        .to_string();

    let major: u32 = quoted
        .split('.')
        .next()
        .and_then(|v| v.parse().ok())
        .ok_or_else(|| {
            AppError::JavaRequired(format!("Некорректный номер версии Java: {}", quoted))
        })?;

    Ok((quoted, major))
}

fn extract_archive(archive_path: &Path, dest_dir: &Path) -> AppResult<()> {
    let name = archive_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();

    if name.ends_with(".zip") {
        let file = std::fs::File::open(archive_path)?;
        let mut zip = zip::ZipArchive::new(std::io::BufReader::new(file))?;
        zip.extract(dest_dir)?;
        return Ok(());
    }

    if name.ends_with(".tar.gz") {
        let gz = flate2::read::GzDecoder::new(std::fs::File::open(archive_path)?);
        let mut archive = tar::Archive::new(gz);
        archive.unpack(dest_dir)?;
        return Ok(());
    }

    Err(AppError::Validation(format!(
        "Неизвестный формат архива Java-рантайма: {}",
        name
    )))
}

fn find_java_home_dir(dest_dir: &Path) -> AppResult<PathBuf> {
    if dest_dir.join("bin").is_dir() {
        return Ok(dest_dir.to_path_buf());
    }
    let mut entries = std::fs::read_dir(dest_dir)?;
    while let Some(entry) = entries.next() {
        let path = entry?.path();
        if path.join("bin").is_dir() {
            return Ok(path);
        }
    }
    Ok(dest_dir.to_path_buf())
}
