use crate::config::endpoints::{APP_NAME, APP_ORGANIZATION, APP_QUALIFIER};
use crate::error::{AppError, AppResult};
use directories::ProjectDirs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct AppPaths {
    config_dir: PathBuf,
    default_data_dir: PathBuf,
}

impl AppPaths {
    pub fn discover() -> AppResult<Self> {
        let proj_dirs =
            ProjectDirs::from(APP_QUALIFIER, APP_ORGANIZATION, APP_NAME).ok_or_else(|| {
                AppError::Custom("Не удалось определить системную директорию приложения".into())
            })?;

        let config_dir = proj_dirs.config_dir().to_path_buf();
        let default_data_dir = proj_dirs.data_dir().to_path_buf();

        std::fs::create_dir_all(&config_dir)?;
        std::fs::create_dir_all(&default_data_dir)?;

        Ok(Self {
            config_dir,
            default_data_dir,
        })
    }

    pub fn config_file(&self) -> PathBuf {
        self.config_dir.join("settings.json")
    }

    pub fn default_data_dir(&self) -> &Path {
        &self.default_data_dir
    }

    pub fn accounts_file(&self, data_dir: &Path) -> PathBuf {
        data_dir.join("accounts.json")
    }

    pub fn instances_file(&self, data_dir: &Path) -> PathBuf {
        data_dir.join("instances.json")
    }

    /// Очередь и история задач установки.
    pub fn jobs_file(data_dir: &Path) -> PathBuf {
        data_dir.join("jobs.json")
    }

    pub fn version_manifest_cache(&self, data_dir: &Path) -> PathBuf {
        data_dir.join("cache").join("version_manifest_v2.json")
    }

    pub fn assets_dir(&self, data_dir: &Path) -> PathBuf {
        data_dir.join("assets")
    }

    pub fn libraries_dir(&self, data_dir: &Path) -> PathBuf {
        data_dir.join("libraries")
    }

    pub fn versions_dir(&self, data_dir: &Path) -> PathBuf {
        data_dir.join("versions")
    }

    pub fn runtimes_dir(&self, data_dir: &Path) -> PathBuf {
        data_dir.join("runtimes")
    }

    pub fn instances_dir(&self, data_dir: &Path) -> PathBuf {
        data_dir.join("instances")
    }

    pub fn instance_dir(&self, data_dir: &Path, instance_id: &str) -> PathBuf {
        self.instances_dir(data_dir).join(instance_id)
    }

    pub fn instance_game_dir(&self, data_dir: &Path, instance_id: &str) -> PathBuf {
        self.instance_dir(data_dir, instance_id).join("game")
    }

    pub fn instance_mods_dir(&self, data_dir: &Path, instance_id: &str) -> PathBuf {
        self.instance_game_dir(data_dir, instance_id).join("mods")
    }

    pub fn instance_horizon_mods_dir(&self, data_dir: &Path, instance_id: &str) -> PathBuf {
        self.instance_game_dir(data_dir, instance_id)
            .join("horizon-mods")
    }

    pub fn instance_horizon_native_mods_dir(&self, data_dir: &Path, instance_id: &str) -> PathBuf {
        self.instance_game_dir(data_dir, instance_id)
            .join("horizon-native-mods")
    }

    pub fn instance_shaderpacks_dir(&self, data_dir: &Path, instance_id: &str) -> PathBuf {
        self.instance_game_dir(data_dir, instance_id)
            .join("shaderpacks")
    }

    pub fn instance_resourcepacks_dir(&self, data_dir: &Path, instance_id: &str) -> PathBuf {
        self.instance_game_dir(data_dir, instance_id)
            .join("resourcepacks")
    }

    pub fn horizon_dir(&self, data_dir: &Path) -> PathBuf {
        self.runtimes_dir(data_dir).join("horizon")
    }

    pub fn horizon_bin_dir(&self, data_dir: &Path) -> PathBuf {
        self.horizon_dir(data_dir).join("bin")
    }

    /// Бинарники конкретного релиза Horizon: `runtimes/horizon/bin/<tag>`.
    /// Так разные сборки могут держать разные версии движка одновременно.
    pub fn horizon_bin_tag_dir(&self, data_dir: &Path, tag: &str) -> PathBuf {
        self.horizon_bin_dir(data_dir).join(sanitize_tag(tag))
    }

    pub fn horizon_meta_dir(&self, data_dir: &Path) -> PathBuf {
        self.horizon_dir(data_dir).join("meta")
    }

    pub fn horizon_meta_file(&self, data_dir: &Path, tag: &str) -> PathBuf {
        self.horizon_meta_dir(data_dir)
            .join(format!("{}.json", sanitize_tag(tag)))
    }

    pub fn horizon_prepared_dir(&self, data_dir: &Path, mc_version: &str, tag: &str) -> PathBuf {
        self.horizon_dir(data_dir)
            .join("prepared")
            .join(mc_version)
            .join(sanitize_tag(tag))
    }

    pub fn horizon_mods_cache_file(&self, data_dir: &Path) -> PathBuf {
        data_dir.join("cache").join("horizon-mods-index.json")
    }

    pub fn version_dir(&self, data_dir: &Path, version_id: &str) -> PathBuf {
        self.versions_dir(data_dir).join(version_id)
    }

    pub fn natives_dir(&self, data_dir: &Path, version_id: &str) -> PathBuf {
        self.version_dir(data_dir, version_id).join("natives")
    }
}

/// Приводит тег релиза Horizon к безопасному имени папки/файла.
pub fn sanitize_tag(tag: &str) -> String {
    let cleaned: String = tag
        .trim()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() || cleaned == "." || cleaned == ".." {
        "nightly".to_string()
    } else {
        cleaned
    }
}
