import { cn } from '../utils/cn';

const SKIN_TONES = [
  { base: '#f0c4a0', shade: '#d9a47c' },
  { base: '#e2ae84', shade: '#c78e63' },
  { base: '#c68b59', shade: '#a66f42' },
  { base: '#8d5b3e', shade: '#6f432b' },
];

const HAIR_COLORS = ['#2f241d', '#4c3425', '#1d2028', '#8d5330', '#b88e52', '#523446'];
const EYE_COLORS = ['#2e6f9e', '#3c8559', '#5e4332', '#6e52a6'];

function hashName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Пиксельная 8×8 голова игрока в стиле Minecraft, детерминированная по нику. */
export function AccountAvatar({
  username,
  active = false,
  size = 24,
  className,
}: {
  username: string;
  active?: boolean;
  size?: number;
  className?: string;
}) {
  const h = hashName(username || 'Player');
  const skin = SKIN_TONES[h % SKIN_TONES.length];
  const hair = HAIR_COLORS[(h >> 3) % HAIR_COLORS.length];
  const eyes = EYE_COLORS[(h >> 6) % EYE_COLORS.length];
  const fringe = h % 3;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      className={cn(
        'shrink-0 rounded-[5px] border select-none',
        active ? 'border-line-strong' : 'border-line',
        className,
      )}
      aria-hidden
    >
      {/* Лицо */}
      <rect width="8" height="8" fill={skin.base} />
      {/* Лёгкое затенение краёв */}
      <rect x="0" y="2" width="1" height="6" fill={skin.shade} fillOpacity="0.45" />
      <rect x="7" y="2" width="1" height="6" fill={skin.shade} fillOpacity="0.45" />

      {/* Волосы / чёлка */}
      <rect x="0" y="0" width="8" height="2" fill={hair} />
      {fringe === 0 && (
        <>
          <rect x="0" y="2" width="1" height="2" fill={hair} />
          <rect x="7" y="2" width="1" height="2" fill={hair} />
          <rect x="2" y="2" width="1" height="1" fill={hair} />
        </>
      )}
      {fringe === 1 && (
        <>
          <rect x="0" y="2" width="2" height="1" fill={hair} />
          <rect x="6" y="2" width="2" height="1" fill={hair} />
        </>
      )}
      {fringe === 2 && (
        <>
          <rect x="0" y="2" width="1" height="3" fill={hair} />
          <rect x="7" y="2" width="1" height="3" fill={hair} />
        </>
      )}

      {/* Глаза */}
      <rect x="1" y="4" width="1" height="1" fill="#f5f5f5" />
      <rect x="2" y="4" width="1" height="1" fill={eyes} />
      <rect x="5" y="4" width="1" height="1" fill={eyes} />
      <rect x="6" y="4" width="1" height="1" fill="#f5f5f5" />

      {/* Нос и рот */}
      <rect x="3" y="5" width="2" height="1" fill={skin.shade} />
      <rect x="3" y="6" width="2" height="1" fill={skin.shade} fillOpacity="0.8" />
    </svg>
  );
}
