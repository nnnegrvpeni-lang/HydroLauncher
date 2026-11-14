use tokio::sync::Mutex;

/// Глобальное состояние приложения, управляемое Tauri.
pub struct AppState {
    /// Кэш настроек: None означает «ещё не загружены с диска».
    pub settings: Mutex<Option<crate::models::settings::AppSettings>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            settings: Mutex::new(None),
        }
    }
}
