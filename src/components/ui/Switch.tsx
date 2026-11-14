import { cn } from '../../utils/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

/** Тактильный аппаратный тумблер. */
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-[6px] border p-0.5 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ink/30',
        checked
          ? 'border-ink/20 bg-cta'
          : 'border-line-strong bg-bg-well',
        disabled && 'cursor-default opacity-45',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-[4px] transition-transform duration-150',
          checked
            ? 'translate-x-4 bg-cta-ink'
            : 'translate-x-0 bg-muted',
        )}
      />
    </button>
  );
}
