import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  /** Дополнительный текст под кнопкой. */
  hint?: string;
}

const GAP = 4;
const EDGE = 8;
const MAX_HEIGHT = 224;

/**
 * Выпадающий список в стиле лаунчера. Нативные `<select>` и `<datalist>`
 * рисуют системное меню, которое выбивается из «жидкого стекла» и на Windows
 * выглядит как браузерное.
 *
 * Список рендерится в портал с `position: fixed`, поэтому его не срезает
 * прокрутка модального окна: он всегда открывается вниз под кнопкой и только
 * у самого нижнего края экрана разворачивается вверх.
 */
export function SelectMenu({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
  disabled,
  className,
  hint,
}: SelectMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Пересчитываем позицию при открытии и при любом изменении раскладки.
  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }

    const update = () => {
      const button = rootRef.current;
      if (!button) return;
      const box = button.getBoundingClientRect();
      const spaceBelow = window.innerHeight - box.bottom - GAP - EDGE;
      const spaceAbove = box.top - GAP - EDGE;
      const flipUp = spaceBelow < 120 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(96, Math.min(MAX_HEIGHT, flipUp ? spaceAbove : spaceBelow));
      setRect({
        left: Math.max(EDGE, Math.min(box.left, window.innerWidth - box.width - EDGE)),
        top: flipUp ? box.top - GAP - maxHeight : box.bottom + GAP,
        width: box.width,
        maxHeight,
      });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Иначе Escape заодно закроет родительское модальное окно.
      event.stopPropagation();
      setOpen(false);
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

      {hint && <p className="mt-1 text-[11px] text-faint">{hint}</p>}

      {open &&
        rect &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            style={{
              position: 'fixed',
              left: rect.left,
              top: rect.top,
              width: rect.width,
              maxHeight: rect.maxHeight,
            }}
            className="z-[70] overflow-y-auto rounded-[8px] border border-line-strong bg-surface p-1 shadow-[0_18px_36px_-14px_rgba(0,0,0,0.7)]"
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
          </div>,
          document.body,
        )}
    </div>
  );
}
