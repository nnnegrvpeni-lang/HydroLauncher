import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, Trash2 } from 'lucide-react';
import { useLaunchStore } from '../stores/launchStore';
import { cn } from '../utils/cn';
import type { GameLog } from '../api';

const EMPTY_LOGS: GameLog[] = [];

/** Консоль вывода игры — появляется только при наличии логов. */
export function LogConsole({ instanceId }: { instanceId?: string }) {
  const logsByInstance = useLaunchStore((s) => s.logsByInstance);
  const clearLogs = useLaunchStore((s) => s.clearLogs);
  const logs = instanceId ? (logsByInstance[instanceId] ?? EMPTY_LOGS) : EMPTY_LOGS;
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length, open]);

  if (!instanceId || logs.length === 0) return null;

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs.map((l) => l.line).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="shrink-0 border-t border-line bg-surface">
      <div className="flex h-8 items-center justify-between px-4">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-[11.5px] font-medium text-muted transition-colors hover:text-ink"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-led" />
          <span>Вывод процесса</span>
          <span className="rounded-[4px] border border-line bg-bg-well px-1.5 py-px font-mono text-[10px] text-muted tabular-nums">
            {logs.length}
          </span>
          <ChevronDown
            size={12}
            className={cn('transition-transform', open && 'rotate-180')}
          />
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => void copyLogs()}
            title="Копировать все логи"
            className="flex h-6 items-center gap-1 rounded-[5px] px-2 text-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {copied ? <Check size={11} className="text-led" /> : <Copy size={11} />}
            {copied ? 'Скопировано' : 'Копировать'}
          </button>

          <button
            onClick={() => clearLogs(instanceId)}
            title="Очистить консоль"
            className="flex h-6 items-center gap-1 rounded-[5px] px-2 text-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Trash2 size={11} />
            Очистить
          </button>
        </div>
      </div>

      {open && (
        <div
          ref={scrollRef}
          className="h-40 cursor-text overflow-y-auto border-t border-line bg-bg-well px-4 py-2.5 font-mono text-[11px] leading-[1.6] select-text"
        >
          {logs.map((log, index) => (
            <p
              key={`${log.timestamp}-${index}`}
              className={cn(
                'break-all whitespace-pre-wrap',
                log.stream === 'stderr' ? 'text-danger/90' : 'text-muted',
              )}
            >
              {log.line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
