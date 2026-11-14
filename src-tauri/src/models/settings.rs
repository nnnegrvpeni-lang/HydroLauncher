use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ThemeMode {
    System,
    Dark,
    Night,
    Light,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: ThemeMode,
    pub data_dir: String,
    pub default_memory_mb: u64,
    pub max_concurrent_downloads: usize,
    pub close_on_launch: bool,
    pub show_snapshots: bool,
    #[serde(default = "default_true")]
    pub auto_update_horizon: bool,
    pub custom_java_paths: Vec<String>,
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
