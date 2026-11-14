use crate::error::{AppError, AppResult};
use futures_util::StreamExt;
use reqwest::Client;
use sha1::{Digest, Sha1};
use sha2::Sha256;
use std::path::Path;
use tokio::io::AsyncWriteExt;

pub async fn get_json<T>(client: &Client, url: &str) -> AppResult<T>
where
    T: serde::de::DeserializeOwned,
{
    let response = client
        .get(url)
        .header("User-Agent", "HydroLauncher/0.1")
        .send()
        .await?
        .error_for_status()?;
    Ok(response.json::<T>().await?)
}

pub async fn download_file(
    client: &Client,
    url: &str,
    dest: &Path,
    expected_sha1: Option<&str>,
) -> AppResult<()> {
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    if verify_sha1(dest, expected_sha1).await? {
        return Ok(());
    }

    let tmp_path = dest.with_extension("hydro.tmp");
    let response = client
        .get(url)
        .header("User-Agent", "HydroLauncher/0.1")
        .send()
        .await?
        .error_for_status()?;

    let mut file = tokio::fs::File::create(&tmp_path).await?;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).await?;
    }
    file.flush().await?;
    drop(file);

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

    tokio::fs::rename(&tmp_path, dest).await?;
    Ok(())
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

pub async fn hash_file_sha1(path: &Path) -> AppResult<String> {
    let bytes = tokio::fs::read(path).await?;
    let mut hasher = Sha1::new();
    hasher.update(&bytes);
    Ok(hex::encode(hasher.finalize()))
}

pub async fn hash_file_sha256(path: &Path) -> AppResult<String> {
    let bytes = tokio::fs::read(path).await?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(hex::encode(hasher.finalize()))
}
