use crate::commands::shared;
use crate::error::AppError;
use crate::services::jobs::{JobRecord, JobsRegistry};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_jobs(
    state: State<'_, AppState>,
    jobs: State<'_, JobsRegistry>,
) -> Result<Vec<JobRecord>, AppError> {
    let (_paths, data_dir) = shared::resolve_data_dir(&state).await?;
    jobs.ensure_loaded(&data_dir).await;
    Ok(jobs.list())
}

#[tauri::command]
pub async fn pause_job(
    app: tauri::AppHandle,
    jobs: State<'_, JobsRegistry>,
    job_id: String,
) -> Result<(), AppError> {
    jobs.pause(&app, &job_id)
}

#[tauri::command]
pub async fn resume_job(
    app: tauri::AppHandle,
    jobs: State<'_, JobsRegistry>,
    job_id: String,
) -> Result<(), AppError> {
    jobs.resume(&app, &job_id)
}

#[tauri::command]
pub async fn cancel_job(
    app: tauri::AppHandle,
    jobs: State<'_, JobsRegistry>,
    job_id: String,
) -> Result<(), AppError> {
    jobs.cancel(&app, &job_id)
}

#[tauri::command]
pub async fn dismiss_job(jobs: State<'_, JobsRegistry>, job_id: String) -> Result<(), AppError> {
    jobs.dismiss(&job_id)
}
