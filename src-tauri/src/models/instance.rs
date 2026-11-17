use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EngineKind {
    Java,
    Horizon,
}

impl Default for EngineKind {
    fn default() -> Self {
        EngineKind::Java
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ModLoaderKind {
    Vanilla,
    Fabric,
    Forge,
    #[serde(rename = "neoforge", alias = "neoForge")]
    NeoForge,
    Quilt,
}

impl Default for ModLoaderKind {
    fn default() -> Self {
        ModLoaderKind::Vanilla
    }
}

fn default_true() -> bool {
    true
}

pub(crate) fn default_icon() -> String {
    String::new()
}

pub(crate) fn default_background() -> String {
    String::new()
}

/// Версии попадают в имена папок, профилей и URL, поэтому принимаем только
/// безопасный набор символов. Иначе версия вида `../../evil` из импортированного
/// архива увела бы запись файлов за пределы каталога лаунчера.
pub fn sanitize_version_token(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 64 {
        return None;
    }
    if trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '+' | '-'))
    {
        Some(trimmed.to_string())
    } else {
        None
    }
}

/// `default` на уровне структуры: добавление нового поля не ломает уже
/// сохранённые сборки, отсутствующие значения берутся из `Default`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub minecraft_version: String,
    pub engine: EngineKind,
    pub loader: ModLoaderKind,
    pub loader_version: Option<String>,
    #[serde(default = "default_true")]
    pub auto_update_horizon: bool,
    pub memory_mb_override: Option<u64>,
    pub java_path_override: Option<String>,
    pub jvm_args: Vec<String>,
    pub game_args: Vec<String>,
    /// ID иллюстрации в `public/instance-icons` (например, `grass_block`).
    #[serde(default = "default_icon")]
    pub icon: String,
    /// ID градиентного фона (например, `purple`).
    #[serde(default = "default_background")]
    pub background: String,
    pub created_at: String,
    pub last_played_at: Option<String>,
    pub play_time_seconds: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstancesStore {
    pub instances: Vec<Instance>,
}

impl Default for Instance {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            minecraft_version: String::new(),
            engine: EngineKind::default(),
            loader: ModLoaderKind::default(),
            loader_version: None,
            auto_update_horizon: true,
            memory_mb_override: None,
            java_path_override: None,
            jvm_args: Vec::new(),
            game_args: Vec::new(),
            icon: default_icon(),
            background: default_background(),
            created_at: String::new(),
            last_played_at: None,
            play_time_seconds: 0,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInstanceRequest {
    pub name: String,
    pub minecraft_version: String,
    pub engine: EngineKind,
    pub loader: ModLoaderKind,
    #[serde(default)]
    pub loader_version: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub background: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInstanceRequest {
    pub id: String,
    pub name: String,
    pub memory_mb_override: Option<u64>,
    pub java_path_override: Option<String>,
    pub jvm_args: Vec<String>,
    #[serde(default)]
    pub loader_version: Option<String>,
    #[serde(default = "default_true")]
    pub auto_update_horizon: bool,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub background: Option<String>,
}
