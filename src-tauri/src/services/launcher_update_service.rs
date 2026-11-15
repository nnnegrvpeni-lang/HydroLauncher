//! Проверка обновлений самого лаунчера через GitHub Releases.
//!
//! Лаунчер ничего не скачивает автоматически: при наличии новой версии
//! интерфейс показывает тихую ссылку на страницу релиза.

use crate::config::endpoints::HYDRO_LATEST_RELEASE_API_URL;
use crate::error::AppResult;
use crate::services::downloader::get_json;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    published_at: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherUpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_url: String,
    pub published_at: Option<String>,
}

/// Разбирает `v0.1.2`, `0.1.2-beta.1` и подобные в числовую тройку.
fn parse_version(raw: &str) -> Option<(u64, u64, u64)> {
    let trimmed = raw.trim().trim_start_matches(['v', 'V']);
    let core = trimmed.split(['-', '+']).next()?;
    let mut parts = core.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().ok()?;
    let patch = parts.next().unwrap_or("0").parse().ok()?;
    Some((major, minor, patch))
}

pub async fn check_launcher_update() -> AppResult<LauncherUpdateInfo> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let client = reqwest::Client::builder()
        .user_agent(format!("HydroLauncher/{current_version}"))
        .build()?;
    let release: GitHubRelease = get_json(&client, HYDRO_LATEST_RELEASE_API_URL).await?;
    let latest_version = release
        .tag_name
        .trim()
        .trim_start_matches(['v', 'V'])
        .to_string();

    let update_available = match (
        parse_version(&current_version),
        parse_version(&latest_version),
    ) {
        (Some(current), Some(latest)) => latest > current,
        _ => false,
    };

    Ok(LauncherUpdateInfo {
        current_version,
        latest_version,
        update_available,
        release_url: release.html_url,
        published_at: release.published_at,
    })
}

#[cfg(test)]
mod tests {
    use super::parse_version;

    #[test]
    fn parses_release_tags() {
        assert_eq!(parse_version("v0.1.2"), Some((0, 1, 2)));
        assert_eq!(parse_version("0.2"), Some((0, 2, 0)));
        assert_eq!(parse_version("1.0.0-beta.3"), Some((1, 0, 0)));
        assert_eq!(parse_version("nightly"), None);
    }
}
