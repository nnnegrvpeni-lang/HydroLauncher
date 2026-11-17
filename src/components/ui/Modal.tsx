import { X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n';
import { cn } from '../../utils/cn';

interface ModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Открывает окно поверх другого модального окна (например, редактор оформления). */
  stacked?: boolean;
}

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  className,
  stacked,
}: ModalProps) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Вложенное окно перехватывает Escape в capture-фазе, иначе
      // вместе с ним закрылось бы и родительское окно.
      if (stacked) e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', handler, stacked ? { capture: true } : undefined);
    return () =>
      window.removeEventListener('keydown', handler, stacked ? { capture: true } : undefined);
  }, [open, onClose, stacked]);

  if (!open) return null;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 flex items-center justify-center p-6',
        stacked ? 'z-[60]' : 'z-50',
      )}
    >
      <div
        className="hl-backdrop-in absolute inset-0 bg-black/55 backdrop-blur-[3px]"
        onClick={onClose}
      />
      <div
        className={cn(
          'deck-surface hl-pop-in relative z-10 flex max-h-[85vh] w-full max-w-[490px] flex-col overflow-hidden rounded-[14px]',
          className,
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[14.5px] font-semibold tracking-tight text-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label={t('Закрыть')}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X size={15} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {footer && (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-bg-well/60 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
