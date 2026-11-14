use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaRuntime {
    pub path: String,
    pub version: String,
    pub major_version: u32,
    pub vendor: String,
    pub arch: String,
    pub is_managed: bool,
}
