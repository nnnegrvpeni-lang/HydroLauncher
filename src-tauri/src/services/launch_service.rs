use crate::error::{AppError, AppResult};
use crate::models::events::{GameLogEvent, GameStateEvent, LaunchProgressEvent};
use crate::models::instance::{EngineKind, Instance};
use crate::services::account_service;
use crate::services::horizon_service;
use crate::services::microsoft_auth_service;
use crate::services::mojang_service::{
    collect_classpath, compute_launch_args, ensure_version_files, InstallContext, LaunchSession,
    MojangService,
};
use crate::services::settings_service;
use crate::storage::paths::AppPaths;
use chrono::Utc;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::sync::Mutex;

type KillHandle = tokio::sync::oneshot::Sender<()>;

/// Занятость сборки. `Preparing` появляется до начала скачивания: без этого
/// повторный запуск и удаление видели сборку свободной, пока она готовилась.
enum LaunchSlot {
    Preparing,
    Running {
        kill_tx: KillHandle,
        /// Сигнал «очистка после игры закончена» — по нему выход из лаунчера
        /// ждёт, пока watcher допишет статистику и лог.
        done: Arc<tokio::sync::Notify>,
    },
}

/// Реестр занятых сборок, доступный из state Tauri.
pub struct LaunchRegistry {
    slots: Mutex<HashMap<String, LaunchSlot>>,
    /// Только реально запущенные игры: подготовка и служебные операции не
    /// должны выглядеть как «игра идёт» при закрытии окна.
    running: AtomicUsize,
}

impl LaunchRegistry {
    pub fn new() -> Self {
        Self {
            slots: Mutex::new(HashMap::new()),
            running: AtomicUsize::new(0),
        }
    }

    /// Пытается занять слот. `false` означает, что сборка уже занята: текст
    /// ошибки выбирает вызывающий, потому что причины бывают разные.
    pub async fn try_reserve_quiet(&self, instance_id: &str) -> bool {
        let mut slots = self.slots.lock().await;
        if slots.contains_key(instance_id) {
            return false;
        }
        slots.insert(instance_id.to_string(), LaunchSlot::Preparing);
        true
    }

    /// Атомарно занимает слот. Ошибка означает, что сборка уже готовится или
    /// запущена — второй раз качать и запускать её нельзя.
    pub async fn try_reserve(&self, instance_id: &str) -> AppResult<()> {
        if self.try_reserve_quiet(instance_id).await {
            Ok(())
        } else {
            Err(AppError::Validation("Эта сборка уже запускается".into()))
        }
    }

    /// Переводит занятый слот в состояние «игра запущена».
    pub async fn attach(
        &self,
        instance_id: String,
        kill_tx: KillHandle,
        done: Arc<tokio::sync::Notify>,
    ) {
        let mut slots = self.slots.lock().await;
        let running = LaunchSlot::Running { kill_tx, done };
        match slots.get_mut(&instance_id) {
            Some(slot) => {
                *slot = running;
                self.running.fetch_add(1, Ordering::Relaxed);
            }
            None => {
                slots.insert(instance_id, running);
                self.running.fetch_add(1, Ordering::Relaxed);
            }
        }
    }

    /// Снимает слот. Возвращает канал остановки, только если игра уже идёт.
    pub async fn take(&self, instance_id: &str) -> Option<KillHandle> {
        let mut slots = self.slots.lock().await;
        match slots.remove(instance_id) {
            Some(LaunchSlot::Running { kill_tx, .. }) => {
                self.running.fetch_sub(1, Ordering::Relaxed);
                Some(kill_tx)
            }
            Some(LaunchSlot::Preparing) | None => None,
        }
    }

    /// Освобождает слот, не посылая сигнал остановки.
    pub async fn release(&self, instance_id: &str) {
        let _ = self.take(instance_id).await;
    }

    pub async fn contains(&self, instance_id: &str) -> bool {
        self.slots.lock().await.contains_key(instance_id)
    }

    /// Занята ли сборка любой операцией: подготовкой, игрой или службой.
    pub async fn has_active(&self) -> bool {
        !self.slots.lock().await.is_empty()
    }

    pub async fn ids(&self) -> Vec<String> {
        self.slots.lock().await.keys().cloned().collect()
    }

    /// Синхронная проверка для CloseRequested: ждать мьютекс там нельзя.
    pub fn has_running(&self) -> bool {
        self.running.load(Ordering::Relaxed) > 0
    }

    /// Останавливает все запущенные игры (сигнал watcher-задачам).
    pub async fn stop_all(&self) {
        let _ = self.signal_all_games().await;
    }

    /// То же, но ждёт окончания очистки (лог, статистика) не дольше таймаута.
    /// Фиксированная пауза перед выходом не гарантировала, что watcher успел
    /// дописать файлы.
    pub async fn stop_all_and_wait(&self, timeout: std::time::Duration) {
        let pending = self.signal_all_games().await;
        if pending.is_empty() {
            return;
        }
        let wait_all = async {
            for done in pending {
                done.notified().await;
            }
        };
        let _ = tokio::time::timeout(timeout, wait_all).await;
    }

    async fn signal_all_games(&self) -> Vec<Arc<tokio::sync::Notify>> {
        let mut pending = Vec::new();
        let mut slots = self.slots.lock().await;
        for (_, slot) in slots.drain() {
            if let LaunchSlot::Running { kill_tx, done } = slot {
                let _ = kill_tx.send(());
                pending.push(done);
            }
        }
        self.running.store(0, Ordering::Relaxed);
        pending
    }
}

pub async fn prepare_instance(app: AppHandle, instance: Instance) -> AppResult<()> {
    let registry = app.state::<LaunchRegistry>();

    // Подготовка тоже занимает слот: иначе сборку можно удалить прямо во
    // время скачивания файлов.
    if registry.try_reserve(&instance.id).await.is_err() {
        return Ok(());
    }

    let result = prepare_instance_inner(app.clone(), instance.clone()).await;
    registry.release(&instance.id).await;
    emit_state(&app, &instance.id, "exited");
    result
}

async fn prepare_instance_inner(app: AppHandle, instance: Instance) -> AppResult<()> {
    let paths = AppPaths::discover()?;
    let settings = settings_service::load_or_init_settings(&paths).await?;
    let data_dir = PathBuf::from(&settings.data_dir);

    emit_state(&app, &instance.id, "preparing");

    let res: AppResult<()> = async {
        let mojang = MojangService::new();
        let (mut details, summary) = mojang
            .resolve_details_from_manifest(&paths, &data_dir, &instance.minecraft_version)
            .await?;

        let ctx = InstallContext {
            app: app.clone(),
            paths: paths.clone(),
            data_dir: data_dir.clone(),
            instance_id: instance.id.clone(),
            max_concurrent: settings.max_concurrent_downloads,
        };
        ensure_version_files(&ctx, &details).await?;

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
            let java_exec =
                if horizon_service::is_horizon_prepared(&prepare_bin, &prepared_dir).await {
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

    res
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickPlayTarget {
    pub kind: String,
    pub value: String,
}

/// Запускает сборку, занимая слот до начала скачивания. Если подготовка или
/// сам запуск сорвались, слот возвращается — иначе сборка навсегда осталась бы
/// «занятой».
pub async fn launch(
    app: AppHandle,
    instance: Instance,
    quick_play: Option<QuickPlayTarget>,
) -> AppResult<()> {
    let registry = app.state::<LaunchRegistry>();
    registry.try_reserve(&instance.id).await?;

    let result = launch_inner(app.clone(), instance.clone(), quick_play).await;
    if result.is_err() {
        registry.release(&instance.id).await;
    }
    result
}

async fn launch_inner(
    app: AppHandle,
    instance: Instance,
    quick_play: Option<QuickPlayTarget>,
) -> AppResult<()> {
    let paths = AppPaths::discover()?;
    let settings = settings_service::load_or_init_settings(&paths).await?;
    let data_dir = PathBuf::from(&settings.data_dir);

    emit_state(&app, &instance.id, "preparing");

    // 0. Авто-бэкап изменившихся миров (если включён в настройках).
    if settings.auto_backup_worlds {
        let _ = crate::services::world_backup_service::auto_backup_changed_worlds(
            &app,
            &paths,
            &data_dir,
            &instance.id,
            settings.backup_retention,
        )
        .await;
    }

    // 1. Описание версии из манифеста Mojang
    let mojang = MojangService::new();
    let (mut details, summary) = mojang
        .resolve_details_from_manifest(&paths, &data_dir, &instance.minecraft_version)
        .await?;

    // 2. Файлы версии: клиент, ассеты, библиотеки, нативы. Общая папка версии
    // ставится под замок, чтобы две сборки не качали одно и то же параллельно.
    let ctx = InstallContext {
        app: app.clone(),
        paths: paths.clone(),
        data_dir: data_dir.clone(),
        instance_id: instance.id.clone(),
        max_concurrent: settings.max_concurrent_downloads,
    };
    ensure_version_files(&ctx, &details).await?;

    // 3. Активный офлайн-аккаунт
    let accounts = account_service::load_accounts(&paths, &data_dir).await?;
    let account = accounts
        .accounts
        .iter()
        .find(|a| Some(a.id.as_str()) == accounts.active_account_id.as_deref())
        .or_else(|| accounts.accounts.first())
        .ok_or_else(|| AppError::Validation("Не найдено ни одного офлайн-аккаунта".into()))?
        .clone();

    // Данные входа: офлайн-профиль или токен Microsoft.
    let session = if account.kind.is_microsoft() {
        let credentials =
            microsoft_auth_service::launch_credentials(&paths, &data_dir, &account.id).await?;
        LaunchSession::microsoft(
            &account.username,
            &account.uuid,
            &credentials.access_token,
            credentials.xuid.as_deref(),
        )
    } else {
        LaunchSession::offline(&account.username, &account.uuid)
    };

    // Отмечаем аккаунт до спавна: ошибка записи не должна превращать уже
    // запущенную игру в «неудачный запуск».
    let _ = account_service::mark_account_used(&paths, &data_dir, &account.id).await;

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
                &session,
                &game_dir,
                memory_mb,
                &instance.jvm_args,
                &instance.game_args,
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
            let mut command = Command::new(&java_exec);
            command
                .args(&args)
                .current_dir(&game_dir)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped());
            #[cfg(unix)]
            command.process_group(0);
            crate::services::process_ext::hide_console(&mut command);
            command
                .spawn()
                .map_err(|e| AppError::Process(format!("Не удалось запустить игру: {}", e)))?
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
            let prepared_dir_path =
                paths.horizon_prepared_dir(&data_dir, &details.id, &horizon_tag);
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
            cmd.current_dir(&game_dir)
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped());
            #[cfg(unix)]
            cmd.process_group(0);
            crate::services::process_ext::hide_console(&mut cmd);
            let mut proc = cmd
                .spawn()
                .map_err(|e| AppError::Process(format!("Не удалось запустить Horizon: {}", e)))?;

            if let Some(mut stdin) = proc.stdin.take() {
                let session_json = serde_json::json!({
                    "name": session.username,
                    "uuid": session.uuid,
                    "access_token": session.access_token
                })
                .to_string();
                let _ = stdin.write_all(session_json.as_bytes()).await;
                let _ = stdin.shutdown().await;
            }
            proc
        }
    };

    // Лог процесса пишем в файл: он переживёт перезапуск лаунчера.
    let log_path = paths
        .instance_dir(&data_dir, &instance.id)
        .join("logs")
        .join("latest.log");
    let log_sink = prepare_log_sink(&log_path).await;

    if let Some(stdout) = child.stdout.take() {
        spawn_log_pipe(
            app.clone(),
            instance.id.clone(),
            "stdout",
            stdout,
            log_sink.clone(),
        );
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_log_pipe(
            app.clone(),
            instance.id.clone(),
            "stderr",
            stderr,
            log_sink.clone(),
        );
    }
    let log_sink_watcher = log_sink.clone();

    let (kill_tx, mut kill_rx) = tokio::sync::oneshot::channel::<()>();
    let cleanup_done = Arc::new(tokio::sync::Notify::new());
    app.state::<LaunchRegistry>()
        .attach(instance.id.clone(), kill_tx, cleanup_done.clone())
        .await;
    emit_state(&app, &instance.id, "running");

    // Сворачиваем окно, чтобы не мешать игре (настройка «сворачивать при запуске»).
    if settings.close_on_launch {
        hide_window_on_launch(&app, settings.close_to_tray);
    }

    // 7. Наблюдение за завершением процесса (без удержания Mutex во время wait)
    let watcher_app = app.clone();
    let watcher_instance = instance.clone();
    tokio::spawn(async move {
        let started_at = std::time::Instant::now();
        let (was_killed, exit_code) = tokio::select! {
            res = child.wait() => (false, res.ok().and_then(|s| s.code())),
            _ = &mut kill_rx => {
                kill_game_process(&mut child).await;
                (true, None)
            }
        };

        let watcher_registry = watcher_app.state::<LaunchRegistry>();
        watcher_registry.release(&watcher_instance.id).await;

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

        // Сначала дописываем файл, потом уведомляем интерфейс: он может сразу
        // открыть лог для отчёта о краше.
        if let Some(sink) = &log_sink_watcher {
            let code = exit_code
                .map(|value| value.to_string())
                .unwrap_or_else(|| "—".to_string());
            let footer = format!("=== Игра завершилась: {state} (код {code}) ===\n");
            let mut file = sink.lock().await;
            let _ = file.write_all(footer.as_bytes()).await;
        }

        emit_state_with_code(&watcher_app, &watcher_instance.id, state, exit_code);

        if restore_window {
            restore_main_window(&watcher_app);
        }

        // Выход из лаунчера ждёт этот сигнал, чтобы не оборвать запись лога.
        cleanup_done.notify_one();
    });

    Ok(())
}

pub async fn terminate(app: AppHandle, instance_id: String) -> AppResult<bool> {
    let registry = app.state::<LaunchRegistry>();
    if let Some(kill_tx) = registry.take(&instance_id).await {
        let _ = kill_tx.send(());
        return Ok(true);
    }
    Ok(false)
}

pub async fn running_ids(app: AppHandle) -> Vec<String> {
    app.state::<LaunchRegistry>().ids().await
}

/// Останавливает игру вместе с дочерними процессами. На Windows одного
/// `kill()` мало: crash-обработчик и вспомогательные процессы остаются висеть.
async fn kill_game_process(child: &mut tokio::process::Child) {
    #[cfg(target_os = "windows")]
    if let Some(pid) = child.id() {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await;
    }

    #[cfg(unix)]
    if let Some(pid) = child.id() {
        // Игра запущена в отдельной группе процессов, поэтому отрицательный
        // pid завершает всю группу, а не только сам JVM.
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }

    let _ = child.kill().await;
    let _ = child.wait().await;
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
        let path = std::path::Path::new(override_path);
        if !tokio::fs::try_exists(path).await.unwrap_or(false) {
            return Err(AppError::Validation(format!(
                "Java по указанному пути не найдена: {override_path}. Проверьте параметры сборки"
            )));
        }
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

type LogSink = Arc<tokio::sync::Mutex<tokio::fs::File>>;

/// Готовит `logs/latest.log`, сохраняя прошлый запуск как `previous.log`.
async fn prepare_log_sink(path: &std::path::Path) -> Option<LogSink> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.ok()?;
    }

    let previous = path.with_file_name("previous.log");
    let _ = tokio::fs::remove_file(&previous).await;
    let _ = tokio::fs::rename(path, &previous).await;

    let file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await
        .ok()?;
    let sink = Arc::new(tokio::sync::Mutex::new(file));
    let header = format!(
        "=== HydroLauncher: запуск {} ===\n",
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S")
    );
    sink.lock().await.write_all(header.as_bytes()).await.ok()?;
    Some(sink)
}

fn spawn_log_pipe(
    app: AppHandle,
    instance_id: String,
    stream: &'static str,
    reader: impl tokio::io::AsyncRead + Unpin + Send + 'static,
    sink: Option<LogSink>,
) {
    tokio::spawn(async move {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Some(sink) = &sink {
                let entry = format!(
                    "[{}] [{}] {}\n",
                    chrono::Local::now().format("%H:%M:%S"),
                    stream,
                    line
                );
                let mut file = sink.lock().await;
                let _ = file.write_all(entry.as_bytes()).await;
            }
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

fn emit_state_with_code(app: &AppHandle, instance_id: &str, state: &str, exit_code: Option<i32>) {
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

/// Прячет окно при запуске игры: в трей или в панель задач.
fn hide_window_on_launch(app: &AppHandle, to_tray: bool) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if to_tray {
        let _ = window.hide();
    } else {
        let _ = window.minimize();
    }
}

/// Возвращает окно после выхода из игры — из трея или из панели задач.
fn restore_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

#[cfg(test)]
mod tests {
    use super::{classify_exit, LaunchRegistry};

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

    #[tokio::test]
    async fn registry_tracks_running_processes_synchronously() {
        let registry = LaunchRegistry::new();
        assert!(!registry.has_running());

        registry.try_reserve("inst-1").await.unwrap();
        // Подготовка занимает слот, но игрой ещё не считается.
        assert!(!registry.has_running());
        assert!(registry.has_active().await);
        assert!(registry.contains("inst-1").await);

        let (tx, _rx) = tokio::sync::oneshot::channel();
        registry
            .attach(
                "inst-1".to_string(),
                tx,
                std::sync::Arc::new(tokio::sync::Notify::new()),
            )
            .await;
        assert!(registry.has_running());
        assert!(registry.contains("inst-1").await);

        registry.release("inst-1").await;
        assert!(!registry.has_running());

        let (tx, _rx) = tokio::sync::oneshot::channel();
        registry
            .attach(
                "inst-2".to_string(),
                tx,
                std::sync::Arc::new(tokio::sync::Notify::new()),
            )
            .await;
        registry.stop_all().await;
        assert!(!registry.has_running());
        assert!(!registry.has_active().await);
        assert!(registry.ids().await.is_empty());
    }

    #[tokio::test]
    async fn reservation_blocks_second_launch() {
        let registry = LaunchRegistry::new();
        registry.try_reserve("inst-1").await.unwrap();

        // Второй запуск той же сборки должен получить отказ ещё до скачивания.
        assert!(registry.try_reserve("inst-1").await.is_err());
        assert!(!registry.try_reserve_quiet("inst-1").await);
        assert_eq!(registry.ids().await, vec!["inst-1".to_string()]);

        registry.release("inst-1").await;
        assert!(registry.try_reserve("inst-1").await.is_ok());
    }

    #[tokio::test]
    async fn prepare_slot_cannot_be_terminated() {
        let registry = LaunchRegistry::new();
        registry.try_reserve("inst-1").await.unwrap();

        // Пока идёт подготовка, останавливать нечего, но слот занят.
        assert!(registry.take("inst-1").await.is_none());
        assert!(!registry.has_running());
        assert!(registry.try_reserve("inst-1").await.is_ok());
    }
}
