use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EngineKind {
    Java,
    Horizon,
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

fn default_true() -> bool {
    true
}

pub(crate) fn default_icon() -> String {
    String::new()
}

pub(crate) fn default_background() -> String {
    String::new()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
