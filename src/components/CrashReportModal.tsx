import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, FolderOpen, RotateCcw } from 'lucide-react';
import { api, type GameLog } from '../api';
import { useI18n } from '../i18n';
import { useInstancesStore } from '../stores/instancesStore';
import { useLaunchStore } from '../stores/launchStore';
import { useNotifyStore } from '../stores/notifyStore';
import { formatCrashReport } from '../utils/crash';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

const EMPTY_LOGS: GameLog[] = [];

/** Окно с отчётом об аварийном завершении игры. */
export function CrashReportModal() {
  const crash = useLaunchStore((s) => s.lastCrash);
  const clearCrash = useLaunchStore((s) => s.clearCrash);
  const logs = useLaunchStore((s) =>
    s.lastCrash ? (s.logsByInstance[s.lastCrash.instanceId] ?? EMPTY_LOGS) : EMPTY_LOGS,
  );
  const instance = useInstancesStore((s) =>
    s.instances.find((item) => item.id === crash?.instanceId),
  );
  const notify = useNotifyStore((s) => s.push);
  const { t, language } = useI18n();
  const [copied, setCopied] = useState(false);
  const [fileTail, setFileTail] = useState<string[]>([]);

  useEffect(() => {
    if (!crash) {
      setFileTail([]);
      return;
    }
    let active = true;
    void api
      .readInstanceLog(crash.instanceId, 200)
      .then((lines) => {
        if (active) setFileTail(lines);
      })
      .catch(() => {
        if (active) setFileTail([]);
      });
    return () => {
      active = false;
    };
  }, [crash]);

  // Файл лога полнее памяти: в нём есть строки, которые уже вытеснены из UI.
  const reportLogs = useMemo<GameLog[]>(() => {
    if (fileTail.length === 0) return logs;
    return fileTail.map((line, index) => ({
      instanceId: crash?.instanceId ?? '',
      stream: 'file',
      line,
      timestamp: String(index),
    }));
  }, [fileTail, logs, crash?.instanceId]);

  const report = useMemo(
    () => (crash ? formatCrashReport(instance, crash, reportLogs, language) : ''),
    [crash, instance, reportLogs, language],
  );

  if (!crash) return null;

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      notify(t('Отчёт скопирован в буфер обмена'));
    } catch {
      notify(t('Не удалось скопировать отчёт'), 'error');
    }
  };

  const tail = reportLogs.slice(-60);

  return (
    <Modal
      open
      title={t('Игра завершилась с ошибкой')}
      subtitle={instance?.name ?? t('Сборка')}
      onClose={clearCrash}
      className="max-w-[620px]"
      footer={
        <>
          <Button variant="ghost" onClick={clearCrash}>
            {t('Закрыть')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (crash) void api.openInstanceLog(crash.instanceId).catch(() => undefined);
            }}
          >
            <FolderOpen size={13} />
            {t('Открыть лог')}
          </Button>
          <Button variant="secondary" onClick={() => void copyReport()}>
            {copied ? <Check size={13} className="text-led" /> : <Copy size={13} />}
            {t('Скопировать отчёт')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[9px] border border-line bg-bg-well/70 px-3.5 py-2.5">
          <p className="text-[11px] text-muted">{t('Код завершения')}</p>
          <p className="mt-0.5 font-mono text-[15px] text-ink tabular-nums">
            {crash.exitCode === null ? '—' : crash.exitCode}
          </p>
        </div>
        <div className="rounded-[9px] border border-line bg-bg-well/70 px-3.5 py-2.5">
          <p className="text-[11px] text-muted">{t('Время')}</p>
          <p className="mt-0.5 font-mono text-[12px] text-ink">
            {new Date(crash.at).toLocaleTimeString(language === 'en' ? 'en-US' : 'ru-RU')}
          </p>
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-[9px] border border-line bg-surface px-3.5 py-3 text-xs leading-relaxed text-muted">
        <RotateCcw size={13} className="mt-0.5 shrink-0" />
        {t(
          'Частые причины: несовместимый мод, нехватка памяти или устаревшая Java. Скопируйте отчёт и приложите его к обращению — там есть версия сборки и хвост лога.',
        )}
      </p>

      <div className="overflow-hidden rounded-[10px] border border-line bg-bg-well">
        <div className="flex items-center justify-between border-b border-line px-3.5 py-2">
          <span className="text-xs font-medium text-ink">{t('Последние строки лога')}</span>
          <span className="font-mono text-[11px] text-faint">({tail.length})</span>
        </div>
        <pre className="max-h-[240px] overflow-auto px-3.5 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted select-text cursor-text">
          {tail.length > 0 ? tail.map((log) => log.line).join('\n') : t('Лог пуст')}
        </pre>
      </div>
    </Modal>
  );
}
