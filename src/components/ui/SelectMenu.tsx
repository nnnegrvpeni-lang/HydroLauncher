import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useI18n } from '../../i18n';
import { cn } from '../../utils/cn';

export interface SelectMenuOption {
  value: string;
  label: string;
  /** Дополнительная строка справа: версия, вендор, подсказка. */
  hint?: string;
  title?: string;
}

interface SelectMenuProps {
  value: string;
  options: SelectMenuOption[];
  onChange: (value: string) => void;
  /** Текст кнопки, когда значение пустое или не найдено среди опций. */
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  /** В модальных окнах список открывается вверх, иначе его срезает скролл. */
  placement?: 'up' | 'down';
  /** Дополнительный текст под кнопкой. */
  hint?: string;
}

/**
 * Выпадающий список в стиле лаунчера. Нативные `<select>` и `<datalist>`
 * рисуют системное меню, которое выбивается из «жидкого стекла» и на Windows
 * выглядит как браузерное.
 */
export function SelectMenu({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
  disabled,
  className,
  placement = 'down',
  hint,
}: SelectMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Иначе Escape заодно закроет родительское модальное окно.
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, { capture: true });
    };
  }, [open]);

  const selected = options.find((option) => option.value === value);
  const label = selected?.label ?? (value || placeholder || '');

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'hl-input flex w-full items-center justify-between gap-2 text-left text-xs',
          disabled ? 'cursor-default opacity-55' : 'cursor-pointer',
        )}
      >
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown
          size={13}
          className={cn(
            'shrink-0 text-muted transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            'absolute right-0 left-0 z-30 max-h-56 overflow-y-auto rounded-[8px] border border-line-strong bg-surface p-1 shadow-[0_18px_36px_-14px_rgba(0,0,0,0.7)]',
            placement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                title={option.title}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-xs transition-colors',
                  active
                    ? 'bg-surface-2 font-medium text-ink'
                    : 'text-muted hover:bg-surface-2/60 hover:text-ink',
                )}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {option.hint && (
                    <span className="font-mono text-[11px] text-faint">{option.hint}</span>
                  )}
                  {active && <Check size={12} className="text-accent" />}
                </span>
              </button>
            );
          })}
          {options.length === 0 && (
            <p className="px-2.5 py-2 text-xs text-muted">{t('Нет вариантов')}</p>
          )}
        </div>
      )}

      {hint && <p className="mt-1 text-[11px] text-faint">{hint}</p>}
    </div>
  );
}
