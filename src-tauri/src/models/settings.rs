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

/// Канал обновлений контента. Определяет, какие версии модов считаются
/// доступными: стабильный канал игнорирует бета- и альфа-сборки.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReleaseChannel {
    Stable,
    Beta,
    Alpha,
}

impl Default for ReleaseChannel {
    fn default() -> Self {
        ReleaseChannel::Stable
    }
}

impl ReleaseChannel {
    /// Разрешает ли канал версию с указанным типом Modrinth
    /// (`release`, `beta`, `alpha`).
    pub fn allows(self, version_type: &str) -> bool {
        match self {
            ReleaseChannel::Stable => version_type == "release",
            ReleaseChannel::Beta => version_type == "release" || version_type == "beta",
            ReleaseChannel::Alpha => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::ReleaseChannel;

    #[test]
    fn stable_channel_hides_prereleases() {
        assert!(ReleaseChannel::Stable.allows("release"));
        assert!(!ReleaseChannel::Stable.allows("beta"));
        assert!(!ReleaseChannel::Stable.allows("alpha"));
    }

    #[test]
    fn beta_channel_allows_beta_but_not_alpha() {
        assert!(ReleaseChannel::Beta.allows("release"));
        assert!(ReleaseChannel::Beta.allows("beta"));
        assert!(!ReleaseChannel::Beta.allows("alpha"));
    }

    #[test]
    fn alpha_channel_allows_everything() {
        for version_type in ["release", "beta", "alpha"] {
            assert!(ReleaseChannel::Alpha.allows(version_type));
        }
    }
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
    /// Канал обновлений модов и модпаков.
    pub release_channel: ReleaseChannel,
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
            release_channel: ReleaseChannel::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub total_memory_mb: u64,
    pub available_memory_mb: u64,
    /// Рекомендуемый лимит памяти для сборок.
    pub recommended_memory_mb: u64,
    pub cpu_cores: usize,
    pub os_name: String,
    pub arch: String,
    pub default_data_dir: String,
}
