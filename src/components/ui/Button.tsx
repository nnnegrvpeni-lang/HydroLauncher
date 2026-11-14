import { cn } from '../../utils/cn';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-cta text-cta-ink font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_2px_8px_rgba(0,0,0,0.3)] hover:bg-cta-hover active:translate-y-[0.5px] disabled:opacity-40 disabled:pointer-events-none',
  accent:
    'bg-accent text-accent-ink font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_2px_10px_rgba(0,0,0,0.32)] hover:bg-accent-hover active:translate-y-[0.5px] disabled:opacity-40 disabled:pointer-events-none',
  secondary:
    'border border-line-strong bg-surface-2/85 backdrop-blur-md text-ink shadow-[inset_0_1px_0_var(--rim)] hover:bg-surface-3 active:translate-y-[0.5px] disabled:opacity-40 disabled:pointer-events-none',
  ghost:
    'text-muted hover:bg-surface-2/80 hover:text-ink active:translate-y-[0.5px] disabled:opacity-40 disabled:pointer-events-none',
  danger:
    'border border-danger/35 bg-danger/15 backdrop-blur-md text-danger hover:bg-danger/22 active:translate-y-[0.5px] disabled:opacity-40 disabled:pointer-events-none',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-7.5 px-3 text-[12px] rounded-[8px]',
  md: 'h-8.5 px-3.5 text-[12.5px] rounded-[9px]',
  lg: 'h-10 px-5 text-[13px] rounded-[10px]',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 font-medium transition-all duration-120 outline-none select-none focus-visible:ring-2 focus-visible:ring-ink/30',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}

/** Компактная квадратная кнопка действия. */
export function IconButton({
  variant = 'ghost',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] transition-all duration-120 outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:pointer-events-none disabled:opacity-40',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
