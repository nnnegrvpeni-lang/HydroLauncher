import { cn } from '../utils/cn';

interface VoxelEmblemProps {
  engine: string;
  loader: string;
  size?: number;
  className?: string;
}

/**
 * Изометрический 3D-воксельный блок для каждой конфигурации Minecraft —
 * тёплая предметная графика в духе Minecraft без неоновых линий.
 */
export function VoxelEmblem({
  engine,
  loader,
  size = 40,
  className,
}: VoxelEmblemProps) {
  const key = engine === 'horizon' ? 'horizon' : loader;
  const palette = PALETTES[key] ?? PALETTES.vanilla;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={cn('hl-voxel-hover shrink-0 select-none', className)}
      aria-hidden
    >
      {/* Мягкая контактная тень под блоком */}
      <ellipse cx="24" cy="42.5" rx="13" ry="3" fill="black" fillOpacity="0.32" />

      {/* Левая грань */}
      <polygon points="8,16 24,25 24,42 8,33" fill={palette.left} />
      {/* Правая грань */}
      <polygon points="40,16 24,25 24,42 40,33" fill={palette.right} />
      {/* Верхняя грань */}
      <polygon points="24,7 40,16 24,25 8,16" fill={palette.top} />

      {/* Уникальные детали породы / материала для каждого лоадера */}
      {key === 'vanilla' && (
        <>
          {/* Пиксельная кайма дёрна по верхней кромке */}
          <polygon
            points="8,16 24,25 24,29.5 19,26.8 19,28.5 14,25.8 14,23.2 8,19.8"
            fill="#569e54"
          />
          <polygon
            points="40,16 24,25 24,29.5 29,26.8 29,28.4 35,25.2 35,22.5 40,19.8"
            fill="#3f7c40"
          />
          {/* Рельеф верхней травы */}
          <polygon points="24,11 31,15 24,19 17,15" fill="#77c66d" fillOpacity="0.45" />
        </>
      )}

      {key === 'fabric' && (
        <>
          {/* Переплетённые нити полотна */}
          <polygon points="15,12 19,14.2 19,18.2 15,16" fill="#f3ebd8" fillOpacity="0.55" />
          <polygon points="25,12 29,14.2 29,18.2 25,16" fill="#f3ebd8" fillOpacity="0.35" />
          <polygon points="11,22 21,27.5 21,30 11,24.5" fill="#d8cbb0" fillOpacity="0.45" />
          <polygon points="27,27.5 37,22 37,24.5 27,30" fill="#9c8b6d" fillOpacity="0.55" />
          <polygon points="11,28 21,33.5 21,36 11,30.5" fill="#d8cbb0" fillOpacity="0.3" />
        </>
      )}

      {key === 'forge' && (
        <>
          {/* Горячая ковочная щель и заклёпки на стали */}
          <polygon points="12,24.5 20,29 20,32.5 12,28" fill="#e58845" />
          <polygon points="13,25.5 19,28.8 19,30.8 13,27.5" fill="#ffc46b" fillOpacity="0.7" />
          <polygon points="28,29 36,24.5 36,27 28,31.5" fill="#272d36" />
          <circle cx="24" cy="16" r="2.2" fill="#b4becb" fillOpacity="0.65" />
        </>
      )}

      {key === 'neoforge' && (
        <>
          {/* Оксидированная медь и янтарный кристалл */}
          <polygon points="24,11 32,15.5 24,20 16,15.5" fill="#6bc9aa" fillOpacity="0.55" />
          <polygon points="14,23 21,27 21,35 14,31" fill="#eb8a46" />
          <polygon points="15.5,24.5 19.5,26.8 19.5,32 15.5,29.7" fill="#ffd089" fillOpacity="0.65" />
        </>
      )}

      {key === 'quilt' && (
        <>
          {/* Лоскутные вставки */}
          <polygon points="24,9.5 31,13.5 24,17.5 17,13.5" fill="#9b89eb" fillOpacity="0.6" />
          <polygon points="10,19.5 16.5,23.2 16.5,30.5 10,26.8" fill="#59b5a2" fillOpacity="0.75" />
          <polygon points="31.5,23.2 38,19.5 38,26.8 31.5,30.5" fill="#d47ea8" fillOpacity="0.55" />
        </>
      )}

      {key === 'horizon' && (
        <>
          {/* Титановое ядро Horizon */}
          <polygon points="24,11 32,15.5 24,20 16,15.5" fill="#e08952" fillOpacity="0.85" />
          <polygon points="10,24 24,31.8 38,24 38,26.5 24,34.3 10,26.5" fill="#e08952" fillOpacity="0.6" />
        </>
      )}

      {/* Чёткие световые рёбра */}
      <path
        d="M24 7L40 16V33L24 42L8 33V16L24 7Z"
        stroke="white"
        strokeOpacity="0.18"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        d="M8 16L24 25L40 16M24 25V42"
        stroke="white"
        strokeOpacity="0.16"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const PALETTES: Record<string, { top: string; left: string; right: string }> = {
  vanilla: { top: '#63b45e', left: '#7e5839', right: '#5b3d26' },
  fabric: { top: '#e2d7be', left: '#b5a382', right: '#86765b' },
  forge: { top: '#7f8997', left: '#535b67', right: '#383f49' },
  neoforge: { top: '#4da387', left: '#4c5460', right: '#343b45' },
  quilt: { top: '#806ed6', left: '#6050ae', right: '#463a84' },
  horizon: { top: '#6d7582', left: '#464d57', right: '#2f353d' },
};
