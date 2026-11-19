use crate::commands::shared;
use crate::services::skin_service::{self, SkinProfile};
use crate::state::AppState;
use crate::AppError;
use tauri::State;

#[tauri::command]
pub async fn get_skin(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<SkinProfile, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    skin_service::get_skin(&paths, &data_dir, &account_id).await
}

#[tauri::command]
pub async fn upload_skin(
    state: State<'_, AppState>,
    account_id: String,
    file_path: String,
    variant: String,
) -> Result<SkinProfile, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    skin_service::upload_skin(
        &paths,
        &data_dir,
        &account_id,
        std::path::Path::new(&file_path),
        &variant,
    )
    .await
}

#[tauri::command]
pub async fn reset_skin(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<SkinProfile, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    skin_service::reset_skin(&paths, &data_dir, &account_id).await
}

#[tauri::command]
pub async fn equip_cape(
    state: State<'_, AppState>,
    account_id: String,
    cape_id: String,
) -> Result<SkinProfile, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    skin_service::equip_cape(&paths, &data_dir, &account_id, &cape_id).await
}

#[tauri::command]
pub async fn remove_cape(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<SkinProfile, AppError> {
    let (paths, data_dir) = shared::resolve_data_dir(&state).await?;
    skin_service::remove_cape(&paths, &data_dir, &account_id).await
}

/// Системный диалог выбора PNG. Возвращает путь, а не содержимое файла:
/// читает и проверяет его бэкенд.
#[tauri::command]
pub async fn pick_skin_file() -> Result<Option<String>, AppError> {
    Ok(rfd::FileDialog::new()
        .set_title("Выбор скина")
        .add_filter("PNG", &["png"])
        .pick_file()
        .map(|path| path.to_string_lossy().into_owned()))
}
