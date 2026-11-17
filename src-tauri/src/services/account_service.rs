use crate::error::{AppError, AppResult};
use crate::models::account::{AccountsStore, OfflineAccount};
use crate::storage::json_store::{lock_file, read_json_or_default, read_locked, write_locked};
use crate::storage::paths::AppPaths;
use chrono::Utc;
use md5::{Digest, Md5};
use std::path::Path;
use uuid::Uuid;

pub fn validate_username(username: &str) -> AppResult<String> {
    let trimmed = username.trim();
    if trimmed.len() < 3 || trimmed.len() > 16 {
        return Err(AppError::Validation(
            "Никнейм должен содержать от 3 до 16 символов".into(),
        ));
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err(AppError::Validation(
            "Никнейм может содержать только латинские буквы, цифры и символ '_'".into(),
        ));
    }
    Ok(trimmed.to_string())
}

/// Стандартный Offline UUID v3 Minecraft: MD5("OfflinePlayer:<username>")
pub fn compute_offline_uuid(username: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(format!("OfflinePlayer:{}", username).as_bytes());
    let mut bytes: [u8; 16] = hasher.finalize().into();

    // RFC 4122 version 3 + variant 1
    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    Uuid::from_bytes(bytes).hyphenated().to_string()
}

pub async fn load_accounts(paths: &AppPaths, data_dir: &Path) -> AppResult<AccountsStore> {
    read_json_or_default(&paths.accounts_file(data_dir)).await
}

pub async fn create_account(
    paths: &AppPaths,
    data_dir: &Path,
    username: &str,
) -> AppResult<AccountsStore> {
    let clean_name = validate_username(username)?;
    let file = paths.accounts_file(data_dir);
    let _guard = lock_file(&file).await;
    let mut store: AccountsStore = read_locked(&file).await?;

    if store
        .accounts
        .iter()
        .any(|acc| acc.username.eq_ignore_ascii_case(&clean_name))
    {
        return Err(AppError::Validation(format!(
            "Аккаунт с ником '{}' уже существует",
            clean_name
        )));
    }

    let account = OfflineAccount {
        id: Uuid::new_v4().to_string(),
        uuid: compute_offline_uuid(&clean_name),
        username: clean_name,
        created_at: Utc::now().to_rfc3339(),
        last_used_at: None,
    };

    let new_id = account.id.clone();
    store.accounts.push(account);
    if store.active_account_id.is_none() {
        store.active_account_id = Some(new_id);
    }

    write_locked(&file, &store).await?;
    Ok(store)
}

pub async fn set_active_account(
    paths: &AppPaths,
    data_dir: &Path,
    account_id: &str,
) -> AppResult<AccountsStore> {
    let file = paths.accounts_file(data_dir);
    let _guard = lock_file(&file).await;
    let mut store: AccountsStore = read_locked(&file).await?;
    if !store.accounts.iter().any(|acc| acc.id == account_id) {
        return Err(AppError::NotFound("Аккаунт не найден".into()));
    }
    store.active_account_id = Some(account_id.to_string());
    write_locked(&file, &store).await?;
    Ok(store)
}

pub async fn rename_account(
    paths: &AppPaths,
    data_dir: &Path,
    account_id: &str,
    new_username: &str,
) -> AppResult<AccountsStore> {
    let clean_name = validate_username(new_username)?;
    let file = paths.accounts_file(data_dir);
    let _guard = lock_file(&file).await;
    let mut store: AccountsStore = read_locked(&file).await?;

    if store
        .accounts
        .iter()
        .any(|acc| acc.id != account_id && acc.username.eq_ignore_ascii_case(&clean_name))
    {
        return Err(AppError::Validation(format!(
            "Аккаунт с ником '{}' уже существует",
            clean_name
        )));
    }

    let account = store
        .accounts
        .iter_mut()
        .find(|acc| acc.id == account_id)
        .ok_or_else(|| AppError::NotFound("Аккаунт не найден".into()))?;

    account.username = clean_name.clone();
    account.uuid = compute_offline_uuid(&clean_name);

    write_locked(&file, &store).await?;
    Ok(store)
}

pub async fn delete_account(
    paths: &AppPaths,
    data_dir: &Path,
    account_id: &str,
) -> AppResult<AccountsStore> {
    let file = paths.accounts_file(data_dir);
    let _guard = lock_file(&file).await;
    let mut store: AccountsStore = read_locked(&file).await?;
    let initial_len = store.accounts.len();
    store.accounts.retain(|acc| acc.id != account_id);

    if store.accounts.len() == initial_len {
        return Err(AppError::NotFound("Аккаунт не найден".into()));
    }

    if store.active_account_id.as_deref() == Some(account_id) {
        store.active_account_id = store.accounts.first().map(|a| a.id.clone());
    }

    write_locked(&file, &store).await?;
    Ok(store)
}

pub async fn mark_account_used(
    paths: &AppPaths,
    data_dir: &Path,
    account_id: &str,
) -> AppResult<()> {
    let file = paths.accounts_file(data_dir);
    let _guard = lock_file(&file).await;
    let mut store: AccountsStore = read_locked(&file).await?;
    if let Some(acc) = store.accounts.iter_mut().find(|a| a.id == account_id) {
        acc.last_used_at = Some(Utc::now().to_rfc3339());
        write_locked(&file, &store).await?;
    }
    Ok(())
}
