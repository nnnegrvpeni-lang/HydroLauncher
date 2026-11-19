use crate::config::endpoints::MICROSOFT_AUTH_REPLY_URL;
use crate::models::account::{AccountsStore, OfflineAccount};
use crate::services::{account_service, microsoft_auth_service};
use crate::state::AppState;
use crate::{commands::shared, AppError};
use std::time::{Duration, Instant};
use tauri::{Manager, State};

const LOGIN_WINDOW: &str = "microsoft-signin";
const LOGIN_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const LOGIN_POLL: Duration = Duration::from_millis(150);

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
    let store = account_service::delete_account(&paths, &data_dir, &account_id).await?;
    // Для офлайн-аккаунта это просто no-op.
    let _ = microsoft_auth_service::remove_credentials(&paths, &data_dir, &account_id).await;
    Ok(store)
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

/// Открывает окно входа Microsoft и ждёт, пока пользователь завершит вход.
/// Окно живёт до десяти минут; закрытие окна считается отменой.
#[tauri::command]
pub async fn microsoft_login(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<AccountsStore, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    let flow = microsoft_auth_service::begin_login(&paths, &data_dir).await?;
    let auth_url = tauri::Url::parse(flow.auth_url())
        .map_err(|_| AppError::Custom("Microsoft вернул некорректный адрес входа".into()))?;

    if let Some(previous) = app.get_webview_window(LOGIN_WINDOW) {
        let _ = previous.close();
    }

    let window =
        tauri::WebviewWindowBuilder::new(&app, LOGIN_WINDOW, tauri::WebviewUrl::External(auth_url))
            .title("Вход в Microsoft")
            .inner_size(1000.0, 700.0)
            .min_inner_size(500.0, 500.0)
            .center()
            .focused(true)
            .build()
            .map_err(|e| AppError::Custom(format!("Не удалось открыть окно входа: {e}")))?;

    let started = Instant::now();
    let code = loop {
        if started.elapsed() > LOGIN_TIMEOUT {
            let _ = window.close();
            return Err(AppError::Custom(
                "Время входа истекло. Попробуйте снова.".into(),
            ));
        }

        if app.get_webview_window(LOGIN_WINDOW).is_none() {
            return Err(AppError::Custom("Вход отменён".into()));
        }

        match window.url() {
            Ok(current) if current.as_str().starts_with(MICROSOFT_AUTH_REPLY_URL) => {
                let mut auth_code = None;
                let mut denied = false;
                for (key, value) in current.query_pairs() {
                    match key.as_ref() {
                        "code" => auth_code = Some(value.into_owned()),
                        "error" => denied = true,
                        _ => {}
                    }
                }

                if let Some(code) = auth_code {
                    break code;
                }

                let _ = window.close();
                return Err(AppError::Custom(
                    if denied {
                        "Вход отменён"
                    } else {
                        "Microsoft не вернул код входа"
                    }
                    .into(),
                ));
            }
            Ok(_) => {}
            Err(_) => return Err(AppError::Custom("Вход отменён".into())),
        }

        tokio::time::sleep(LOGIN_POLL).await;
    };
    let _ = window.close();

    // Токены временно сохраняются под новым ID. Если такой Microsoft-аккаунт
    // уже есть, `upsert_microsoft_account` вернёт его ID, а токены переедут.
    let temporary_id = uuid::Uuid::new_v4().to_string();
    let profile =
        microsoft_auth_service::finish_login(&paths, &data_dir, &temporary_id, &code, &flow)
            .await?;
    let (store, account_id) = match account_service::upsert_microsoft_account(
        &paths,
        &data_dir,
        &temporary_id,
        &profile.name,
        &profile.id,
    )
    .await
    {
        Ok(result) => result,
        Err(err) => {
            let _ =
                microsoft_auth_service::remove_credentials(&paths, &data_dir, &temporary_id).await;
            return Err(err);
        }
    };

    microsoft_auth_service::move_credentials(&paths, &data_dir, &temporary_id, &account_id).await?;
    Ok(store)
}
