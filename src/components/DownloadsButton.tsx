import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  X,
} from 'lucide-react';
import type { DownloadJob, JobStatus } from '../api';
import { useI18n } from '../i18n';
import { localizeError } from '../i18n/errors';
import { localizeProgressMessage } from '../i18n/progress';
import { isJobActive, useJobsStore } from '../stores/jobsStore';
import { cn } from '../utils/cn';
import { ProgressBar } from './ui/ProgressBar';

const STATUS_KEYS: Record<JobStatus, string> = {
  queued: 'В очереди',
  running: 'Выполняется',
  paused: 'На паузе',
  canceling: 'Отмена…',
  succeeded: 'Готово',
  failed: 'Ошибка',
  canceled: 'Отменено',
};

function JobIcon({ status }: { status: JobStatus }) {
  if (status === 'running' || status === 'canceling' || status === 'queued') {
    return <Loader2 size={13} className="animate-spin text-accent" />;
  }
  if (status === 'succeeded') {
    return <Check size={13} className="text-accent" />;
  }
  if (status === 'failed') {
    return <AlertCircle size={13} className="text-danger" />;
  }
  if (status === 'paused') {
    return <Pause size={12} className="text-warn" />;
  }
  return <X size={13} className="text-faint" />;
}

function JobRow({ job }: { job: DownloadJob }) {
  const { t, language } = useI18n();
  const pause = useJobsStore((s) => s.pause);
  const resume = useJobsStore((s) => s.resume);
  const cancel = useJobsStore((s) => s.cancel);
  const dismiss = useJobsStore((s) => s.dismiss);
  const retry = useJobsStore((s) => s.retry);

  const active = isJobActive(job.status);
  const showProgress = active && job.status !== 'queued' && job.percent > 0;
  const statusLabel = t(STATUS_KEYS[job.status]);
  const message = localizeProgressMessage(job.message, language);
  const detail =
    message && message !== statusLabel && message !== job.title ? message : null;

  return (
    <div className="group rounded-[8px] px-2 py-1.5 transition-colors hover:bg-surface-2/45">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-bg-well/80">
          <JobIcon status={job.status} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">
              {localizeProgressMessage(job.title, language)}
            </span>
            <span
              className={cn(
                'shrink-0 font-mono text-[10.5px] tabular-nums',
                job.status === 'failed' ? 'text-danger' : 'text-faint',
              )}
            >
              {active && job.percent > 0 ? `${Math.round(job.percent)}%` : statusLabel}
            </span>
          </div>

          {detail && (
            <p className="mt-0.5 truncate text-[11px] text-muted">{detail}</p>
          )}
          {job.status === 'failed' && job.error && (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-danger/90">
              {localizeError(job.error, language)}
            </p>
          )}

          {showProgress && (
            <div className="mt-1.5">
              <ProgressBar percent={job.percent} />
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {job.status === 'paused' && (
            <JobButton label={t('Продолжить')} onClick={() => void resume(job.id)}>
              <Play size={11} />
            </JobButton>
          )}
          {(job.status === 'running' || job.status === 'queued') && (
            <JobButton label={t('Пауза')} onClick={() => void pause(job.id)}>
              <Pause size={11} />
            </JobButton>
          )}
          {active && (
            <JobButton label={t('Отменить')} onClick={() => void cancel(job.id)} danger>
              <X size={12} />
            </JobButton>
          )}
          {job.status === 'failed' && job.retry && (
            <JobButton label={t('Повторить')} onClick={() => void retry(job)}>
              <RotateCcw size={11} />
            </JobButton>
          )}
          {!active && (
            <JobButton
              label={t('Убрать из списка')}
              onClick={() => void dismiss(job.id)}
            >
              <X size={12} />
            </JobButton>
          )}
        </div>
      </div>
    </div>
  );
}

function JobButton({
  children,
  label,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-[5px] text-muted transition-colors',
        danger ? 'hover:bg-danger/15 hover:text-danger' : 'hover:bg-surface-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

/** Кнопка загрузок в заголовке: компактная панель без модальных окон. */
export function DownloadsButton() {
  const jobs = useJobsStore((s) => s.jobs);
  const { t, tf } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (jobs.length === 0) return null;

  const active = jobs.filter((job) => isJobActive(job.status)).length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={t('Загрузки')}
        aria-label={t('Загрузки')}
        aria-expanded={open}
        className="relative flex h-8 w-8 items-center justify-center rounded-[9px] border border-line-strong bg-surface-2/75 text-muted backdrop-blur-md shadow-[inset_0_1px_0_var(--rim)] transition-all hover:bg-surface-2 hover:text-ink"
      >
        <Download size={14} strokeWidth={1.9} />
        {active > 0 && (
          <span className="absolute -top-1 -right-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-cta px-1 font-mono text-[9.5px] font-semibold tabular-nums text-bg">
            {active}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-[340px] max-w-[calc(100vw-2rem)] rounded-[11px] border border-line-strong bg-surface/96 p-1.5 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.65)] backdrop-blur-2xl">
          <div className="flex items-baseline justify-between px-2 py-1">
            <span className="text-[11px] font-medium text-faint">{t('Задачи')}</span>
            <span className="font-mono text-[10.5px] text-faint tabular-nums">
              {tf('{active} из {total}', { active, total: jobs.length })}
            </span>
          </div>

          <div className="max-h-[340px] space-y-0.5 overflow-y-auto [scrollbar-gutter:stable]">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
