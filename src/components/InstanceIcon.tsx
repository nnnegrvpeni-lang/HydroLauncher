import { cn } from '../utils/cn';
import {
  backgroundStyle,
  instanceIconAsset,
  resolveInstanceIcon,
} from '../utils/instanceIcons';

interface InstanceIconProps {
  /** ID предмета; для старых сборок берётся детерминированно из seed. */
  icon?: string | null;
  /** ID фона-градиента. */
  background?: string | null;
  /** Стабильный ключ (обычно id сборки) для выбора оформления по умолчанию. */
  seed?: string;
  alt?: string;
  className?: string;
  imageClassName?: string;
}

/**
 * Плитка оформления сборки: градиент + изометрическая иллюстрация.
 * Работает и квадратом (карточка, док), и широкой полосой (баннер):
 * `object-contain` вписывает предмет по высоте, не обрезая его.
 */
export function InstanceIcon({
  icon,
  background,
  seed,
  alt = '',
  className,
  imageClassName,
}: InstanceIconProps) {
  const config = resolveInstanceIcon({ icon, background }, seed ?? '');
  return (
    <div
      className={cn('relative overflow-hidden', className)}
      style={backgroundStyle(config.background)}
    >
      <img
        src={instanceIconAsset(config.icon)}
        alt={alt}
        draggable={false}
        className={cn(
          'h-full w-full object-contain select-none',
          imageClassName,
        )}
      />
    </div>
  );
}
