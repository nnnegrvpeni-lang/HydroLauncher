use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchProgressEvent {
    pub instance_id: String,
    pub stage: String,
    pub message: String,
    pub current: u64,
    pub total: u64,
    pub percent: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameLogEvent {
    pub instance_id: String,
    pub stream: String,
    pub line: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStateEvent {
    pub instance_id: String,
    pub state: String,
    pub exit_code: Option<i32>,
}
