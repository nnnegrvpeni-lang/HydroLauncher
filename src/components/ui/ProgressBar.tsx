import { cn } from '../../utils/cn';

export function ProgressBar({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={cn(
        'h-[3px] w-full overflow-hidden rounded-[2px] bg-bg-well',
        className,
      )}
    >
      <div
        className="h-full bg-cta transition-all duration-300 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
