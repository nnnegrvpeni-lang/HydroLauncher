//! Запуск дочерних процессов без лишних окон консоли.
//!
//! `java.exe` — консольное приложение: без флага Windows открывает для него
//! отдельное чёрное окно поверх лаунчера. Логи всё равно читаются через
//! перенаправленные `stdout`/`stderr`, поэтому окно не нужно.

use tokio::process::Command;

/// `CREATE_NO_WINDOW` из Win32 API.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Скрывает окно консоли у дочернего процесса на Windows.
/// На остальных платформах ничего не меняет.
pub fn hide_console(command: &mut Command) -> &mut Command {
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}
