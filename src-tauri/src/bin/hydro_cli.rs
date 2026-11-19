//! `hydro-cli` — headless-режим HydroLauncher.
//!
//! Работает с той же папкой данных и теми же сервисами, что и десктопное
//! приложение, но без окна и событий прогресса. Предназначен для скриптов и
//! проверки состояния лаунчера: список сборок, отчёт по хранилищу, импорт и
//! экспорт архивов.

use hydro_launcher_lib::error::{AppError, AppResult};
use hydro_launcher_lib::services::{
    drop_service, instance_archive_service, instance_service, modrinth_service, settings_service,
    storage_service,
};
use hydro_launcher_lib::storage::paths::AppPaths;
use serde::Serialize;
use std::path::PathBuf;

const USAGE: &str = "\
hydro-cli — headless-режим HydroLauncher

Использование:
  hydro-cli instances [--json]
  hydro-cli storage [--json]
  hydro-cli cleanup <cache|logs> [--json]
  hydro-cli inspect <путь>... [--json]
  hydro-cli import <путь> [--name ИМЯ] [--instance ID] [--json]
  hydro-cli export <ID или имя сборки> <файл.zip> [--json]

Общие флаги:
  --data-dir <путь>  папка данных вместо значения из настроек
  --json             машиночитаемый вывод
  -h, --help         эта справка

Импорт: сборки и модпаки создаются автоматически; мирам, ресурспакам и
модам нужна целевая сборка (--instance), иначе команда завершится ошибкой.";

#[derive(Debug, PartialEq)]
enum Command {
    Help,
    Instances,
    Storage,
    Cleanup(storage_service::CleanupKind),
    Inspect(Vec<PathBuf>),
    Import {
        path: PathBuf,
        name: Option<String>,
        instance: Option<String>,
    },
    Export {
        instance: String,
        out: PathBuf,
    },
}

#[derive(Debug, PartialEq)]
struct Parsed {
    json: bool,
    data_dir: Option<PathBuf>,
    command: Command,
}

fn parse_args(args: Vec<String>) -> Result<Parsed, String> {
    let mut json = false;
    let mut data_dir = None;
    let mut name = None;
    let mut instance = None;
    let mut positional: Vec<String> = Vec::new();

    let mut iter = args.into_iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--json" => json = true,
            "-h" | "--help" => {
                return Ok(Parsed {
                    json,
                    data_dir,
                    command: Command::Help,
                })
            }
            "--data-dir" => {
                let value = iter
                    .next()
                    .ok_or_else(|| "--data-dir требует путь".to_string())?;
                data_dir = Some(PathBuf::from(value));
            }
            "--name" => {
                name = Some(
                    iter.next()
                        .ok_or_else(|| "--name требует значение".to_string())?,
                );
            }
            "--instance" => {
                instance = Some(
                    iter.next()
                        .ok_or_else(|| "--instance требует ID сборки".to_string())?,
                );
            }
            other if other.starts_with("--") => return Err(format!("Неизвестный флаг: {other}")),
            other => positional.push(other.to_string()),
        }
    }

    let Some(command_name) = positional.first() else {
        return Ok(Parsed {
            json,
            data_dir,
            command: Command::Help,
        });
    };

    let rest = &positional[1..];
    let command = match command_name.as_str() {
        "instances" | "list" => Command::Instances,
        "storage" => Command::Storage,
        "cleanup" => {
            let kind = rest
                .first()
                .ok_or_else(|| "Укажите категорию очистки: cache или logs".to_string())?;
            Command::Cleanup(
                storage_service::CleanupKind::parse(kind).map_err(|err| err.to_string())?,
            )
        }
        "inspect" => {
            if rest.is_empty() {
                return Err("Укажите хотя бы один путь для inspect".into());
            }
            Command::Inspect(rest.iter().map(PathBuf::from).collect())
        }
        "import" => Command::Import {
            path: PathBuf::from(
                rest.first()
                    .ok_or_else(|| "Укажите путь к импортируемому объекту".to_string())?,
            ),
            name,
            instance,
        },
        "export" => Command::Export {
            instance: rest
                .first()
                .ok_or_else(|| "Укажите ID или имя сборки".to_string())?
                .clone(),
            out: PathBuf::from(
                rest.get(1)
                    .ok_or_else(|| "Укажите путь к zip-архиву".to_string())?,
            ),
        },
        other => return Err(format!("Неизвестная команда: {other}")),
    };

    Ok(Parsed {
        json,
        data_dir,
        command,
    })
}

/// Папка данных: явный `--data-dir` важнее настройки, а настройка — значения
/// по умолчанию. Правило совпадает с десктопным приложением.
async fn resolve_data_dir(paths: &AppPaths, override_dir: Option<PathBuf>) -> AppResult<PathBuf> {
    let dir = match override_dir {
        Some(dir) => dir,
        None => {
            let settings = settings_service::load_or_init_settings(paths).await?;
            PathBuf::from(settings.data_dir)
        }
    };
    tokio::fs::create_dir_all(&dir).await?;
    Ok(dir)
}

fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit + 1 < UNITS.len() {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} {}", UNITS[unit])
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

fn print_json<T: Serialize>(value: &T) -> AppResult<()> {
    println!("{}", serde_json::to_string_pretty(value)?);
    Ok(())
}

async fn find_instance(
    paths: &AppPaths,
    data_dir: &PathBuf,
    target: &str,
) -> AppResult<hydro_launcher_lib::models::instance::Instance> {
    instance_service::load_instances(paths, data_dir)
        .await?
        .into_iter()
        .find(|item| item.id == target || item.name == target)
        .ok_or_else(|| AppError::NotFound(format!("Сборка не найдена: {target}")))
}

async fn run(parsed: Parsed) -> AppResult<()> {
    if parsed.command == Command::Help {
        println!("{USAGE}");
        return Ok(());
    }

    let paths = AppPaths::discover()?;
    let data_dir = resolve_data_dir(&paths, parsed.data_dir.clone()).await?;

    match parsed.command {
        Command::Help => unreachable!("обработан выше"),
        Command::Instances => {
            let instances = instance_service::load_instances(&paths, &data_dir).await?;
            if parsed.json {
                print_json(&instances)?;
            } else if instances.is_empty() {
                println!("Сборок нет в {}", data_dir.display());
            } else {
                for instance in instances {
                    println!(
                        "{}\t{}\tMinecraft {}\t{:?}{}",
                        instance.id,
                        instance.name,
                        instance.minecraft_version,
                        instance.loader,
                        instance
                            .loader_version
                            .map(|version| format!(" {version}"))
                            .unwrap_or_default()
                    );
                }
            }
        }
        Command::Storage => {
            let report = storage_service::report(&paths, &data_dir).await?;
            if parsed.json {
                print_json(&report)?;
            } else {
                println!("Всего: {}", format_bytes(report.total_bytes));
                for category in &report.categories {
                    println!(
                        "  {:<12} {}",
                        category.id,
                        format_bytes(category.size_bytes)
                    );
                }
                if !report.instances.is_empty() {
                    println!("Сборки:");
                    for instance in &report.instances {
                        println!(
                            "  {:<24} {}",
                            instance.name,
                            format_bytes(instance.total_bytes)
                        );
                    }
                }
            }
        }
        Command::Cleanup(kind) => {
            let freed = storage_service::cleanup(&paths, &data_dir, kind).await?;
            if parsed.json {
                print_json(&serde_json::json!({ "freedBytes": freed }))?;
            } else {
                println!("Освобождено: {}", format_bytes(freed));
            }
        }
        Command::Inspect(targets) => {
            let items = drop_service::inspect(&targets);
            if parsed.json {
                print_json(&items)?;
            } else {
                for item in items {
                    let hint = item
                        .hint
                        .map(|hint| format!(" — {hint}"))
                        .unwrap_or_default();
                    println!(
                        "{}\t{:?}\t{}{}",
                        item.file_name,
                        item.kind,
                        format_bytes(item.size_bytes),
                        hint
                    );
                }
            }
        }
        Command::Import {
            path,
            name,
            instance,
        } => {
            let kind = drop_service::classify(&path);
            let imported = match kind.kind {
                drop_service::DropKind::Modpack => {
                    modrinth_service::import_mrpack_file(&paths, &data_dir, &path, name.as_deref())
                        .await?
                }
                drop_service::DropKind::Instance => {
                    if path.is_dir() {
                        instance_archive_service::import_instance_folder(&paths, &data_dir, &path)
                            .await?
                    } else {
                        instance_archive_service::import_instance(None, &paths, &data_dir, &path)
                            .await?
                    }
                }
                drop_service::DropKind::Prism => {
                    if !path.is_dir() {
                        return Err(AppError::Validation(
                            "Архив Prism нужно распаковать и импортировать как папку".into(),
                        ));
                    }
                    drop_service::import_folder(&paths, &data_dir, &path).await?
                }
                drop_service::DropKind::World => {
                    let target = instance.ok_or_else(|| {
                        AppError::Validation(
                            "Для мира укажите целевую сборку: --instance ID".into(),
                        )
                    })?;
                    let instance = find_instance(&paths, &data_dir, &target).await?;
                    let folder =
                        drop_service::import_world(&paths, &data_dir, &instance.id, &path, name)
                            .await?;
                    if parsed.json {
                        print_json(&serde_json::json!({
                            "kind": "world",
                            "instanceId": instance.id,
                            "name": folder,
                        }))?;
                    } else {
                        println!("Мир импортирован в «{}»: {folder}", instance.name);
                    }
                    return Ok(());
                }
                drop_service::DropKind::Resourcepack => {
                    let target = instance.ok_or_else(|| {
                        AppError::Validation(
                            "Для ресурспака укажите целевую сборку: --instance ID".into(),
                        )
                    })?;
                    let instance = find_instance(&paths, &data_dir, &target).await?;
                    let file =
                        drop_service::import_resourcepack(&paths, &data_dir, &instance.id, &path)
                            .await?;
                    if parsed.json {
                        print_json(&serde_json::json!({
                            "kind": "resourcepack",
                            "instanceId": instance.id,
                            "name": file,
                        }))?;
                    } else {
                        println!("Ресурспак импортирован в «{}»: {file}", instance.name);
                    }
                    return Ok(());
                }
                drop_service::DropKind::Mod => {
                    let target = instance.ok_or_else(|| {
                        AppError::Validation(
                            "Для мода укажите целевую сборку: --instance ID".into(),
                        )
                    })?;
                    let instance = find_instance(&paths, &data_dir, &target).await?;
                    let file =
                        drop_service::import_mod(&paths, &data_dir, &instance, &path).await?;
                    if parsed.json {
                        print_json(&serde_json::json!({
                            "kind": "mod",
                            "instanceId": instance.id,
                            "name": file,
                        }))?;
                    } else {
                        println!("Мод импортирован в «{}»: {file}", instance.name);
                    }
                    return Ok(());
                }
                drop_service::DropKind::Unknown => {
                    return Err(AppError::Validation(
                        kind.hint
                            .unwrap_or_else(|| "Тип объекта не распознан".into()),
                    ))
                }
            };

            if parsed.json {
                print_json(&imported)?;
            } else {
                println!("Импортирована сборка: {} ({})", imported.name, imported.id);
            }
        }
        Command::Export { instance, out } => {
            let instance = find_instance(&paths, &data_dir, &instance).await?;
            let exported =
                instance_archive_service::export_instance(None, &paths, &data_dir, &instance, &out)
                    .await?;
            if parsed.json {
                print_json(&exported)?;
            } else {
                println!(
                    "Сборка «{}» экспортирована: {} ({})",
                    instance.name,
                    exported.path,
                    format_bytes(exported.size_bytes)
                );
            }
        }
    }

    Ok(())
}

#[tokio::main]
async fn main() {
    let parsed = match parse_args(std::env::args().skip(1).collect()) {
        Ok(parsed) => parsed,
        Err(err) => {
            eprintln!("Ошибка: {err}\n\n{USAGE}");
            std::process::exit(2);
        }
    };

    if let Err(err) = run(parsed).await {
        eprintln!("Ошибка: {err}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(args: &[&str]) -> Result<Parsed, String> {
        parse_args(args.iter().map(|arg| arg.to_string()).collect())
    }

    #[test]
    fn no_arguments_shows_help() {
        assert_eq!(parse(&[]).unwrap().command, Command::Help);
    }

    #[test]
    fn parses_cleanup_kind() {
        assert_eq!(
            parse(&["cleanup", "cache"]).unwrap().command,
            Command::Cleanup(storage_service::CleanupKind::Cache)
        );
        assert!(parse(&["cleanup", "everything"]).is_err());
        assert!(parse(&["cleanup"]).is_err());
    }

    #[test]
    fn parses_global_flags_in_any_position() {
        let parsed = parse(&["--json", "storage", "--data-dir", "D:/data"]).unwrap();
        assert!(parsed.json);
        assert_eq!(parsed.data_dir, Some(PathBuf::from("D:/data")));
        assert_eq!(parsed.command, Command::Storage);
    }

    #[test]
    fn parses_import_targets() {
        let parsed = parse(&["import", "world.zip", "--instance", "abc", "--name", "Мир"]).unwrap();
        assert_eq!(
            parsed.command,
            Command::Import {
                path: PathBuf::from("world.zip"),
                name: Some("Мир".into()),
                instance: Some("abc".into()),
            }
        );
    }

    #[test]
    fn rejects_unknown_command_and_flags() {
        assert!(parse(&["launch"]).is_err());
        assert!(parse(&["--nope"]).is_err());
        assert!(parse(&["export", "only-id"]).is_err());
    }
}
