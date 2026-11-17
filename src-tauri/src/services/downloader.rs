use crate::error::{AppError, AppResult};
use futures_util::StreamExt;
use reqwest::{Client, Response, StatusCode};
use sha1::{Digest, Sha1};
use sha2::Sha256;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Единый User-Agent со реальной версией приложения (без хардкода номера).
pub const USER_AGENT: &str = concat!("HydroLauncher/", env!("CARGO_PKG_VERSION"));

const MAX_ATTEMPTS: u32 = 3;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const READ_TIMEOUT: Duration = Duration::from_secs(60);
const TOTAL_TIMEOUT: Duration = Duration::from_secs(60 * 30);
static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// HTTP-клиент с таймаутами и общим User-Agent.
pub fn build_client() -> AppResult<Client> {
    Ok(Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(CONNECT_TIMEOUT)
        .read_timeout(READ_TIMEOUT)
        .timeout(TOTAL_TIMEOUT)
        .build()?)
}

fn backoff(attempt: u32) -> Duration {
    Duration::from_millis(300 * 3u64.pow(attempt.saturating_sub(1)))
}

fn is_retryable_status(status: StatusCode) -> bool {
    status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error()
}

/// Ошибка, которую имеет смысл повторить: обрыв, таймаут, 429 или 5xx.
fn is_retryable_error(err: &reqwest::Error) -> bool {
    err.is_timeout() || err.is_connect() || err.is_request() || err.is_body()
}

fn rate_limit_error() -> AppError {
    AppError::Custom(
        "GitHub API временно ограничил запросы (лимит на IP). Попробуйте позже.".into(),
    )
}

async fn wait_before_retry(response: &Response, attempt: u32) {
    let hinted = response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.trim().parse::<u64>().ok())
        .map(Duration::from_secs);
    let delay = hinted
        .unwrap_or_else(|| backoff(attempt))
        .min(Duration::from_secs(10));
    tokio::time::sleep(delay).await;
}

/// GET с ретраями: 429/5xx и сетевые обрывы повторяются до `MAX_ATTEMPTS` раз.
pub async fn get_with_retry(client: &Client, url: &str) -> AppResult<Response> {
    let mut attempt = 0;
    loop {
        attempt += 1;
        match client.get(url).send().await {
            Ok(response) => {
                let status = response.status();
                if status.is_success() {
                    return Ok(response);
                }
                if is_retryable_status(status) && attempt < MAX_ATTEMPTS {
                    wait_before_retry(&response, attempt).await;
                    continue;
                }
                if status == StatusCode::FORBIDDEN
                    && response
                        .headers()
                        .get("x-ratelimit-remaining")
                        .and_then(|v| v.to_str().ok())
                        == Some("0")
                {
                    return Err(rate_limit_error());
                }
                return Err(response.error_for_status().unwrap_err().into());
            }
            Err(err) => {
                if is_retryable_error(&err) && attempt < MAX_ATTEMPTS {
                    tokio::time::sleep(backoff(attempt)).await;
                    continue;
                }
                return Err(err.into());
            }
        }
    }
}

/// Простой TTL-кэш ответов GitHub API, чтобы не упираться в лимит 60 запросов/час.
fn response_cache() -> &'static Mutex<HashMap<String, (Instant, String)>> {
    static CACHE: OnceLock<Mutex<HashMap<String, (Instant, String)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cache_lookup(url: &str) -> Option<String> {
    let guard = response_cache().lock().ok()?;
    let (stored_at, body) = guard.get(url)?;
    if stored_at.elapsed() < Duration::from_secs(60) * 10 {
        Some(body.clone())
    } else {
        None
    }
}

fn cache_store(url: &str, body: &str) {
    if let Ok(mut guard) = response_cache().lock() {
        guard.insert(url.to_string(), (Instant::now(), body.to_string()));
    }
}

pub async fn get_json<T>(client: &Client, url: &str) -> AppResult<T>
where
    T: serde::de::DeserializeOwned,
{
    let response = get_with_retry(client, url).await?;
    Ok(response.json::<T>().await?)
}

/// Как `get_json`, но с кэшем на 10 минут (для rate-limited GitHub API).
pub async fn get_json_cached<T>(client: &Client, url: &str) -> AppResult<T>
where
    T: serde::de::DeserializeOwned,
{
    if let Some(body) = cache_lookup(url) {
        if let Ok(parsed) = serde_json::from_str::<T>(&body) {
            return Ok(parsed);
        }
    }
    let response = get_with_retry(client, url).await?;
    let body = response.text().await?;
    cache_store(url, &body);
    Ok(serde_json::from_str::<T>(&body)?)
}

/// Уникальное имя временного файла: один и тот же ассет или библиотеку могут
/// качать параллельно несколько сборок, и общий `.tmp` они бы затёрли.
fn temp_path_for(dest: &Path) -> PathBuf {
    let mut name = dest
        .file_name()
        .map(|value| value.to_os_string())
        .unwrap_or_else(|| "download".into());
    name.push(format!(
        ".{}-{}.hydro.tmp",
        std::process::id(),
        TMP_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    dest.with_file_name(name)
}

pub async fn download_file(
    client: &Client,
    url: &str,
    dest: &Path,
    expected_sha1: Option<&str>,
) -> AppResult<()> {
    crate::services::jobs::checkpoint().await?;

    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    if verify_sha1(dest, expected_sha1).await? {
        return Ok(());
    }

    let tmp_path = temp_path_for(dest);
    let mut attempt = 0;
    loop {
        attempt += 1;
        let result = download_to(client, url, &tmp_path).await;
        match result {
            Ok(()) => break,
            Err(err) if attempt < MAX_ATTEMPTS && retryable_download(&err) => {
                let _ = tokio::fs::remove_file(&tmp_path).await;
                tokio::time::sleep(backoff(attempt)).await;
            }
            Err(err) => {
                let _ = tokio::fs::remove_file(&tmp_path).await;
                return Err(err);
            }
        }
    }

    if let Some(hash) = expected_sha1 {
        let actual = hash_file_sha1(&tmp_path).await?;
        if !actual.eq_ignore_ascii_case(hash) {
            let _ = tokio::fs::remove_file(&tmp_path).await;
            return Err(AppError::Validation(format!(
                "Контрольная сумма файла не совпала: {} (ожидалось {})",
                actual, hash
            )));
        }
    }

    place_downloaded_file(&tmp_path, dest, expected_sha1).await
}

/// Переносит проверенный файл на место. Параллельная загрузка того же файла
/// могла закончиться раньше — тогда её копия уже подходит, и перезаписывать
/// её не нужно.
async fn place_downloaded_file(
    tmp: &Path,
    dest: &Path,
    expected_sha1: Option<&str>,
) -> AppResult<()> {
    if verify_sha1(dest, expected_sha1).await? {
        let _ = tokio::fs::remove_file(tmp).await;
        return Ok(());
    }

    match tokio::fs::rename(tmp, dest).await {
        Ok(()) => Ok(()),
        Err(err) => {
            // Windows не заменяет существующий файл при rename.
            if verify_sha1(dest, expected_sha1).await.unwrap_or(false) {
                let _ = tokio::fs::remove_file(tmp).await;
                return Ok(());
            }
            let _ = tokio::fs::remove_file(dest).await;
            match tokio::fs::rename(tmp, dest).await {
                Ok(()) => Ok(()),
                Err(_) => {
                    let _ = tokio::fs::remove_file(tmp).await;
                    Err(err.into())
                }
            }
        }
    }
}

fn retryable_download(err: &AppError) -> bool {
    match err {
        AppError::Http(http) => is_retryable_error(http),
        AppError::Io(_) => true,
        _ => false,
    }
}

async fn download_to(client: &Client, url: &str, tmp_path: &Path) -> AppResult<()> {
    let response = get_with_retry(client, url).await?;
    let mut file = tokio::fs::File::create(tmp_path).await?;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        // Отмена и пауза проверяются до записи следующего блока: временный
        // файл остаётся целым, а вызывающий код удаляет его при ошибке.
        crate::services::jobs::checkpoint().await?;
        let chunk = chunk?;
        file.write_all(&chunk).await?;
    }
    file.flush().await?;
    Ok(())
}

/// Скачивает файл в память с контролем размера. Нужен для небольших
/// архивов (`.mrpack`), которые разбираются без промежуточного файла.
pub async fn download_bytes(client: &Client, url: &str, max_bytes: u64) -> AppResult<Vec<u8>> {
    let response = get_with_retry(client, url).await?;
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::new();

    while let Some(chunk) = stream.next().await {
        crate::services::jobs::checkpoint().await?;
        let chunk = chunk?;
        if buffer.len() as u64 + chunk.len() as u64 > max_bytes {
            return Err(AppError::Validation(
                "Файл больше допустимого размера".into(),
            ));
        }
        buffer.extend_from_slice(&chunk);
    }

    Ok(buffer)
}

pub async fn verify_sha1(path: &Path, expected_sha1: Option<&str>) -> AppResult<bool> {
    let Some(expected) = expected_sha1 else {
        return Ok(tokio::fs::try_exists(path).await?);
    };
    if !tokio::fs::try_exists(path).await? {
        return Ok(false);
    }
    let actual = hash_file_sha1(path).await?;
    Ok(actual.eq_ignore_ascii_case(expected))
}

/// Потоковый SHA-1: файл читается блоками, а не целиком в память.
pub async fn hash_file_sha1(path: &Path) -> AppResult<String> {
    let mut hasher = Sha1::new();
    hash_file_streaming(path, &mut hasher).await?;
    Ok(hex::encode(hasher.finalize()))
}

pub async fn hash_file_sha256(path: &Path) -> AppResult<String> {
    let mut hasher = Sha256::new();
    hash_file_streaming(path, &mut hasher).await?;
    Ok(hex::encode(hasher.finalize()))
}

async fn hash_file_streaming<D: Digest>(path: &Path, hasher: &mut D) -> AppResult<()> {
    let mut file = tokio::fs::File::open(path).await?;
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retries_only_expected_statuses() {
        assert!(is_retryable_status(StatusCode::TOO_MANY_REQUESTS));
        assert!(is_retryable_status(StatusCode::BAD_GATEWAY));
        assert!(is_retryable_status(StatusCode::INTERNAL_SERVER_ERROR));
        assert!(!is_retryable_status(StatusCode::NOT_FOUND));
        assert!(!is_retryable_status(StatusCode::UNAUTHORIZED));
    }

    #[test]
    fn backoff_grows_and_caps() {
        assert_eq!(backoff(1), Duration::from_millis(300));
        assert_eq!(backoff(2), Duration::from_millis(900));
        assert_eq!(backoff(3), Duration::from_millis(2700));
    }

    #[test]
    fn temp_paths_are_unique_and_keep_directory() {
        let dest = Path::new("cache/libraries/example.jar");
        let first = temp_path_for(dest);
        let second = temp_path_for(dest);

        assert_ne!(first, second);
        assert_eq!(first.parent(), dest.parent());
        assert!(first
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("example.jar."));
    }

    #[tokio::test]
    async fn streaming_sha1_matches_known_digest() {
        let dir = std::env::temp_dir().join("hydro-downloader-test");
        tokio::fs::create_dir_all(&dir).await.unwrap();
        let file = dir.join("sample.bin");
        let payload = vec![7u8; 200 * 1024];
        tokio::fs::write(&file, &payload).await.unwrap();

        let mut expected = Sha1::new();
        expected.update(&payload);
        let expected_hex = hex::encode(expected.finalize());

        assert_eq!(hash_file_sha1(&file).await.unwrap(), expected_hex);
        assert!(verify_sha1(&file, Some(&expected_hex)).await.unwrap());
        assert!(!verify_sha1(&file, Some("deadbeef")).await.unwrap());

        let _ = tokio::fs::remove_dir_all(&dir).await;
    }
}
