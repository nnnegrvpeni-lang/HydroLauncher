use crate::error::{AppError, AppResult};
use crate::storage::paths::AppPaths;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::sync::{OwnedMutexGuard, OwnedSemaphorePermit, Semaphore};

/// Событие с обновлённой записью задачи. Интерфейс заменяет её по `id`.
pub const JOBS_EVENT: &str = "jobs://update";

/// Сколько завершённых задач хранить в истории и в `jobs.json`.
const MAX_HISTORY: usize = 40;
/// Одновременно выполняются не более двух задач: установка и так упирается
/// в сеть и диск, а параллельные записи в общие папки только мешают друг другу.
const MAX_CONCURRENT_JOBS: usize = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum JobStatus {
    Queued,
    Running,
    Paused,
    Canceling,
    Succeeded,
    Failed,
    Canceled,
}

impl Default for JobStatus {
    fn default() -> Self {
        JobStatus::Queued
    }
}

impl JobStatus {
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            JobStatus::Succeeded | JobStatus::Failed | JobStatus::Canceled
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum JobKind {
    Prepare,
    ModInstall,
    Modpack,
}

impl Default for JobKind {
    fn default() -> Self {
        JobKind::Prepare
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRetry {
    /// Команда, которую интерфейс вызовет повторно с теми же аргументами.
    pub command: String,
    pub args: serde_json::Value,
}

impl JobRetry {
    pub fn new(command: impl Into<String>, args: serde_json::Value) -> Self {
        Self {
            command: command.into(),
            args,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct JobRecord {
    pub id: String,
    pub kind: JobKind,
    /// Заголовок для интерфейса, например «Подготовка «Survival»».
    pub title: String,
    pub instance_id: Option<String>,
    pub status: JobStatus,
    pub message: String,
    pub current: u64,
    pub total: u64,
    pub percent: f64,
    pub error: Option<String>,
    /// Аргументы для повтора. Заполняется только у задач, которые безопасно
    /// запустить заново после ошибки.
    pub retry: Option<JobRetry>,
    pub created_at: String,
    pub updated_at: String,
}

impl Default for JobRecord {
    fn default() -> Self {
        Self {
            id: String::new(),
            kind: JobKind::default(),
            title: String::new(),
            instance_id: None,
            status: JobStatus::default(),
            message: "В очереди".into(),
            current: 0,
            total: 0,
            percent: 0.0,
            error: None,
            retry: None,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }
}

/// Описание новой задачи. Собирается командой до постановки в очередь.
#[derive(Debug, Clone)]
pub struct JobSpec {
    pub kind: JobKind,
    pub title: String,
    pub instance_id: Option<String>,
    pub retry: Option<JobRetry>,
}

impl JobSpec {
    pub fn new(kind: JobKind, title: impl Into<String>) -> Self {
        Self {
            kind,
            title: title.into(),
            instance_id: None,
            retry: None,
        }
    }

    pub fn instance(mut self, instance_id: impl Into<String>) -> Self {
        self.instance_id = Some(instance_id.into());
        self
    }

    pub fn retry(mut self, retry: JobRetry) -> Self {
        self.retry = Some(retry);
        self
    }
}

const STATE_RUNNING: u8 = 0;
const STATE_PAUSED: u8 = 1;
const STATE_CANCELED: u8 = 2;

/// Сигналы управления одной задачей. Проверяются в контрольных точках
/// внутри загрузок, поэтому пауза и отмена срабатывают без разрыва файлов.
pub struct JobControl {
    state: AtomicU8,
    started: AtomicBool,
    notify: tokio::sync::Notify,
}

impl JobControl {
    fn new() -> Self {
        Self {
            state: AtomicU8::new(STATE_RUNNING),
            started: AtomicBool::new(false),
            notify: tokio::sync::Notify::new(),
        }
    }

    fn pause(&self) {
        if !self.is_canceled() {
            self.state.store(STATE_PAUSED, Ordering::Release);
        }
    }

    fn resume(&self) {
        if !self.is_canceled() {
            self.state.store(STATE_RUNNING, Ordering::Release);
        }
        self.notify.notify_waiters();
    }

    fn cancel(&self) {
        self.state.store(STATE_CANCELED, Ordering::Release);
        self.notify.notify_waiters();
    }

    fn is_paused(&self) -> bool {
        self.state.load(Ordering::Acquire) == STATE_PAUSED
    }

    fn is_canceled(&self) -> bool {
        self.state.load(Ordering::Acquire) == STATE_CANCELED
    }

    fn mark_started(&self) {
        self.started.store(true, Ordering::Release);
    }

    fn is_started(&self) -> bool {
        self.started.load(Ordering::Acquire)
    }

    /// Ждёт снятия паузы. Возвращается сразу после отмены, чтобы вызывающий
    /// код успел превратить её в ошибку.
    async fn wait_resumed(&self) {
        loop {
            if !self.is_paused() || self.is_canceled() {
                return;
            }
            self.notify.notified().await;
        }
    }
}

/// Контекст текущей задачи. Живёт в task-local, поэтому его видят все
/// вложенные загрузки и установки, не протаскивая параметр через каждую функцию.
#[derive(Clone)]
pub struct JobContext {
    id: String,
    control: Arc<JobControl>,
    registry: JobsRegistry,
    app: AppHandle,
}

tokio::task_local! {
    static CURRENT_JOB: JobContext;
}

struct RegistryState {
    records: HashMap<String, JobRecord>,
    order: Vec<String>,
    controls: HashMap<String, Arc<JobControl>>,
    instance_locks: HashMap<String, Arc<tokio::sync::Mutex<()>>>,
    store_path: Option<PathBuf>,
    loaded: bool,
}

struct RegistryInner {
    state: Mutex<RegistryState>,
    semaphore: Arc<Semaphore>,
}

/// Очередь задач установки. Клонируется дёшево: внутри `Arc`.
#[derive(Clone)]
pub struct JobsRegistry {
    inner: Arc<RegistryInner>,
}

impl JobsRegistry {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RegistryInner {
                state: Mutex::new(RegistryState {
                    records: HashMap::new(),
                    order: Vec::new(),
                    controls: HashMap::new(),
                    instance_locks: HashMap::new(),
                    store_path: None,
                    loaded: false,
                }),
                semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT_JOBS)),
            }),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, RegistryState> {
        self.inner
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Поднимает историю с диска и помечает задачи, оборванные перезапуском.
    /// Вызывается один раз при старте и лениво из команд на случай, если
    /// настройки загрузились позже.
    pub async fn ensure_loaded(&self, data_dir: &Path) {
        {
            let state = self.lock();
            if state.loaded {
                return;
            }
        }

        let path = AppPaths::jobs_file(data_dir);
        let persisted = match tokio::fs::read(&path).await {
            Ok(bytes) if !bytes.is_empty() => serde_json::from_slice::<Vec<JobRecord>>(&bytes).ok(),
            _ => None,
        };

        let snapshot = {
            let mut state = self.lock();
            if state.loaded {
                return;
            }
            state.loaded = true;
            state.store_path = Some(path.clone());

            for mut record in persisted.unwrap_or_default() {
                if record.id.is_empty() {
                    continue;
                }
                if !record.status.is_terminal() {
                    record.status = JobStatus::Failed;
                    record.error = Some("Задача прервана перезапуском лаунчера".into());
                    record.message = "Прервано".into();
                    record.updated_at = now();
                }
                if !state.records.contains_key(&record.id) {
                    state.order.push(record.id.clone());
                    state.records.insert(record.id.clone(), record);
                }
            }

            trim_history(&mut state);
            state.snapshot()
        };

        write_snapshot(&path, &snapshot);
    }

    /// Текущий список задач: новые сверху.
    pub fn list(&self) -> Vec<JobRecord> {
        let state = self.lock();
        state
            .order
            .iter()
            .rev()
            .filter_map(|id| state.records.get(id).cloned())
            .collect()
    }

    /// Ставит задачу в очередь и возвращает её идентификатор и управление.
    fn register(&self, app: &AppHandle, spec: JobSpec) -> (String, Arc<JobControl>) {
        let control = Arc::new(JobControl::new());
        let id = uuid::Uuid::new_v4().to_string();
        let timestamp = now();

        let record = JobRecord {
            id: id.clone(),
            kind: spec.kind,
            title: spec.title,
            instance_id: spec.instance_id,
            status: JobStatus::Queued,
            message: "В очереди".into(),
            current: 0,
            total: 0,
            percent: 0.0,
            error: None,
            retry: spec.retry,
            created_at: timestamp.clone(),
            updated_at: timestamp,
        };

        let (emit_record, snapshot, path) = {
            let mut state = self.lock();
            trim_history(&mut state);
            state.order.push(id.clone());
            state.records.insert(id.clone(), record.clone());
            state.controls.insert(id.clone(), control.clone());
            (
                record,
                state.snapshot(),
                state.store_path.clone(),
            )
        };

        if let Some(path) = path {
            write_snapshot(&path, &snapshot);
        }
        let _ = app.emit(JOBS_EVENT, emit_record);
        (id, control)
    }

    /// Выполняет работу как задачу очереди. Пока задача ждёт свободный слот
    /// или паузу, её команда остаётся в ожидании — интерфейс видит статус.
    pub async fn run<T, F, Fut>(
        &self,
        app: &AppHandle,
        data_dir: &Path,
        spec: JobSpec,
        work: F,
    ) -> AppResult<T>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = AppResult<T>>,
    {
        self.ensure_loaded(data_dir).await;
        let (id, control) = self.register(app, spec.clone());

        let permit: OwnedSemaphorePermit = match self.inner.semaphore.clone().acquire_owned().await {
            Ok(permit) => permit,
            Err(_) => {
                self.finish(app, &id, JobStatus::Canceled, None);
                return Err(AppError::Canceled);
            }
        };

        if control.is_canceled() {
            self.finish(app, &id, JobStatus::Canceled, None);
            drop(permit);
            return Err(AppError::Canceled);
        }

        // Задачи на одну сборку идут строго по очереди: два одновременных
        // импорта в одну папку оставили бы смешанные файлы и битые метаданные.
        let _instance_guard: Option<OwnedMutexGuard<()>> = match spec.instance_id.as_deref() {
            Some(instance_id) => {
                let lock = {
                    let mut state = self.lock();
                    state
                        .instance_locks
                        .entry(instance_id.to_string())
                        .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
                        .clone()
                };
                Some(lock.lock_owned().await)
            }
            None => None,
        };

        if control.is_canceled() {
            self.finish(app, &id, JobStatus::Canceled, None);
            drop(permit);
            return Err(AppError::Canceled);
        }

        control.mark_started();
        self.transition(app, &id, |record| {
            record.status = JobStatus::Running;
            record.message = "Выполняется".into();
        });

        let context = JobContext {
            id: id.clone(),
            control: control.clone(),
            registry: self.clone(),
            app: app.clone(),
        };

        let outcome = CURRENT_JOB
            .scope(context, async move {
                checkpoint().await?;
                work().await
            })
            .await;

        match outcome {
            Ok(value) => {
                self.finish(app, &id, JobStatus::Succeeded, None);
                Ok(value)
            }
            Err(AppError::Canceled) => {
                self.finish(app, &id, JobStatus::Canceled, None);
                Err(AppError::Canceled)
            }
            Err(err) => {
                let message = err.to_string();
                self.finish(app, &id, JobStatus::Failed, Some(message));
                Err(err)
            }
        }
    }

    fn transition(&self, app: &AppHandle, id: &str, change: impl FnOnce(&mut JobRecord)) {
        let (record, snapshot, path) = {
            let mut state = self.lock();
            let Some(record) = state.records.get_mut(id) else {
                return;
            };
            change(record);
            record.updated_at = now();
            (
                record.clone(),
                state.snapshot(),
                state.store_path.clone(),
            )
        };

        if let Some(path) = path {
            write_snapshot(&path, &snapshot);
        }
        let _ = app.emit(JOBS_EVENT, record);
    }

    /// Обновление прогресса: пишется только в память и уходит в интерфейс.
    /// Состояния и история при этом на диск не попадают — их пишут переходы.
    fn set_progress(&self, app: &AppHandle, id: &str, percent: f64, message: String) {
        let record = {
            let mut state = self.lock();
            let Some(record) = state.records.get_mut(id) else {
                return;
            };
            record.percent = percent.clamp(0.0, 100.0);
            record.message = message;
            record.updated_at = now();
            record.clone()
        };
        let _ = app.emit(JOBS_EVENT, record);
    }

    fn finish(
        &self,
        app: &AppHandle,
        id: &str,
        status: JobStatus,
        error: Option<String>,
    ) {
        self.transition(app, id, |record| {
            record.status = status;
            record.error = error;
            record.message = match status {
                JobStatus::Succeeded => "Готово".into(),
                JobStatus::Failed => "Ошибка".into(),
                JobStatus::Canceled => "Отменено".into(),
                _ => record.message.clone(),
            };
            if status == JobStatus::Succeeded {
                record.percent = 100.0;
                record.current = record.total.max(record.current);
            }
        });

        let mut state = self.lock();
        state.controls.remove(id);
    }

    pub fn pause(&self, app: &AppHandle, id: &str) -> AppResult<()> {
        let control = {
            let state = self.lock();
            let record = state
                .records
                .get(id)
                .ok_or_else(|| AppError::NotFound("Задача не найдена".into()))?;
            if record.status.is_terminal() {
                return Err(AppError::Validation("Задача уже завершена".into()));
            }
            state.controls.get(id).cloned()
        };

        if let Some(control) = control {
            control.pause();
        }
        self.transition(app, id, |record| {
            record.status = JobStatus::Paused;
            record.message = "На паузе".into();
        });
        Ok(())
    }

    pub fn resume(&self, app: &AppHandle, id: &str) -> AppResult<()> {
        let control = {
            let state = self.lock();
            let record = state
                .records
                .get(id)
                .ok_or_else(|| AppError::NotFound("Задача не найдена".into()))?;
            if record.status.is_terminal() {
                return Err(AppError::Validation("Задача уже завершена".into()));
            }
            state.controls.get(id).cloned()
        };

        let started = control.as_ref().map(|c| c.is_started()).unwrap_or(false);
        if let Some(control) = control {
            control.resume();
        }
        self.transition(app, id, |record| {
            record.status = if started {
                JobStatus::Running
            } else {
                JobStatus::Queued
            };
            record.message = if started {
                "Продолжение…".into()
            } else {
                "В очереди".into()
            };
        });
        Ok(())
    }

    pub fn cancel(&self, app: &AppHandle, id: &str) -> AppResult<()> {
        let control = {
            let state = self.lock();
            let record = state
                .records
                .get(id)
                .ok_or_else(|| AppError::NotFound("Задача не найдена".into()))?;
            if record.status.is_terminal() {
                return Ok(());
            }
            state.controls.get(id).cloned()
        };

        let started = control.as_ref().map(|c| c.is_started()).unwrap_or(false);
        if let Some(control) = control {
            control.cancel();
        }

        if started {
            self.transition(app, id, |record| {
                record.status = JobStatus::Canceling;
                record.message = "Отмена…".into();
            });
        } else {
            self.finish(app, id, JobStatus::Canceled, None);
        }
        Ok(())
    }

    /// Убирает завершённую задачу из истории.
    pub fn dismiss(&self, id: &str) -> AppResult<()> {
        let (snapshot, path) = {
            let mut state = self.lock();
            let Some(record) = state.records.get(id) else {
                return Ok(());
            };
            if !record.status.is_terminal() {
                return Err(AppError::Validation(
                    "Сначала остановите задачу".into(),
                ));
            }
            state.records.remove(id);
            state.controls.remove(id);
            state.order.retain(|item| item != id);
            (state.snapshot(), state.store_path.clone())
        };

        if let Some(path) = path {
            write_snapshot(&path, &snapshot);
        }
        Ok(())
    }
}

impl RegistryState {
    fn snapshot(&self) -> Vec<JobRecord> {
        self.order
            .iter()
            .filter_map(|id| self.records.get(id).cloned())
            .collect()
    }
}

fn trim_history(state: &mut RegistryState) {
    while state.order.len() >= MAX_HISTORY {
        let Some(position) = state.order.iter().position(|id| {
            state
                .records
                .get(id)
                .map(|record| record.status.is_terminal())
                .unwrap_or(false)
        }) else {
            break;
        };
        let id = state.order.remove(position);
        state.records.remove(&id);
        state.controls.remove(&id);
    }
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Запись очереди на диск. Файл небольшой, переходы редкие, поэтому проще
/// сделать это синхронно, чем держать отдельный писатель и гонки версий.
fn write_snapshot(path: &Path, records: &[JobRecord]) {
    let Ok(json) = serde_json::to_vec_pretty(records) else {
        return;
    };
    if let Some(parent) = path.parent() {
        if std::fs::create_dir_all(parent).is_err() {
            return;
        }
    }

    let tmp = path.with_extension("json.tmp");
    if std::fs::write(&tmp, &json).is_err() {
        return;
    }

    // Прежняя версия становится резервной: оборванная запись не должна
    // оставлять пустую очередь.
    let backup = path.with_extension("json.bak");
    if path.exists() {
        let _ = std::fs::remove_file(&backup);
        let _ = std::fs::rename(path, &backup);
    }
    let _ = std::fs::rename(&tmp, path);
}

/// Контрольная точка внутри длинных операций. Без активной задачи ничего
/// не делает, поэтому подходит для общих сервисов загрузки.
pub async fn checkpoint() -> AppResult<()> {
    let Ok(context) = CURRENT_JOB.try_with(|context| context.clone()) else {
        return Ok(());
    };
    context.checkpoint().await
}

impl JobContext {
    async fn checkpoint(&self) -> AppResult<()> {
        loop {
            if self.control.is_canceled() {
                return Err(AppError::Canceled);
            }
            if !self.control.is_paused() {
                return Ok(());
            }

            self.registry.transition(&self.app, &self.id, |record| {
                if record.status != JobStatus::Paused {
                    record.status = JobStatus::Paused;
                    record.message = "На паузе".into();
                }
            });
            self.control.wait_resumed().await;
        }
    }
}

/// Сообщает прогресс текущей задаче. Вызывается из сервисов, которые не
/// знают о задачах напрямую; вне задачи просто ничего не происходит.
pub fn progress(percent: f64, message: impl Into<String>) {
    let Ok(context) = CURRENT_JOB.try_with(|context| context.clone()) else {
        return;
    };
    context
        .registry
        .set_progress(&context.app, &context.id, percent, message.into());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_statuses_are_final() {
        assert!(JobStatus::Succeeded.is_terminal());
        assert!(JobStatus::Failed.is_terminal());
        assert!(JobStatus::Canceled.is_terminal());
        assert!(!JobStatus::Queued.is_terminal());
        assert!(!JobStatus::Running.is_terminal());
        assert!(!JobStatus::Paused.is_terminal());
        assert!(!JobStatus::Canceling.is_terminal());
    }

    #[test]
    fn history_keeps_only_terminal_records() {
        let mut state = RegistryState {
            records: HashMap::new(),
            order: Vec::new(),
            controls: HashMap::new(),
            instance_locks: HashMap::new(),
            store_path: None,
            loaded: true,
        };

        for index in 0..MAX_HISTORY {
            let id = format!("job-{index}");
            state.order.push(id.clone());
            state.records.insert(
                id.clone(),
                JobRecord {
                    id,
                    status: if index == 0 {
                        JobStatus::Running
                    } else {
                        JobStatus::Succeeded
                    },
                    ..JobRecord::default()
                },
            );
        }

        let active_id = state.order[0].clone();
        trim_history(&mut state);
        assert!(state.records.contains_key(&active_id));
        assert!(state.records.len() < MAX_HISTORY);
    }
}
