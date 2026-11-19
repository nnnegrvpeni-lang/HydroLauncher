//! Скины и плащи Microsoft-аккаунта через Minecraft Services.
//!
//! Профиль запрашивается у Mojang при каждом открытии редактора: данные
//! меняются и снаружи, поэтому кэш только мешал бы. Сама текстура скачивается
//! и отдаётся фронтенду как data-URL, чтобы canvas-превью не зависело от CORS.

use crate::config::endpoints::{
    MINECRAFT_CAPES_ACTIVE_URL, MINECRAFT_PROFILE_URL, MINECRAFT_SERVICES_USER_AGENT,
    MINECRAFT_SKINS_ACTIVE_URL, MINECRAFT_SKINS_URL,
};
use crate::error::{AppError, AppResult};
use crate::services::microsoft_auth_service;
use crate::storage::paths::AppPaths;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::Path;

const MAX_SKIN_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SkinVariant {
    Classic,
    Slim,
}

impl SkinVariant {
    pub fn parse(value: &str) -> AppResult<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "classic" => Ok(Self::Classic),
            "slim" => Ok(Self::Slim),
            _ => Err(AppError::Validation(
                "Модель скина должна быть classic или slim".into(),
            )),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Classic => "classic",
            Self::Slim => "slim",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapeInfo {
    pub id: String,
    pub name: String,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinProfile {
    pub account_id: String,
    pub id: String,
    pub name: String,
    pub variant: String,
    pub texture_url: Option<String>,
    /// Текстура в виде data-URL для превью; None, если файл не скачался.
    pub texture_data_url: Option<String>,
    pub capes: Vec<CapeInfo>,
}

#[derive(Debug, Deserialize)]
struct RawProfile {
    id: String,
    name: String,
    #[serde(default)]
    skins: Vec<RawSkin>,
    #[serde(default)]
    capes: Vec<RawCape>,
}

#[derive(Debug, Deserialize)]
struct RawSkin {
    #[serde(default)]
    url: String,
    #[serde(default)]
    variant: String,
}

#[derive(Debug, Deserialize)]
struct RawCape {
    id: String,
    #[serde(default, rename = "alias")]
    name: Option<String>,
    #[serde(default)]
    state: String,
}

fn http() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(|| {
        crate::services::downloader::build_client().unwrap_or_else(|_| reqwest::Client::new())
    })
}

fn mojang_error(status: reqwest::StatusCode, action: &str) -> AppError {
    match status.as_u16() {
        400 => AppError::Custom(
            "Mojang отклонил файл скина. Нужен PNG 64×64 или 64×32 с корректной моделью.".into(),
        ),
        401 => AppError::Custom("Сессия Microsoft истекла. Войдите в аккаунт снова.".into()),
        429 => AppError::Custom("Слишком много запросов к Mojang. Попробуйте позже.".into()),
        _ => AppError::Custom(format!("Mojang не принял {action} (код {status}).")),
    }
}

async fn fetch_profile(token: &str) -> AppResult<RawProfile> {
    let response = http()
        .get(MINECRAFT_PROFILE_URL)
        .header("Accept", "application/json")
        .header("User-Agent", MINECRAFT_SERVICES_USER_AGENT)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| AppError::Custom("Не удалось получить профиль Minecraft.".into()))?;

    if !response.status().is_success() {
        return Err(mojang_error(response.status(), "профиль"));
    }

    response
        .json::<RawProfile>()
        .await
        .map_err(|_| AppError::Custom("Некорректный профиль Minecraft.".into()))
}

async fn download_texture(url: &str) -> Option<String> {
    let response = http().get(url).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let bytes = response.bytes().await.ok()?;
    Some(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(bytes.as_ref())
    ))
}

async fn profile_for(
    paths: &AppPaths,
    data_dir: &Path,
    account_id: &str,
) -> AppResult<SkinProfile> {
    let credentials =
        microsoft_auth_service::launch_credentials(paths, data_dir, account_id).await?;
    let profile = fetch_profile(&credentials.access_token).await?;

    let skin = profile.skins.first();
    let variant = skin
        .map(|skin| {
            if skin.variant.eq_ignore_ascii_case("slim") {
                SkinVariant::Slim
            } else {
                SkinVariant::Classic
            }
        })
        .unwrap_or(SkinVariant::Classic);
    let texture_url = skin
        .map(|skin| skin.url.clone())
        .filter(|url| !url.is_empty());
    let texture_data_url = match texture_url.as_deref() {
        Some(url) => download_texture(url).await,
        None => None,
    };

    Ok(SkinProfile {
        account_id: account_id.to_string(),
        id: profile.id,
        name: profile.name,
        variant: variant.as_str().to_string(),
        texture_url,
        texture_data_url,
        capes: profile
            .capes
            .into_iter()
            .map(|cape| CapeInfo {
                name: cape
                    .name
                    .filter(|name| !name.trim().is_empty())
                    .unwrap_or_else(|| "Плащ".to_string()),
                id: cape.id,
                active: cape.state.eq_ignore_ascii_case("ACTIVE"),
            })
            .collect(),
    })
}

/// Проверяет PNG до отправки, чтобы не гонять заведомо битый файл в Mojang.
pub fn validate_skin_png(bytes: &[u8]) -> AppResult<()> {
    const PNG_SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    if bytes.len() > MAX_SKIN_BYTES {
        return Err(AppError::Validation(
            "Файл скина больше 2 МБ. Нужен обычный PNG 64×64.".into(),
        ));
    }
    if bytes.len() < 24 || bytes[..8] != PNG_SIGNATURE {
        return Err(AppError::Validation("Скин должен быть PNG-файлом.".into()));
    }

    let width = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
    let height = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
    if !matches!((width, height), (64, 64) | (64, 32)) {
        return Err(AppError::Validation(
            "Скин должен быть 64×64 или 64×32 пикселя.".into(),
        ));
    }
    Ok(())
}

pub async fn get_skin(
    paths: &AppPaths,
    data_dir: &Path,
    account_id: &str,
) -> AppResult<SkinProfile> {
    profile_for(paths, data_dir, account_id).await
}

pub async fn upload_skin(
    paths: &AppPaths,
    data_dir: &Path,
    account_id: &str,
    file_path: &Path,
    variant: &str,
) -> AppResult<SkinProfile> {
    let variant = SkinVariant::parse(variant)?;
    let metadata = tokio::fs::metadata(file_path).await?;
    if metadata.len() as usize > MAX_SKIN_BYTES {
        return Err(AppError::Validation(
            "Файл скина больше 2 МБ. Нужен обычный PNG 64×64.".into(),
        ));
    }
    let bytes = tokio::fs::read(file_path).await?;
    validate_skin_png(&bytes)?;

    let credentials =
        microsoft_auth_service::launch_credentials(paths, data_dir, account_id).await?;
    let form = reqwest::multipart::Form::new()
        .text("variant", variant.as_str())
        .part(
            "file",
            reqwest::multipart::Part::bytes(bytes)
                .file_name("skin.png")
                .mime_str("image/png")
                .map_err(|_| AppError::Custom("Не удалось подготовить файл скина.".into()))?,
        );

    let response = http()
        .post(MINECRAFT_SKINS_URL)
        .header("Accept", "application/json")
        .header("User-Agent", MINECRAFT_SERVICES_USER_AGENT)
        .bearer_auth(&credentials.access_token)
        .multipart(form)
        .send()
        .await
        .map_err(|_| AppError::Custom("Не удалось загрузить скин в Mojang.".into()))?;

    if !response.status().is_success() {
        return Err(mojang_error(response.status(), "скин"));
    }

    profile_for(paths, data_dir, account_id).await
}

pub async fn reset_skin(
    paths: &AppPaths,
    data_dir: &Path,
    account_id: &str,
) -> AppResult<SkinProfile> {
    let credentials =
        microsoft_auth_service::launch_credentials(paths, data_dir, account_id).await?;
    let response = http()
        .delete(MINECRAFT_SKINS_ACTIVE_URL)
        .header("Accept", "application/json")
        .header("User-Agent", MINECRAFT_SERVICES_USER_AGENT)
        .bearer_auth(&credentials.access_token)
        .send()
        .await
        .map_err(|_| AppError::Custom("Не удалось сбросить скин.".into()))?;

    if !response.status().is_success() {
        return Err(mojang_error(response.status(), "сброс скина"));
    }

    profile_for(paths, data_dir, account_id).await
}

pub async fn equip_cape(
    paths: &AppPaths,
    data_dir: &Path,
    account_id: &str,
    cape_id: &str,
) -> AppResult<SkinProfile> {
    let credentials =
        microsoft_auth_service::launch_credentials(paths, data_dir, account_id).await?;
    let response = http()
        .put(MINECRAFT_CAPES_ACTIVE_URL)
        .header("Content-Type", "application/json; charset=utf-8")
        .header("Accept", "application/json")
        .header("User-Agent", MINECRAFT_SERVICES_USER_AGENT)
        .bearer_auth(&credentials.access_token)
        .json(&serde_json::json!({ "capeId": cape_id }))
        .send()
        .await
        .map_err(|_| AppError::Custom("Не удалось надеть плащ.".into()))?;

    if !response.status().is_success() {
        return Err(mojang_error(response.status(), "плащ"));
    }

    profile_for(paths, data_dir, account_id).await
}

pub async fn remove_cape(
    paths: &AppPaths,
    data_dir: &Path,
    account_id: &str,
) -> AppResult<SkinProfile> {
    let credentials =
        microsoft_auth_service::launch_credentials(paths, data_dir, account_id).await?;
    let response = http()
        .delete(MINECRAFT_CAPES_ACTIVE_URL)
        .header("Accept", "application/json")
        .header("User-Agent", MINECRAFT_SERVICES_USER_AGENT)
        .bearer_auth(&credentials.access_token)
        .send()
        .await
        .map_err(|_| AppError::Custom("Не удалось снять плащ.".into()))?;

    if !response.status().is_success() {
        return Err(mojang_error(response.status(), "плащ"));
    }

    profile_for(paths, data_dir, account_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png_with_size(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
        bytes.extend_from_slice(&13_u32.to_be_bytes());
        bytes.extend_from_slice(b"IHDR");
        bytes.extend_from_slice(&width.to_be_bytes());
        bytes.extend_from_slice(&height.to_be_bytes());
        bytes.extend_from_slice(&[8, 6, 0, 0, 0]);
        bytes
    }

    #[test]
    fn accepts_standard_skin_sizes() {
        assert!(validate_skin_png(&png_with_size(64, 64)).is_ok());
        assert!(validate_skin_png(&png_with_size(64, 32)).is_ok());
    }

    #[test]
    fn rejects_wrong_size_and_not_png() {
        assert!(validate_skin_png(&png_with_size(128, 128)).is_err());
        assert!(validate_skin_png(b"not a png").is_err());
    }

    #[test]
    fn parses_variant_case_insensitively() {
        assert_eq!(SkinVariant::parse("SLIM").unwrap(), SkinVariant::Slim);
        assert_eq!(SkinVariant::parse("classic").unwrap(), SkinVariant::Classic);
        assert!(SkinVariant::parse("wide").is_err());
    }
}
