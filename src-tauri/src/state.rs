use crate::models::settings::AppSettings;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::Mutex;

/// Глобальное состояние приложения, управляемое Tauri.
pub struct AppState {
    /// Кэш настроек: None означает «ещё не загружены с диска».
    pub settings: Mutex<Option<AppSettings>>,
    /// Флаги окна продублированы атомиками: обработчик закрытия окна
    /// синхронный и не может ждать асинхронный мьютекс.
    close_to_tray: AtomicBool,
    close_on_launch: AtomicBool,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            settings: Mutex::new(None),
            close_to_tray: AtomicBool::new(false),
            close_on_launch: AtomicBool::new(false),
        }
    }

    /// Обновляет флаги окна после загрузки или сохранения настроек.
    pub fn apply_window_prefs(&self, settings: &AppSettings) {
        self.close_to_tray
            .store(settings.close_to_tray, Ordering::Relaxed);
        self.close_on_launch
            .store(settings.close_on_launch, Ordering::Relaxed);
    }

    pub fn close_to_tray(&self) -> bool {
        self.close_to_tray.load(Ordering::Relaxed)
    }

    pub fn close_on_launch(&self) -> bool {
        self.close_on_launch.load(Ordering::Relaxed)
    }
}
