use crate::models::account::{AccountsStore, OfflineAccount};
use crate::services::account_service;
use crate::state::AppState;
use crate::{commands::shared, AppError};
use tauri::State;

#[tauri::command]
pub async fn get_accounts(state: State<'_, AppState>) -> Result<AccountsStore, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    account_service::load_accounts(&paths, &data_dir).await
}

#[tauri::command]
pub async fn create_account(
    state: State<'_, AppState>,
    username: String,
) -> Result<AccountsStore, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    account_service::create_account(&paths, &data_dir, &username).await
}

#[tauri::command]
pub async fn set_active_account(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<AccountsStore, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    account_service::set_active_account(&paths, &data_dir, &account_id).await
}

#[tauri::command]
pub async fn rename_account(
    state: State<'_, AppState>,
    account_id: String,
    username: String,
) -> Result<AccountsStore, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    account_service::rename_account(&paths, &data_dir, &account_id, &username).await
}

#[tauri::command]
pub async fn delete_account(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<AccountsStore, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    account_service::delete_account(&paths, &data_dir, &account_id).await
}

#[tauri::command]
pub async fn get_active_account(
    state: State<'_, AppState>,
) -> Result<Option<OfflineAccount>, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let store = account_service::load_accounts(&paths, &data_dir).await?;
    let active = store
        .accounts
        .iter()
        .find(|a| Some(a.id.as_str()) == store.active_account_id.as_deref())
        .or_else(|| store.accounts.first())
        .cloned();
    Ok(active)
}
