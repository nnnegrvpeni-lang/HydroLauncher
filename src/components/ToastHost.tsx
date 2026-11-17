import { useEffect } from 'react';
import { AlertCircle, Check, Loader2, X } from 'lucide-react';
import { localizeProgressMessage } from '../i18n/progress';
import { useI18n } from '../i18n';
import { localizeError } from '../i18n/errors';
import { useInstancesStore } from '../stores/instancesStore';
import { useLaunchStore } from '../stores/launchStore';
import { useNotifyStore } from '../stores/notifyStore';
import { cn } from '../utils/cn';
import { ProgressBar } from './ui/ProgressBar';

/** Всплывающие стеклянные уведомления в правом верхнем углу. */
export function ToastHost() {
  const progress = useLaunchStore((s) => s.progress);
  const clearProgress = useLaunchStore((s) => s.clearProgress);
  const error = useInstancesStore((s) => s.error);
  const clearError = useInstancesStore((s) => s.clearError);
  const notices = useNotifyStore((s) => s.notices);
  const dismissNotice = useNotifyStore((s) => s.dismiss);
  const { t, language } = useI18n();

  // Автоматически скрываем уведомление об ошибке через 3 секунды
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => {
      clearError();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [error, clearError]);

  if (!progress && !error && notices.length === 0) return null;

  const isDone = progress ? progress.stage === 'done' || progress.percent >= 100 : false;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed top-15 right-5 z-50 flex w-[340px] max-w-[calc(100vw-2.5rem)] flex-col gap-2.5"
    >
      {progress && (
        <div className="pointer-events-auto deck-surface hl-toast-in rounded-[12px] px-3.5 py-3 shadow-[0_20px_44px_-16px_rgba(0,0,0,0.75)]">
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {isDone ? (
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <Check size={12} strokeWidth={2.5} />
                </div>
              ) : (
                <Loader2 size={14} className="shrink-0 animate-spin text-accent" />
              )}
              <span className="truncate text-[12.5px] font-medium text-ink">
                {localizeProgressMessage(progress.message, language)}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <span className="font-mono text-[11px] text-muted tabular-nums">
                {Math.round(progress.percent)}%
              </span>
              <button
                type="button"
                onClick={() => clearProgress(progress.instanceId)}
                aria-label={t('Закрыть уведомление')}
                className="flex h-5 w-5 items-center justify-center rounded-[5px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          <div className="mt-2">
            <ProgressBar percent={progress.percent} />
          </div>
        </div>
      )}

      {error && (
        <div className="pointer-events-auto deck-surface hl-toast-in flex items-start gap-2.5 rounded-[12px] border-danger/40 bg-danger/12 px-3.5 py-3 shadow-[0_20px_44px_-16px_rgba(0,0,0,0.75)]">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-danger" />
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed break-words text-ink">
            {localizeError(error, language)}
          </p>
          <button
            type="button"
            onClick={clearError}
            aria-label={t('Закрыть уведомление')}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-muted transition-colors hover:bg-danger/20 hover:text-ink"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {notices.map((notice) => (
        <div
          key={notice.id}
          className="pointer-events-auto deck-surface hl-toast-in flex items-start gap-2.5 rounded-[12px] px-3.5 py-3 shadow-[0_20px_44px_-16px_rgba(0,0,0,0.75)]"
        >
          <div
            className={cn(
              'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
              notice.tone === 'error' ? 'bg-danger/15 text-danger' : 'bg-accent/15 text-accent',
            )}
          >
            {notice.tone === 'error' ? (
              <AlertCircle size={13} />
            ) : (
              <Check size={12} strokeWidth={2.5} />
            )}
          </div>
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed break-words text-ink">
            {notice.tone === 'error'
              ? localizeError(notice.message, language)
              : notice.message}
          </p>
          <button
            type="button"
            onClick={() => dismissNotice(notice.id)}
            aria-label={t('Закрыть уведомление')}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
