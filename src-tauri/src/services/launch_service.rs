use crate::error::{AppError, AppResult};
use crate::models::events::{GameLogEvent, GameStateEvent, LaunchProgressEvent};
use crate::models::instance::{EngineKind, Instance};
use crate::services::account_service;
use crate::services::horizon_service;
use crate::services::mojang_service::{
    collect_classpath, compute_launch_args, install_version_files, is_version_installed,
    InstallContext, MojangService,
};
use crate::services::settings_service;
use crate::storage::paths::AppPaths;
use chrono::Utc;
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::sync::Mutex;

type KillHandle = tokio::sync::oneshot::Sender<()>;

/// Реестр запущенных игровых процессов, доступный из state Tauri.
pub struct LaunchRegistry {
    processes: Mutex<HashMap<String, KillHandle>>,
}

impl LaunchRegistry {
    pub fn new() -> Self {
        Self {
            processes: Mutex::new(HashMap::new()),
        }
    }

    pub async fn insert(&self, instance_id: String, kill_tx: KillHandle) {
        self.processes.lock().await.insert(instance_id, kill_tx);
    }

    pub async fn remove(&self, instance_id: &str) -> Option<KillHandle> {
        self.processes.lock().await.remove(instance_id)
    }

    pub async fn contains(&self, instance_id: &str) -> bool {
        self.processes.lock().await.contains_key(instance_id)
    }

    pub async fn ids(&self) -> Vec<String> {
        self.processes.lock().await.keys().cloned().collect()
    }
}

pub async fn prepare_instance(app: AppHandle, instance: Instance) -> AppResult<()> {
    let registry = app.state::<LaunchRegistry>();
    if registry.contains(&instance.id).await {
        return Ok(());
    }

    let paths = AppPaths::discover()?;
    let settings = settings_service::load_or_init_settings(&paths).await?;
    let data_dir = PathBuf::from(&settings.data_dir);

    emit_state(&app, &instance.id, "preparing");

    let res: AppResult<()> = async {
        let mojang = MojangService::new();
        let (mut details, summary) = mojang
            .resolve_details_from_manifest(&paths, &data_dir, &instance.minecraft_version)
            .await?;

        if !is_version_installed(&paths, &data_dir, &details.id).await {
            let ctx = InstallContext {
                app: app.clone(),
                paths: paths.clone(),
                data_dir: data_dir.clone(),
                instance_id: instance.id.clone(),
                max_concurrent: settings.max_concurrent_downloads,
            };
            install_version_files(&ctx, &details).await?;
        }

        if instance.engine == EngineKind::Horizon {
            let (_client_bin, prepare_bin) = horizon_service::ensure_horizon_binaries(
                &app,
                &paths,
                &data_dir,
                &instance.id,
                instance.loader_version.as_deref(),
                instance.auto_update_horizon,
            )
            .await?;
            let horizon_tag = horizon_service::effective_tag(instance.loader_version.as_deref());
            let prepared_dir = paths.horizon_prepared_dir(&data_dir, &details.id, &horizon_tag);
            let java_exec = if horizon_service::is_horizon_prepared(&prepare_bin, &prepared_dir).await {
                String::new()
            } else {
                let required_major = details
                    .java_version
                    .as_ref()
                    .map(|j| j.major_version)
                    .unwrap_or(8);
                let java_service = crate::services::java_service::JavaService::new();
                resolve_java_exec(
                    &app,
                    &instance.id,
                    &java_service,
                    &paths,
                    &data_dir,
                    &settings,
                    required_major,
                    instance.java_path_override.as_deref(),
                )
                .await?
            };
            horizon_service::ensure_horizon_prepared(
                &app,
                &paths,
                &data_dir,
                &instance.id,
                &details,
                &summary,
                &prepare_bin,
                Some(&horizon_tag),
                &java_exec,
            )
            .await?;
        } else {
            let required_major = details
                .java_version
                .as_ref()
                .map(|j| j.major_version)
                .unwrap_or(8);
            let java_service = crate::services::java_service::JavaService::new();
            let java_exec = resolve_java_exec(
                &app,
                &instance.id,
                &java_service,
                &paths,
                &data_dir,
                &settings,
                required_major,
                instance.java_path_override.as_deref(),
            )
            .await?;
            crate::services::loader_service::apply_modloader(
                &app,
                &paths,
                &data_dir,
                &instance,
                &java_exec,
                &mut details,
            )
            .await?;
        }

        Ok(())
    }
    .await;

    emit_state(&app, &instance.id, "exited");
    res
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickPlayTarget {
    pub kind: String,
    pub value: String,
}

pub async fn launch(
    app: AppHandle,
    instance: Instance,
    quick_play: Option<QuickPlayTarget>,
) -> AppResult<()> {
    let registry = app.state::<LaunchRegistry>();
    if registry.contains(&instance.id).await {
        return Err(AppError::Validation("Эта сборка уже запущена".into()));
    }

    let paths = AppPaths::discover()?;
    let settings = settings_service::load_or_init_settings(&paths).await?;
    let data_dir = PathBuf::from(&settings.data_dir);

    emit_state(&app, &instance.id, "preparing");

    // 1. Описание версии из манифеста Mojang
    let mojang = MojangService::new();
    let (mut details, summary) = mojang
        .resolve_details_from_manifest(&paths, &data_dir, &instance.minecraft_version)
        .await?;

    // 2. Файлы версии: клиент, ассеты, библиотеки, нативы
    if !is_version_installed(&paths, &data_dir, &details.id).await {
        let ctx = InstallContext {
            app: app.clone(),
            paths: paths.clone(),
            data_dir: data_dir.clone(),
            instance_id: instance.id.clone(),
            max_concurrent: settings.max_concurrent_downloads,
        };
        install_version_files(&ctx, &details).await?;
    }

    // 3. Активный офлайн-аккаунт
    let accounts = account_service::load_accounts(&paths, &data_dir).await?;
    let account = accounts
        .accounts
        .iter()
        .find(|a| Some(a.id.as_str()) == accounts.active_account_id.as_deref())
        .or_else(|| accounts.accounts.first())
        .ok_or_else(|| AppError::Validation("Не найдено ни одного офлайн-аккаунта".into()))?
        .clone();

    // 4. Запуск процесса в зависимости от движка
    let game_dir = paths.instance_game_dir(&data_dir, &instance.id);
    tokio::fs::create_dir_all(&game_dir).await?;

    let mut child = match instance.engine {
        EngineKind::Java => {
            let required_major = details
                .java_version
                .as_ref()
                .map(|j| j.major_version)
                .unwrap_or(8);
            let java_service = crate::services::java_service::JavaService::new();
            let java_exec = resolve_java_exec(
                &app,
                &instance.id,
                &java_service,
                &paths,
                &data_dir,
                &settings,
                required_major,
                instance.java_path_override.as_deref(),
            )
            .await?;
            crate::services::loader_service::apply_modloader(
                &app,
                &paths,
                &data_dir,
                &instance,
                &java_exec,
                &mut details,
            )
            .await?;
            let memory_mb = instance
                .memory_mb_override
                .unwrap_or(settings.default_memory_mb);
            let natives_dir = paths.natives_dir(&data_dir, &details.id);
            let assets_dir = paths.assets_dir(&data_dir);
            let libs_dir = paths.libraries_dir(&data_dir);
            let client_jar = paths
                .version_dir(&data_dir, &details.id)
                .join(format!("{}.jar", details.id));
            let classpath = collect_classpath(&details, &libs_dir, &client_jar);

            let mut args = compute_launch_args(
                &details,
                &assets_dir,
                &natives_dir,
                &libs_dir,
                &classpath,
                &account.username,
                &account.uuid,
                &game_dir,
                memory_mb,
                &instance.jvm_args,
            );
            if let Some(qp) = quick_play.as_ref().filter(|q| !q.value.trim().is_empty()) {
                if qp.kind == "world" {
                    args.push("--quickPlaySingleplayer".to_string());
                    args.push(qp.value.clone());
                } else if qp.kind == "server" {
                    args.push("--quickPlayMultiplayer".to_string());
                    args.push(qp.value.clone());
                }
            }

            emit_state(&app, &instance.id, "launching");
            Command::new(&java_exec)
                .args(&args)
                .current_dir(&game_dir)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| AppError::Process(format!("Не удалось запустить иг��у: {}", e)))?
        }
        EngineKind::Horizon => {
            let (client_bin, prepare_bin) = horizon_service::ensure_horizon_binaries(
                &app,
                &paths,
                &data_dir,
                &instance.id,
                instance.loader_version.as_deref(),
                instance.auto_update_horizon,
            )
            .await?;
            let horizon_tag = horizon_service::effective_tag(instance.loader_version.as_deref());
            let prepared_dir_path = paths.horizon_prepared_dir(&data_dir, &details.id, &horizon_tag);
            let java_exec =
                if horizon_service::is_horizon_prepared(&prepare_bin, &prepared_dir_path).await {
                    String::new()
                } else {
                    let required_major = details
                        .java_version
                        .as_ref()
                        .map(|j| j.major_version)
                        .unwrap_or(8);
                    let java_service = crate::services::java_service::JavaService::new();
                    resolve_java_exec(
                        &app,
                        &instance.id,
                        &java_service,
                        &paths,
                        &data_dir,
                        &settings,
                        required_major,
                        instance.java_path_override.as_deref(),
                    )
                    .await?
                };
            let prepared_dir = horizon_service::ensure_horizon_prepared(
                &app,
                &paths,
                &data_dir,
                &instance.id,
                &details,
                &summary,
                &prepare_bin,
                Some(&horizon_tag),
                &java_exec,
            )
            .await?;

            emit_state(&app, &instance.id, "launching");
            let mut cmd = Command::new(&client_bin);
            cmd.arg("--resources")
                .arg(&prepared_dir)
                .arg("--game-dir")
                .arg(&game_dir)
                .arg("--home")
                .arg(&game_dir)
                .arg("--session-stdin");
            if let Some(qp) = quick_play.as_ref().filter(|q| !q.value.trim().is_empty()) {
                if qp.kind == "world" {
                    cmd.arg("--quickPlaySingleplayer").arg(&qp.value);
                } else if qp.kind == "server" {
                    cmd.arg("--quickPlayMultiplayer").arg(&qp.value);
                }
            }
            let mut proc = cmd
                .current_dir(&game_dir)
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| AppError::Process(format!("Не удалось запустить Horizon: {}", e)))?;

            if let Some(mut stdin) = proc.stdin.take() {
                let session_json = serde_json::json!({
                    "name": account.username,
                    "uuid": account.uuid,
                    "access_token": "0"
                })
                .to_string();
                let _ = stdin.write_all(session_json.as_bytes()).await;
                let _ = stdin.shutdown().await;
            }
            proc
        }
    };

    if let Some(stdout) = child.stdout.take() {
        spawn_log_pipe(app.clone(), instance.id.clone(), "stdout", stdout);
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_log_pipe(app.clone(), instance.id.clone(), "stderr", stderr);
    }

    let (kill_tx, mut kill_rx) = tokio::sync::oneshot::channel::<()>();
    registry.insert(instance.id.clone(), kill_tx).await;

    emit_state(&app, &instance.id, "running");
    account_service::mark_account_used(&paths, &data_dir, &account.id).await?;

    // Сворачиваем окно, чтобы не мешать игре (настройка «сворачивать при запуске»).
    if settings.close_on_launch {
        set_window_minimized(&app, true);
    }

    // 7. Наблюдение за завершением процесса (без удержания Mutex во время wait)
    let watcher_app = app.clone();
    let watcher_instance = instance.clone();
    tokio::spawn(async move {
        let started_at = std::time::Instant::now();
        let (was_killed, exit_code) = tokio::select! {
            res = child.wait() => (false, res.ok().and_then(|s| s.code())),
            _ = &mut kill_rx => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                (true, None)
            }
        };

        let watcher_registry = watcher_app.state::<LaunchRegistry>();
        watcher_registry.remove(&watcher_instance.id).await;

        let elapsed = started_at.elapsed().as_secs();
        let mut restore_window = false;
        if let Ok(paths_w) = AppPaths::discover() {
            if let Ok(settings_w) = settings_service::load_or_init_settings(&paths_w).await {
                restore_window = settings_w.close_on_launch;
                let data_dir_w = PathBuf::from(&settings_w.data_dir);
                let _ = crate::services::instance_service::record_play_session(
                    &paths_w,
                    &data_dir_w,
                    &watcher_instance.id,
                    elapsed,
                )
                .await;
            }
        }

        // Нормальный выход — только код 0. Ненулевой код или сигнал считаем падением.
        let state = classify_exit(was_killed, exit_code);
        emit_state_with_code(&watcher_app, &watcher_instance.id, state, exit_code);

        if restore_window {
            set_window_minimized(&watcher_app, false);
        }
    });

    Ok(())
}

pub async fn terminate(app: AppHandle, instance_id: String) -> AppResult<bool> {
    let registry = app.state::<LaunchRegistry>();
    if let Some(kill_tx) = registry.remove(&instance_id).await {
        let _ = kill_tx.send(());
        return Ok(true);
    }
    Ok(false)
}

pub async fn running_ids(app: AppHandle) -> Vec<String> {
    app.state::<LaunchRegistry>().ids().await
}

async fn resolve_java_exec(
    app: &AppHandle,
    instance_id: &str,
    java_service: &crate::services::java_service::JavaService,
    paths: &AppPaths,
    data_dir: &std::path::Path,
    settings: &crate::models::settings::AppSettings,
    required_major: u32,
    override_path: Option<&str>,
) -> AppResult<String> {
    if let Some(override_path) = override_path {
        return Ok(override_path.to_string());
    }

    let managed = java_service
        .list_managed_runtimes(paths, data_dir)
        .await
        .unwrap_or_default();
    if let Some(found) = managed.iter().find(|r| r.major_version == required_major) {
        return Ok(found.path.clone());
    }

    let system = java_service
        .detect_system_runtimes(&settings.custom_java_paths)
        .await?;
    if let Some(found) = system.iter().find(|r| r.major_version == required_major) {
        return Ok(found.path.clone());
    }

    let _ = app.emit(
        "launch://progress",
        LaunchProgressEvent {
            instance_id: instance_id.to_string(),
            stage: "java".to_string(),
            message: format!("Скачивание Java {required_major}…"),
            current: 0,
            total: 1,
            percent: 10.0,
        },
    );

    let runtime = java_service
        .ensure_runtime(paths, data_dir, required_major)
        .await?;

    let _ = app.emit(
        "launch://progress",
        LaunchProgressEvent {
            instance_id: instance_id.to_string(),
            stage: "java".to_string(),
            message: format!("Java {required_major} готова"),
            current: 1,
            total: 1,
            percent: 100.0,
        },
    );

    Ok(runtime.path)
}

fn spawn_log_pipe(
    app: AppHandle,
    instance_id: String,
    stream: &'static str,
    reader: impl tokio::io::AsyncRead + Unpin + Send + 'static,
) {
    tokio::spawn(async move {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app.emit(
                "launch://log",
                GameLogEvent {
                    instance_id: instance_id.clone(),
                    stream: stream.to_string(),
                    line,
                    timestamp: Utc::now().to_rfc3339(),
                },
            );
        }
    });
}

fn emit_state(app: &AppHandle, instance_id: &str, state: &str) {
    emit_state_with_code(app, instance_id, state, None);
}

fn emit_state_with_code(
    app: &AppHandle,
    instance_id: &str,
    state: &str,
    exit_code: Option<i32>,
) {
    let _ = app.emit(
        "launch://state",
        GameStateEvent {
            instance_id: instance_id.to_string(),
            state: state.to_string(),
            exit_code,
        },
    );
}

/// Классифицирует завершение процесса: `exited` только при коде 0 или ручной остановке.
fn classify_exit(was_killed: bool, exit_code: Option<i32>) -> &'static str {
    if was_killed || exit_code == Some(0) {
        "exited"
    } else {
        "crashed"
    }
}

fn set_window_minimized(app: &AppHandle, minimized: bool) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if minimized {
        let _ = window.minimize();
    } else {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::classify_exit;

    #[test]
    fn normal_exit_is_not_a_crash() {
        assert_eq!(classify_exit(false, Some(0)), "exited");
    }

    #[test]
    fn non_zero_exit_code_is_a_crash() {
        assert_eq!(classify_exit(false, Some(1)), "crashed");
        assert_eq!(classify_exit(false, Some(-1073741819)), "crashed");
        assert_eq!(classify_exit(false, None), "crashed");
    }

    #[test]
    fn manual_stop_is_reported_as_exit() {
        assert_eq!(classify_exit(true, None), "exited");
        assert_eq!(classify_exit(true, Some(1)), "exited");
    }
}
