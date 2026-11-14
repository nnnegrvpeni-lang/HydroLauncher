use crate::error::AppResult;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::path::Path;

pub async fn read_json_or_default<T>(path: &Path) -> AppResult<T>
where
    T: DeserializeOwned + Default,
{
    if !tokio::fs::try_exists(path).await? {
        return Ok(T::default());
    }
    let bytes = tokio::fs::read(path).await?;
    if bytes.is_empty() {
        return Ok(T::default());
    }
    let parsed = serde_json::from_slice(&bytes)?;
    Ok(parsed)
}

pub async fn write_json_atomic<T>(path: &Path, value: &T) -> AppResult<()>
where
    T: Serialize,
{
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let json = serde_json::to_vec_pretty(value)?;
    let tmp_path = path.with_extension("json.tmp");
    tokio::fs::write(&tmp_path, json).await?;
    tokio::fs::rename(&tmp_path, path).await?;
    Ok(())
}
