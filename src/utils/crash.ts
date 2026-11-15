import type { GameLog, Instance } from '../api';

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
): string {
  const header = [
    'HydroLauncher — отчёт о завершении игры',
    `Время: ${new Date(crash.at).toLocaleString('ru-RU')}`,
    `Сборка: ${instance?.name ?? crash.instanceId}`,
  ];

  if (instance) {
    header.push(`Версия: Minecraft ${instance.minecraftVersion}`);
    header.push(
      `Движок: ${
        instance.engine === 'horizon' ? 'Horizon (Rust)' : `${instance.loader} ${instance.loaderVersion ?? ''}`.trim()
      }`,
    );
  }

  header.push(
    `Код завершения: ${
      crash.exitCode === null ? 'нет данных (процесс прерван)' : crash.exitCode
    }`,
  );

  const tail = logs.slice(-200).map((log) => log.line);

  return [
    ...header,
    '',
    '--- Последние строки лога ---',
    ...(tail.length > 0 ? tail : ['(лог пуст)']),
  ].join('\n');
}
