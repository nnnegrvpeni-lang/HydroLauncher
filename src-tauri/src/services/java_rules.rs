//! Утилиты для вычисления действующих правил библиотек и аргументов
//! на основании текущей ОС и архитектуры.

use crate::models::mojang::{Library, LibraryRule, OsRule};

pub fn normalized_os() -> &'static str {
    match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "osx",
        "linux" => "linux",
        other => other,
    }
}

pub fn normalized_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => other,
    }
}

pub fn rule_matches_os(os_rule: &OsRule) -> bool {
    if let Some(name) = &os_rule.name {
        if !name.eq_ignore_ascii_case(normalized_os()) {
            return false;
        }
    }
    if let Some(arch) = &os_rule.arch {
        if !arch.eq_ignore_ascii_case(normalized_arch()) {
            return false;
        }
    }
    if let Some(version) = &os_rule.version {
        if !os_version_matches(version) {
            return false;
        }
    }
    true
}

/// Проверяет шаблон `os.version` из манифеста (регулярное выражение Mojang)
/// по строкам версии системы. Неизвестный шаблон считается совпавшим: раньше
/// поле `version` игнорировалось целиком, и отсекать библиотеку из-за него хуже,
/// чем сохранить прежнее поведение.
fn os_version_matches(pattern: &str) -> bool {
    let versions: Vec<String> = [
        sysinfo::System::os_version(),
        sysinfo::System::long_os_version(),
    ]
    .into_iter()
    .flatten()
    .collect();

    if versions.is_empty() {
        return true;
    }
    versions
        .iter()
        .any(|version| version_matches(pattern, version))
}

fn version_matches(pattern: &str, version: &str) -> bool {
    regex::Regex::new(pattern)
        .map(|regex| regex.is_match(version))
        .unwrap_or(true)
}

/// Вычисляет, действует ли правило для текущей системы.
/// Опциональные feature-флаги (demo, custom_resolution, quick_play) в текущем запуске выключены.
pub fn rule_allows(rule: &LibraryRule) -> bool {
    if let Some(features) = &rule.features {
        if features.values().any(|&expected| expected) {
            return false;
        }
    }

    match &rule.os {
        Some(os_rule) => rule_matches_os(os_rule),
        None => true,
    }
}

/// Итоговое решение: разрешено ли использование библиотеки.
/// Семантика Mojang: по умолчанию запрещено, если есть хоть одно разрешающее правило.
pub fn library_allows(lib: &Library) -> bool {
    match &lib.rules {
        None => true,
        Some(rules) if rules.is_empty() => true,
        Some(rules) => rules
            .iter()
            .filter(|r| r.action == "allow")
            .any(rule_allows)
            && !rules
                .iter()
                .filter(|r| r.action == "disallow")
                .any(rule_allows),
    }
}

pub fn native_classifier() -> &'static str {
    match (normalized_os(), normalized_arch()) {
        ("windows", "arm64") => "natives-windows-arm64",
        ("osx", "arm64") => "natives-macos-arm64",
        ("linux", "arm64") => "natives-linux-arm64",
        ("windows", _) => "natives-windows",
        ("osx", _) => "natives-osx",
        _ => "natives-linux",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn rejects_enabled_feature_rules_such_as_quick_play_and_demo() {
        let mut features = HashMap::new();
        features.insert("is_quick_play_singleplayer".to_string(), true);

        let rule = LibraryRule {
            action: "allow".to_string(),
            os: None,
            features: Some(features),
        };

        assert!(!rule_allows(&rule));
    }

    #[test]
    fn allows_plain_os_or_unconditional_rules() {
        let rule = LibraryRule {
            action: "allow".to_string(),
            os: None,
            features: None,
        };
        assert!(rule_allows(&rule));
    }

    #[test]
    fn os_version_rules_follow_manifest_patterns() {
        // Основные шаблоны Mojang: Windows 10+ и старые macOS.
        assert!(version_matches("^10\\.", "10.0.22631"));
        assert!(!version_matches("^10\\.", "11.0.1"));
        assert!(version_matches("^14\\.", "14.5.0"));
        assert!(!version_matches("^14\\.", "15.0"));
        // Неизвестный шаблон не отсекает библиотеку.
        assert!(version_matches("not a regex (", "10.0"));
    }
}
