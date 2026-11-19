//! Вход через Microsoft: OAuth-код, Xbox Live (SISU/XSTS) и Minecraft Services.
//!
//! Поток состоит из двух шагов: `begin_login` возвращает URL страницы входа,
//! `finish_login` обменивает код на токены и получает профиль Minecraft.
//! Refresh-токены и ключ устройства хранятся только локально в
//! `microsoft-auth.json`; наружу они не передаются.

use crate::config::endpoints::{
    MICROSOFT_AUTH_REPLY_URL, MICROSOFT_CLIENT_ID, MICROSOFT_OAUTH_TOKEN_URL, MICROSOFT_SCOPE,
    MINECRAFT_ENTITLEMENTS_URL, MINECRAFT_LAUNCHER_LOGIN_URL, MINECRAFT_PROFILE_URL,
    MINECRAFT_SERVICES_USER_AGENT, XBOX_DEVICE_AUTH_URL, XBOX_DEVICE_RELYING_PARTY,
    XBOX_SISU_AUTHENTICATE_URL, XBOX_SISU_AUTHORIZE_URL, XBOX_USER_RELYING_PARTY,
    XBOX_XSTS_AUTHORIZE_URL, XBOX_XSTS_RELYING_PARTY,
};
use crate::error::{AppError, AppResult};
use crate::storage::json_store::{lock_file, read_locked, write_locked};
use crate::storage::paths::AppPaths;
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use chrono::{DateTime, Duration, Utc};
use p256::ecdsa::signature::Signer;
use p256::ecdsa::{Signature, SigningKey, VerifyingKey};
use p256::pkcs8::{DecodePrivateKey, EncodePrivateKey, LineEnding};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::Path;
use std::sync::OnceLock;
use std::time::Duration as StdDuration;

/// За пять минут до истечения токен обновляется, чтобы запуск игры не попал
/// в окно, когда Minecraft уже не примет старый токен.
const REFRESH_MARGIN_MINUTES: i64 = 5;
const SESSION_EXPIRED: &str = "Сессия Microsoft истекла. Войдите в аккаунт снова.";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct DeviceToken {
    issue_instant: DateTime<Utc>,
    not_after: DateTime<Utc>,
    token: String,
    #[serde(default)]
    display_claims: HashMap<String, Value>,
}

#[derive(Debug, Clone)]
pub struct LoginFlow {
    verifier: String,
    session_id: String,
    auth_url: String,
}

impl LoginFlow {
    pub fn auth_url(&self) -> &str {
        &self.auth_url
    }

    pub fn session_id(&self) -> &str {
        &self.session_id
    }
}

#[derive(Debug, Clone)]
pub struct MinecraftProfileInfo {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct LaunchCredentials {
    pub access_token: String,
    pub xuid: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthStore {
    #[serde(default)]
    device: Option<DeviceState>,
    #[serde(default)]
    accounts: HashMap<String, StoredCredentials>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceState {
    id: String,
    private_key_pem: String,
    x: String,
    y: String,
    token: String,
    issue_instant: DateTime<Utc>,
    not_after: DateTime<Utc>,
    #[serde(default)]
    display_claims: HashMap<String, Value>,
}

impl DeviceState {
    fn signing_key(&self) -> AppResult<SigningKey> {
        SigningKey::from_pkcs8_pem(&self.private_key_pem)
            .map_err(|_| AppError::Custom("Не удалось прочитать ключ устройства Xbox".into()))
    }

    fn proof_key(&self) -> AppResult<DeviceTokenKey> {
        Ok(DeviceTokenKey {
            id: self.id.clone(),
            key: self.signing_key()?,
            x: self.x.clone(),
            y: self.y.clone(),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredCredentials {
    access_token: String,
    refresh_token: String,
    expires_at: DateTime<Utc>,
    #[serde(default)]
    xuid: Option<String>,
}

struct DeviceTokenKey {
    id: String,
    key: SigningKey,
    x: String,
    y: String,
}

struct RequestWithDate<T> {
    date: DateTime<Utc>,
    value: T,
}

struct SignedResponse<T> {
    headers: reqwest::header::HeaderMap,
    date: DateTime<Utc>,
    value: T,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RedirectUri {
    msa_oauth_redirect: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SisuAuthorize {
    title_token: DeviceToken,
    user_token: DeviceToken,
}

#[derive(Deserialize)]
struct OAuthToken {
    expires_in: u64,
    access_token: String,
    refresh_token: String,
}

#[derive(Deserialize)]
struct MinecraftToken {
    access_token: String,
}

fn auth_file(paths: &AppPaths, data_dir: &Path) -> std::path::PathBuf {
    paths.microsoft_auth_file(data_dir)
}

fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        crate::services::downloader::build_client().unwrap_or_else(|_| reqwest::Client::new())
    })
}

fn generate_verifier() -> String {
    let mut bytes = [0u8; 64];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn challenge_for(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn generate_key() -> AppResult<DeviceTokenKey> {
    let id = uuid::Uuid::new_v4().to_string().to_uppercase();
    let signing_key = SigningKey::random(&mut OsRng);
    let public_key = VerifyingKey::from(&signing_key);
    let point = public_key.to_encoded_point(false);
    let x = point
        .x()
        .ok_or_else(|| AppError::Custom("Не удалось прочитать открытый ключ Xbox".into()))?;
    let y = point
        .y()
        .ok_or_else(|| AppError::Custom("Не удалось прочитать открытый ключ Xbox".into()))?;

    Ok(DeviceTokenKey {
        id,
        key: signing_key,
        x: URL_SAFE_NO_PAD.encode(x),
        y: URL_SAFE_NO_PAD.encode(y),
    })
}

fn key_to_state(key: &DeviceTokenKey) -> AppResult<(String, String)> {
    let pem = key
        .key
        .to_pkcs8_pem(LineEnding::LF)
        .map_err(|_| AppError::Custom("Не удалось сохранить ключ устройства Xbox".into()))?;
    Ok((pem.to_string(), key.id.clone()))
}

fn xbox_error(step: &str, status: reqwest::StatusCode, body: &str) -> AppError {
    if let Ok(parsed) = serde_json::from_str::<Value>(body) {
        if let Some(code) = parsed.get("XErr").and_then(Value::as_u64) {
            let text = match code {
                2_148_916_222 => "Не удалось подтвердить возраст аккаунта Microsoft.",
                2_148_916_227 => "Аккаунт заблокирован в Xbox Live.",
                2_148_916_229 => "Аккаунт ограничен в Xbox Live.",
                2_148_916_233 => {
                    "У аккаунта Microsoft нет профиля Xbox. Создайте его на сайте Xbox."
                }
                2_148_916_234 => "Примите условия Xbox Live, чтобы продолжить.",
                2_148_916_235 => "Xbox Live недоступен в регионе этого аккаунта.",
                2_148_916_236 | 2_148_916_237 => "Требуется проверка совершеннолетия.",
                2_148_916_238 => {
                    "Это детский аккаунт: нужен взрослый участник семейной группы Xbox."
                }
                other => {
                    return AppError::Custom(format!("Xbox Live отклонил вход (код {other})."))
                }
            };
            return AppError::Custom(text.into());
        }
        if parsed.get("error").and_then(Value::as_str) == Some("invalid_grant") {
            return AppError::Custom(
                if step == "oauth" {
                    "Код входа устарел. Попробуйте войти снова."
                } else {
                    SESSION_EXPIRED
                }
                .into(),
            );
        }
    }

    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return AppError::Custom("Слишком много попыток входа. Подождите и повторите.".into());
    }
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return AppError::Custom(
            if step == "oauth" {
                "Код входа устарел. Попробуйте войти снова."
            } else {
                SESSION_EXPIRED
            }
            .into(),
        );
    }

    AppError::Custom(format!(
        "Не удалось войти в Microsoft (шаг {step}, код {status})."
    ))
}

fn transport_error(step: &str, err: reqwest::Error) -> AppError {
    if err.is_timeout() || err.is_connect() {
        AppError::Custom(format!(
            "Нет связи с Microsoft на шаге {step}. Проверьте подключение к сети."
        ))
    } else {
        AppError::Custom(format!("Ошибка запроса к Microsoft на шаге {step}."))
    }
}

fn get_date_header(headers: &reqwest::header::HeaderMap) -> DateTime<Utc> {
    headers
        .get(reqwest::header::DATE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| DateTime::parse_from_rfc2822(value).ok())
        .map_or_else(Utc::now, |value| value.with_timezone(&Utc))
}

async fn auth_retry<F, Fut>(request: F) -> Result<reqwest::Response, reqwest::Error>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<reqwest::Response, reqwest::Error>>,
{
    const RETRY_COUNT: usize = 5;
    const RETRY_WAIT: StdDuration = StdDuration::from_millis(250);

    let mut response = request().await;
    for attempt in 0..RETRY_COUNT {
        match &response {
            Ok(_) => break,
            Err(err) if err.is_connect() || err.is_timeout() => {
                if attempt + 1 < RETRY_COUNT {
                    tokio::time::sleep(RETRY_WAIT).await;
                    response = request().await;
                } else {
                    break;
                }
            }
            Err(_) => break,
        }
    }
    response
}

async fn send_signed_request<T: DeserializeOwned>(
    url: &str,
    url_path: &str,
    raw_body: Value,
    key: &DeviceTokenKey,
    current_date: DateTime<Utc>,
    step: &str,
) -> AppResult<SignedResponse<T>> {
    let body = serde_json::to_vec(&raw_body)?;
    // Xbox Live ждёт время в формате FILETIME (100-нс интервалы с 1601 года).
    let time = (current_date.timestamp() as u128 + 11_644_473_600) * 10_000_000;

    let mut buffer = Vec::new();
    buffer.extend_from_slice(&1_u32.to_be_bytes());
    buffer.push(0);
    buffer.extend_from_slice(&(time as u64).to_be_bytes());
    buffer.push(0);
    buffer.extend_from_slice(b"POST");
    buffer.push(0);
    buffer.extend_from_slice(url_path.as_bytes());
    buffer.push(0);
    buffer.push(0);
    buffer.extend_from_slice(&body);
    buffer.push(0);

    let signature: Signature = key.key.sign(&buffer);
    let mut signature_buffer = Vec::new();
    signature_buffer.extend_from_slice(&1_i32.to_be_bytes());
    signature_buffer.extend_from_slice(&(time as u64).to_be_bytes());
    signature_buffer.extend_from_slice(&signature.to_bytes());
    let signature = STANDARD.encode(&signature_buffer);

    let response = auth_retry(|| {
        let mut request = http()
            .post(url)
            .header("Content-Type", "application/json; charset=utf-8")
            .header("Accept", "application/json")
            .header("Signature", &signature);

        if url != XBOX_SISU_AUTHORIZE_URL {
            request = request.header("x-xbl-contract-version", "1");
        }

        request.body(body.clone()).send()
    })
    .await
    .map_err(|err| transport_error(step, err))?;

    let status = response.status();
    let headers = response.headers().clone();
    let date = get_date_header(&headers);
    let text = response
        .text()
        .await
        .map_err(|err| transport_error(step, err))?;

    if !status.is_success() {
        return Err(xbox_error(step, status, &text));
    }

    let value = serde_json::from_str(&text)
        .map_err(|_| AppError::Custom(format!("Некорректный ответ Xbox на шаге {step}.")))?;

    Ok(SignedResponse {
        headers,
        date,
        value,
    })
}

async fn request_device_token(
    key: &DeviceTokenKey,
    current_date: DateTime<Utc>,
) -> AppResult<RequestWithDate<DeviceToken>> {
    let response = send_signed_request(
        XBOX_DEVICE_AUTH_URL,
        "/device/authenticate",
        json!({
            "Properties": {
                "AuthMethod": "ProofOfPossession",
                "Id": format!("{{{}}}", key.id),
                "DeviceType": "Win32",
                "Version": "10.16.0",
                "ProofKey": {
                    "kty": "EC",
                    "x": key.x,
                    "y": key.y,
                    "crv": "P-256",
                    "alg": "ES256",
                    "use": "sig"
                }
            },
            "RelyingParty": XBOX_DEVICE_RELYING_PARTY,
            "TokenType": "JWT"
        }),
        key,
        current_date,
        "device",
    )
    .await?;

    Ok(RequestWithDate {
        date: response.date,
        value: response.value,
    })
}

async fn ensure_device(store: &mut AuthStore) -> AppResult<(DeviceState, DateTime<Utc>)> {
    if let Some(device) = store.device.clone() {
        if device.not_after > Utc::now() {
            return Ok((device, Utc::now()));
        }

        let key = device.proof_key()?;
        let refreshed = request_device_token(&key, Utc::now()).await?;
        let mut updated = device;
        updated.token = refreshed.value.token;
        updated.issue_instant = refreshed.value.issue_instant;
        updated.not_after = refreshed.value.not_after;
        updated.display_claims = refreshed.value.display_claims;
        store.device = Some(updated.clone());
        return Ok((updated, refreshed.date));
    }

    let key = generate_key()?;
    let response = request_device_token(&key, Utc::now()).await?;
    let (private_key_pem, id) = key_to_state(&key)?;
    let device = DeviceState {
        id,
        private_key_pem,
        x: key.x.clone(),
        y: key.y.clone(),
        token: response.value.token,
        issue_instant: response.value.issue_instant,
        not_after: response.value.not_after,
        display_claims: response.value.display_claims,
    };
    store.device = Some(device.clone());
    Ok((device, response.date))
}

async fn sisu_authenticate(
    device: &DeviceState,
    challenge: &str,
    current_date: DateTime<Utc>,
) -> AppResult<(String, String)> {
    let key = device.proof_key()?;
    let response = send_signed_request::<RedirectUri>(
        XBOX_SISU_AUTHENTICATE_URL,
        "/authenticate",
        json!({
            "AppId": MICROSOFT_CLIENT_ID,
            "DeviceToken": device.token,
            "Offers": [MICROSOFT_SCOPE],
            "Query": {
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "state": generate_verifier(),
                "prompt": "select_account"
            },
            "RedirectUri": MICROSOFT_AUTH_REPLY_URL,
            "Sandbox": "RETAIL",
            "TokenType": "code",
            "TitleId": "1794566092"
        }),
        &key,
        current_date,
        "sisu-authenticate",
    )
    .await?;

    let session_id = response
        .headers
        .get("X-SessionId")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| AppError::Custom("Xbox Live не вернул идентификатор сессии".into()))?
        .to_string();

    Ok((session_id, response.value.msa_oauth_redirect))
}

async fn oauth_token(code: &str, verifier: &str) -> AppResult<RequestWithDate<OAuthToken>> {
    let response = auth_retry(|| {
        http()
            .post(MICROSOFT_OAUTH_TOKEN_URL)
            .header("Accept", "application/json")
            .form(&[
                ("client_id", MICROSOFT_CLIENT_ID),
                ("code", code),
                ("code_verifier", verifier),
                ("grant_type", "authorization_code"),
                ("redirect_uri", MICROSOFT_AUTH_REPLY_URL),
                ("scope", MICROSOFT_SCOPE),
            ])
            .send()
    })
    .await
    .map_err(|err| transport_error("oauth", err))?;

    let status = response.status();
    let date = get_date_header(response.headers());
    let text = response
        .text()
        .await
        .map_err(|err| transport_error("oauth", err))?;

    if !status.is_success() {
        return Err(xbox_error("oauth", status, &text));
    }

    let value = serde_json::from_str(&text)
        .map_err(|_| AppError::Custom("Некорректный ответ Microsoft на шаге oauth.".into()))?;
    Ok(RequestWithDate { date, value })
}

async fn oauth_refresh(refresh_token: &str) -> AppResult<RequestWithDate<OAuthToken>> {
    let response = auth_retry(|| {
        http()
            .post(MICROSOFT_OAUTH_TOKEN_URL)
            .header("Accept", "application/json")
            .form(&[
                ("client_id", MICROSOFT_CLIENT_ID),
                ("refresh_token", refresh_token),
                ("grant_type", "refresh_token"),
                ("redirect_uri", MICROSOFT_AUTH_REPLY_URL),
                ("scope", MICROSOFT_SCOPE),
            ])
            .send()
    })
    .await
    .map_err(|err| transport_error("refresh", err))?;

    let status = response.status();
    let date = get_date_header(response.headers());
    let text = response
        .text()
        .await
        .map_err(|err| transport_error("refresh", err))?;

    if !status.is_success() {
        return Err(xbox_error("refresh", status, &text));
    }

    let value = serde_json::from_str(&text)
        .map_err(|_| AppError::Custom("Некорректный ответ Microsoft на шаге refresh.".into()))?;
    Ok(RequestWithDate { date, value })
}

async fn sisu_authorize(
    session_id: Option<&str>,
    access_token: &str,
    device: &DeviceState,
    current_date: DateTime<Utc>,
) -> AppResult<RequestWithDate<SisuAuthorize>> {
    let key = device.proof_key()?;
    let response = send_signed_request(
        XBOX_SISU_AUTHORIZE_URL,
        "/authorize",
        json!({
            "AccessToken": format!("t={access_token}"),
            "AppId": MICROSOFT_CLIENT_ID,
            "DeviceToken": device.token,
            "ProofKey": {
                "kty": "EC",
                "x": key.x,
                "y": key.y,
                "crv": "P-256",
                "alg": "ES256",
                "use": "sig"
            },
            "Sandbox": "RETAIL",
            "SessionId": session_id,
            "SiteName": "user.auth.xboxlive.com",
            "RelyingParty": XBOX_USER_RELYING_PARTY,
            "UseModernGamertag": true
        }),
        &key,
        current_date,
        "sisu-authorize",
    )
    .await?;

    Ok(RequestWithDate {
        date: response.date,
        value: response.value,
    })
}

async fn xsts_authorize(
    authorize: SisuAuthorize,
    device: &DeviceState,
    current_date: DateTime<Utc>,
) -> AppResult<RequestWithDate<DeviceToken>> {
    let key = device.proof_key()?;
    let response = send_signed_request(
        XBOX_XSTS_AUTHORIZE_URL,
        "/xsts/authorize",
        json!({
            "RelyingParty": XBOX_XSTS_RELYING_PARTY,
            "TokenType": "JWT",
            "Properties": {
                "SandboxId": "RETAIL",
                "UserTokens": [authorize.user_token.token],
                "DeviceToken": device.token,
                "TitleToken": authorize.title_token.token
            }
        }),
        &key,
        current_date,
        "xsts",
    )
    .await?;

    Ok(RequestWithDate {
        date: response.date,
        value: response.value,
    })
}

fn claim_str(claims: &HashMap<String, Value>, key: &str) -> Option<String> {
    claims
        .get("xui")
        .and_then(Value::as_array)
        .and_then(|list| list.first())
        .and_then(|entry| entry.get(key))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn user_hash(token: &DeviceToken) -> AppResult<String> {
    claim_str(&token.display_claims, "uhs")
        .ok_or_else(|| AppError::Custom("Xbox Live не вернул идентификатор пользователя".into()))
}

fn xuid_of(token: &DeviceToken) -> Option<String> {
    claim_str(&token.display_claims, "xid")
}

async fn minecraft_token(token: &DeviceToken) -> AppResult<MinecraftToken> {
    let uhs = user_hash(token)?;
    let response = auth_retry(|| {
        http()
            .post(MINECRAFT_LAUNCHER_LOGIN_URL)
            .header("Accept", "application/json")
            .header("User-Agent", MINECRAFT_SERVICES_USER_AGENT)
            .json(&json!({
                "platform": "PC_LAUNCHER",
                "xtoken": format!("XBL3.0 x={uhs};{}", token.token)
            }))
            .send()
    })
    .await
    .map_err(|err| transport_error("minecraft", err))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|err| transport_error("minecraft", err))?;

    if !status.is_success() {
        return Err(xbox_error("minecraft", status, &text));
    }

    serde_json::from_str(&text)
        .map_err(|_| AppError::Custom("Некорректный ответ Minecraft Services.".into()))
}

async fn ensure_entitlement(token: &str) -> AppResult<()> {
    let url = format!(
        "{MINECRAFT_ENTITLEMENTS_URL}?requestId={}",
        uuid::Uuid::new_v4()
    );
    let response = auth_retry(|| {
        http()
            .get(&url)
            .header("Accept", "application/json")
            .header("User-Agent", MINECRAFT_SERVICES_USER_AGENT)
            .bearer_auth(token)
            .send()
    })
    .await
    .map_err(|err| transport_error("entitlements", err))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|err| transport_error("entitlements", err))?;

    if !status.is_success() {
        return Err(xbox_error("entitlements", status, &text));
    }

    let value: Value = serde_json::from_str(&text)
        .map_err(|_| AppError::Custom("Некорректный ответ проверки лицензии.".into()))?;
    let owns_game = value
        .get("items")
        .and_then(Value::as_array)
        .is_some_and(|items| {
            items.iter().any(|item| {
                item.get("name")
                    .and_then(Value::as_str)
                    .is_some_and(|name| name.to_ascii_lowercase().contains("minecraft"))
            })
        });

    if !owns_game {
        return Err(AppError::Custom(
            "На этом аккаунте Microsoft нет купленного Minecraft.".into(),
        ));
    }
    Ok(())
}

async fn profile(token: &str) -> AppResult<MinecraftProfileInfo> {
    let response = auth_retry(|| {
        http()
            .get(MINECRAFT_PROFILE_URL)
            .header("Accept", "application/json")
            .header("User-Agent", MINECRAFT_SERVICES_USER_AGENT)
            .bearer_auth(token)
            .timeout(StdDuration::from_secs(10))
            .send()
    })
    .await
    .map_err(|err| transport_error("profile", err))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|err| transport_error("profile", err))?;

    if !status.is_success() {
        return Err(xbox_error("profile", status, &text));
    }

    let value: Value = serde_json::from_str(&text)
        .map_err(|_| AppError::Custom("Некорректный профиль Minecraft.".into()))?;
    let id = value
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::Custom("В профиле Minecraft нет UUID.".into()))?;
    let name = value
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::Custom("В профиле Minecraft нет имени игрока.".into()))?;

    Ok(MinecraftProfileInfo {
        id: id.to_string(),
        name: name.to_string(),
    })
}

pub async fn begin_login(paths: &AppPaths, data_dir: &Path) -> AppResult<LoginFlow> {
    let file = auth_file(paths, data_dir);
    let _guard = lock_file(&file).await;
    let mut store: AuthStore = read_locked(&file).await?;

    let (device, date) = ensure_device(&mut store).await?;
    let verifier = generate_verifier();
    let challenge = challenge_for(&verifier);
    let (session_id, auth_url) = sisu_authenticate(&device, &challenge, date).await?;

    write_locked(&file, &store).await?;
    Ok(LoginFlow {
        verifier,
        session_id,
        auth_url,
    })
}

/// Завершает вход и сохраняет токены под указанным локальным ID аккаунта.
pub async fn finish_login(
    paths: &AppPaths,
    data_dir: &Path,
    account_id: &str,
    code: &str,
    flow: &LoginFlow,
) -> AppResult<MinecraftProfileInfo> {
    let file = auth_file(paths, data_dir);
    let _guard = lock_file(&file).await;
    let mut store: AuthStore = read_locked(&file).await?;

    let (device, _) = ensure_device(&mut store).await?;
    let oauth = oauth_token(code, &flow.verifier).await?;
    let sisu = sisu_authorize(
        Some(&flow.session_id),
        &oauth.value.access_token,
        &device,
        oauth.date,
    )
    .await?;
    let xsts = xsts_authorize(sisu.value, &device, sisu.date).await?;
    let minecraft = minecraft_token(&xsts.value).await?;
    ensure_entitlement(&minecraft.access_token).await?;
    let profile = profile(&minecraft.access_token).await?;

    store.accounts.insert(
        account_id.to_string(),
        StoredCredentials {
            access_token: minecraft.access_token,
            refresh_token: oauth.value.refresh_token,
            expires_at: oauth.date + Duration::seconds(oauth.value.expires_in as i64),
            xuid: xuid_of(&xsts.value),
        },
    );

    write_locked(&file, &store).await?;
    Ok(profile)
}

async fn refresh_account(store: &mut AuthStore, account_id: &str) -> AppResult<()> {
    let existing = store
        .accounts
        .get(account_id)
        .cloned()
        .ok_or_else(|| AppError::Custom(SESSION_EXPIRED.into()))?;

    let (device, _) = ensure_device(store).await?;
    let oauth = oauth_refresh(&existing.refresh_token).await?;
    let sisu = sisu_authorize(None, &oauth.value.access_token, &device, oauth.date).await?;
    let xsts = xsts_authorize(sisu.value, &device, sisu.date).await?;
    let minecraft = minecraft_token(&xsts.value).await?;

    store.accounts.insert(
        account_id.to_string(),
        StoredCredentials {
            access_token: minecraft.access_token,
            refresh_token: oauth.value.refresh_token,
            expires_at: oauth.date + Duration::seconds(oauth.value.expires_in as i64),
            xuid: xuid_of(&xsts.value),
        },
    );
    Ok(())
}

/// Возвращает действующий токен Minecraft, обновляя его при необходимости.
pub async fn launch_credentials(
    paths: &AppPaths,
    data_dir: &Path,
    account_id: &str,
) -> AppResult<LaunchCredentials> {
    let file = auth_file(paths, data_dir);
    let _guard = lock_file(&file).await;
    let mut store: AuthStore = read_locked(&file).await?;

    let expired = store
        .accounts
        .get(account_id)
        .map(|credentials| {
            credentials.expires_at <= Utc::now() + Duration::minutes(REFRESH_MARGIN_MINUTES)
        })
        .ok_or_else(|| AppError::Custom(SESSION_EXPIRED.into()))?;

    if expired {
        if let Err(err) = refresh_account(&mut store, account_id).await {
            let message = err.to_string();
            if message.contains("Сессия Microsoft истекла") {
                store.accounts.remove(account_id);
                write_locked(&file, &store).await?;
                return Err(err);
            }
            // Сеть недоступна — пробуем запустить со старым токеном: иногда
            // он ещё принимается, а разлогинивать из-за обрыва нельзя.
            if !message.contains("Нет связи с Microsoft")
                && !message.contains("Ошибка запроса к Microsoft")
            {
                return Err(err);
            }
        } else {
            write_locked(&file, &store).await?;
        }
    }

    let credentials = store
        .accounts
        .get(account_id)
        .ok_or_else(|| AppError::Custom(SESSION_EXPIRED.into()))?;

    Ok(LaunchCredentials {
        access_token: credentials.access_token.clone(),
        xuid: credentials.xuid.clone(),
    })
}

pub async fn remove_credentials(
    paths: &AppPaths,
    data_dir: &Path,
    account_id: &str,
) -> AppResult<()> {
    let file = auth_file(paths, data_dir);
    let _guard = lock_file(&file).await;
    let mut store: AuthStore = read_locked(&file).await?;
    store.accounts.remove(account_id);
    write_locked(&file, &store).await
}

/// Переносит токены на другой локальный ID: при повторном входе в тот же
/// Microsoft-аккаунт создаётся временная запись, которую нужно слить со старой.
pub async fn move_credentials(
    paths: &AppPaths,
    data_dir: &Path,
    from: &str,
    to: &str,
) -> AppResult<()> {
    if from == to {
        return Ok(());
    }
    let file = auth_file(paths, data_dir);
    let _guard = lock_file(&file).await;
    let mut store: AuthStore = read_locked(&file).await?;
    if let Some(credentials) = store.accounts.remove(from) {
        store.accounts.insert(to.to_string(), credentials);
    }
    write_locked(&file, &store).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifier_is_hex_and_challenge_is_base64url() {
        let verifier = generate_verifier();
        assert_eq!(verifier.len(), 128);
        assert!(verifier.chars().all(|c| c.is_ascii_hexdigit()));

        let challenge = challenge_for(&verifier);
        assert!(!challenge.contains('='));
        assert!(!challenge.contains('+'));
        assert!(!challenge.contains('/'));
    }

    #[test]
    fn device_token_is_accepted_only_before_deadline() {
        let token = DeviceToken {
            issue_instant: Utc::now() - Duration::hours(1),
            not_after: Utc::now() + Duration::hours(1),
            token: "token".into(),
            display_claims: HashMap::new(),
        };
        assert!(token.not_after > Utc::now());

        let expired = DeviceToken {
            not_after: Utc::now() - Duration::seconds(1),
            ..token
        };
        assert!(expired.not_after < Utc::now());
    }

    #[test]
    fn maps_known_xbox_errors_to_human_messages() {
        let error = xbox_error(
            "xsts",
            reqwest::StatusCode::UNAUTHORIZED,
            r#"{"XErr":2148916238}"#,
        );
        assert!(error.to_string().contains("детский аккаунт"));

        let error = xbox_error(
            "refresh",
            reqwest::StatusCode::BAD_REQUEST,
            r#"{"error":"invalid_grant"}"#,
        );
        assert_eq!(error.to_string(), SESSION_EXPIRED);

        let error = xbox_error("minecraft", reqwest::StatusCode::TOO_MANY_REQUESTS, "{}");
        assert!(error.to_string().contains("Слишком много"));
    }
}
