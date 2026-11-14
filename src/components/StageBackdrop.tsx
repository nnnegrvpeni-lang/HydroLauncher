import { useId } from 'react';
import { cn } from '../utils/cn';

const TINT: Record<string, string> = {
  vanilla: '#56a658',
  fabric: '#c9b38c',
  forge: '#d98448',
  neoforge: '#52aa8c',
  quilt: '#8b77db',
  horizon: '#d87d4a',
};

/**
 * Спокойный панорамный фон верхней части фокус-сцены:
 * мягкий студийный свет + слоистый рельеф горизонта, растворяющийся в поверхности.
 */
export function StageBackdrop({
  engine,
  loader,
  className,
}: {
  engine: string;
  loader: string;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const key = engine === 'horizon' ? 'horizon' : loader;
  const tint = TINT[key] ?? TINT.vanilla;

  return (
    <svg
      viewBox="0 0 800 200"
      preserveAspectRatio="xMidYMid slice"
      className={cn('pointer-events-none h-full w-full select-none', className)}
      aria-hidden
    >
      <defs>
        <radialGradient id={`stage-glow-${uid}`} cx="80%" cy="22%" r="68%">
          <stop offset="0%" stopColor={tint} stopOpacity="0.18" />
          <stop offset="55%" stopColor={tint} stopOpacity="0.05" />
          <stop offset="100%" stopColor={tint} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`stage-fade-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--surface)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--surface)" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="800" height="200" fill={`url(#stage-glow-${uid})`} />

      {/* Ступенчатые силуэты воксельного ландшафта на горизонте */}
      <path
        d="M0 155 H90 V135 H155 V148 H235 V122 H310 V142 H390 V116 H475 V134 H560 V106 H645 V128 H720 V112 H800 V200 H0 Z"
        fill={tint}
        fillOpacity="0.11"
      />
      <path
        d="M0 172 H130 V158 H210 V168 H340 V146 H430 V162 H520 V138 H615 V156 H705 V144 H800 V200 H0 Z"
        fill="currentColor"
        fillOpacity="0.075"
        className="text-ink"
      />

      {/* Мягкое растворение в поверхность панели */}
      <rect width="800" height="200" fill={`url(#stage-fade-${uid})`} />
    </svg>
  );
}
