use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ThemeMode {
    System,
    Dark,
    Night,
    Light,
}

impl Default for ThemeMode {
    fn default() -> Self {
        ThemeMode::Dark
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Ru,
    En,
}

fn default_language() -> Language {
    Language::Ru
}

fn default_backup_retention() -> usize {
    5
}

/// Новые поля получают значения по умолчанию: обновление лаунчера не должно
/// ломать уже сохранённые настройки.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub theme: ThemeMode,
    pub data_dir: String,
    pub default_memory_mb: u64,
    pub max_concurrent_downloads: usize,
    pub close_on_launch: bool,
    /// Сворачивать окно в трей при нажатии на крестик вместо выхода.
    pub close_to_tray: bool,
    pub language: Language,
    pub auto_backup_worlds: bool,
    pub backup_retention: usize,
    pub show_snapshots: bool,
    pub custom_java_paths: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: ThemeMode::default(),
            data_dir: String::new(),
            default_memory_mb: 0,
            max_concurrent_downloads: 0,
            close_on_launch: false,
            close_to_tray: false,
            language: default_language(),
            auto_backup_worlds: false,
            backup_retention: default_backup_retention(),
            show_snapshots: false,
            custom_java_paths: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub total_memory_mb: u64,
    pub available_memory_mb: u64,
    pub cpu_cores: usize,
    pub os_name: String,
    pub arch: String,
    pub default_data_dir: String,
}
