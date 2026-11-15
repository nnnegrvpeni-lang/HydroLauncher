import type { GameLog, Instance } from '../api';
import type { Language } from '../i18n/translate';

export interface CrashInfo {
  instanceId: string;
  exitCode: number | null;
  at: number;
}

/** Собирает текст отчёта об аварийном завершении для буфера обмена. */
export function formatCrashReport(
  instance: Instance | undefined,
  crash: CrashInfo,
  logs: GameLog[],
  language: Language = 'ru',
): string {
  const english = language === 'en';
  const header = [
    english
      ? 'HydroLauncher — game exit report'
      : 'HydroLauncher — отчёт о завершении игры',
    `${english ? 'Time' : 'Время'}: ${new Date(crash.at).toLocaleString(english ? 'en-US' : 'ru-RU')}`,
    `${english ? 'Instance' : 'Сборка'}: ${instance?.name ?? crash.instanceId}`,
  ];

  if (instance) {
    header.push(
      `${english ? 'Version' : 'Версия'}: Minecraft ${instance.minecraftVersion}`,
    );
    header.push(
      `${english ? 'Engine' : 'Движок'}: ${
        instance.engine === 'horizon'
          ? 'Horizon (Rust)'
          : `${instance.loader} ${instance.loaderVersion ?? ''}`.trim()
      }`,
    );
  }

  header.push(
    `${english ? 'Exit code' : 'Код завершения'}: ${
      crash.exitCode === null
        ? english
          ? 'no data (process interrupted)'
          : 'нет данных (процесс прерван)'
        : crash.exitCode
    }`,
  );

  const tail = logs.slice(-200).map((log) => log.line);

  return [
    ...header,
    '',
    english ? '--- Last log lines ---' : '--- Последние строки лога ---',
    ...(tail.length > 0 ? tail : [english ? '(log is empty)' : '(лог пуст)']),
  ].join('\n');
}
