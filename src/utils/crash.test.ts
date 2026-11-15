import { describe, expect, it } from 'vitest';
import type { GameLog, Instance } from '../api';
import { formatCrashReport } from './crash';

const instance: Instance = {
  id: 'inst-1',
  name: 'Survival',
  minecraftVersion: '1.21.4',
  engine: 'java',
  loader: 'fabric',
  loaderVersion: '0.16.9',
  autoUpdateHorizon: true,
  memoryMbOverride: null,
  javaPathOverride: null,
  jvmArgs: [],
  gameArgs: [],
  createdAt: '2026-11-01T00:00:00.000Z',
  lastPlayedAt: null,
  playTimeSeconds: 0,
};

const crash = { instanceId: 'inst-1', exitCode: -1073741819, at: Date.parse('2026-11-15T12:00:00.000Z') };

function log(line: string): GameLog {
  return {
    instanceId: 'inst-1',
    stream: 'stderr',
    line,
    timestamp: '2026-11-15T11:59:59.000Z',
  };
}

describe('formatCrashReport', () => {
  it('includes the instance, exit code and log tail', () => {
    const report = formatCrashReport(instance, crash, [log('Exception in server tick loop')]);

    expect(report).toContain('Сборка: Survival');
    expect(report).toContain('Minecraft 1.21.4');
    expect(report).toContain('fabric 0.16.9');
    expect(report).toContain('Код завершения: -1073741819');
    expect(report).toContain('Exception in server tick loop');
  });

  it('keeps only the last 200 log lines', () => {
    const logs = Array.from({ length: 260 }, (_, index) => log(`line ${index}`));
    const report = formatCrashReport(instance, crash, logs);

    expect(report).not.toContain('line 59\n');
    expect(report).toContain('line 60');
    expect(report).toContain('line 259');
  });

  it('handles a missing instance and empty log', () => {
    const report = formatCrashReport(undefined, { ...crash, exitCode: null }, []);

    expect(report).toContain('Сборка: inst-1');
    expect(report).toContain('нет данных (процесс прерван)');
    expect(report).toContain('(лог пуст)');
  });
});
