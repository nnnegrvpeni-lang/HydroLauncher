//! Сервисный слой приложения.
//!
//! `*_service` — высокоуровневые операции над моделями и хранилищем.
//! Остальные модули — технические: правила Java, загрузчик, интеграция Mojang,
//! менеджер Java и запуск игры.

pub mod account_service;
pub mod downloader;
pub mod horizon_mods_service;
pub mod horizon_service;
pub mod instance_service;
pub mod java_rules;
pub mod java_service;
pub mod launcher_update_service;
pub mod launch_service;
pub mod loader_service;
pub mod modrinth_service;
pub mod mojang_service;
pub mod settings_service;
