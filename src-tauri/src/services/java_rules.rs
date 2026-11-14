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
    true
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
        Some(os_rule) if !os_rule.name.is_some() && !os_rule.arch.is_some() => true,
        Some(os_rule) => rule_matches_os(os_rule),
        None => true,
    }
}

/// Итоговое решение: разрешено ли использование библиотеки.
/// Семантика Mojang: по умолчанию запрещено, если есть хоть одно разрешающее правило.
pub fn library_allows(lib: &Library) -> bool {
    match &lib.rules {
        None => true,
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
    match normalized_os() {
        "windows" => "natives-windows",
        "osx" => "natives-macos",
        "linux" => "natives-linux",
        _ => "natives-windows",
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
}
