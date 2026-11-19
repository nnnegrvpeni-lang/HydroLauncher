use serde::{Deserialize, Serialize};

/// Откуда берётся личность игрока. Офлайн-профили работают без сети,
/// Microsoft-аккаунты дают официальный UUID, скины и доступ к серверам.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AccountKind {
    #[default]
    Offline,
    Microsoft,
}

impl AccountKind {
    pub fn is_microsoft(self) -> bool {
        matches!(self, AccountKind::Microsoft)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineAccount {
    pub id: String,
    /// Старые accounts.json не содержали это поле — читаем их как офлайн.
    #[serde(default)]
    pub kind: AccountKind,
    pub username: String,
    pub uuid: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountsStore {
    pub active_account_id: Option<String>,
    pub accounts: Vec<OfflineAccount>,
}
