import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { cn } from '../utils/cn';

interface CuboidProps {
  texture: string;
  /** Левый верхний угол развёртки детали в текстуре. */
  u: number;
  v: number;
  /** Ширина, высота и глубина детали в «пикселях» текстуры. */
  w: number;
  h: number;
  d: number;
  /** Смещение центра детали от центра модели. */
  x: number;
  y: number;
  scale: number;
}

interface FaceSpec {
  key: string;
  u: number;
  v: number;
  width: number;
  height: number;
  transform: string;
}

/**
 * Один параллелепипед модели. Шесть граней собираются из развёртки скина:
 * у каждой своя область текстуры и свой поворот в 3D. Развёртка Minecraft
 * нарисована «как видно снаружи», поэтому отражения не нужны.
 */
function Cuboid({ texture, u, v, w, h, d, x, y, scale }: CuboidProps) {
  const px = (value: number) => `${value * scale}px`;
  const half = (value: number) => `${(value * scale) / 2}px`;

  const faces: FaceSpec[] = [
    // Перед: развёртка сразу под верхней гранью.
    { key: 'front', u: u + d, v: v + d, width: w, height: h, transform: `translateZ(${half(d)})` },
    {
      key: 'back',
      u: u + d + w + d,
      v: v + d,
      width: w,
      height: h,
      transform: `rotateY(180deg) translateZ(${half(d)})`,
    },
    {
      key: 'right',
      u,
      v: v + d,
      width: d,
      height: h,
      transform: `rotateY(-90deg) translateZ(${half(w)})`,
    },
    {
      key: 'left',
      u: u + d + w,
      v: v + d,
      width: d,
      height: h,
      transform: `rotateY(90deg) translateZ(${half(w)})`,
    },
    {
      key: 'top',
      u: u + d,
      v,
      width: w,
      height: d,
      transform: `rotateX(90deg) translateZ(${half(h)})`,
    },
    {
      key: 'bottom',
      u: u + d + w,
      v,
      width: w,
      height: d,
      transform: `rotateX(-90deg) translateZ(${half(h)})`,
    },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 0,
        height: 0,
        transformStyle: 'preserve-3d',
        transform: `translate3d(${px(x)}, ${px(y)}, 0)`,
      }}
    >
      {faces.map((face) => (
        <div
          key={face.key}
          style={{
            position: 'absolute',
            left: `${(-face.width * scale) / 2}px`,
            top: `${(-face.height * scale) / 2}px`,
            width: px(face.width),
            height: px(face.height),
            backgroundImage: `url("${texture}")`,
            backgroundSize: px(64),
            backgroundPosition: `${-face.u * scale}px ${-face.v * scale}px`,
            imageRendering: 'pixelated',
            transform: face.transform,
            backfaceVisibility: 'hidden',
          }}
        />
      ))}
    </div>
  );
}

interface SkinModel3DProps {
  texture: string | null;
  variant: 'classic' | 'slim';
  /** Размер одного «пикселя» текстуры в экранных пикселях. */
  scale?: number;
  className?: string;
  onFail?: () => void;
}

/**
 * Объёмная модель игрока из той же текстуры 64×64. Собрана из CSS-3D граней:
 * без WebGL и three.js, поэтому не тянет бандл и остаётся резкой.
 * Модель вращается мышью, двойной клик возвращает исходный ракурс.
 */
export function SkinModel3D({
  texture,
  variant,
  scale = 8,
  className,
  onFail,
}: SkinModel3DProps) {
  const { t } = useI18n();
  const [rotation, setRotation] = useState({ x: -8, y: 24 });
  const [dragging, setDragging] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const dragRef = useRef<{ px: number; py: number; rx: number; ry: number } | null>(null);

  // Заодно узнаём формат текстуры: у старых 64×32 нет отдельных левых
  // конечностей, их берут зеркально от правых.
  useEffect(() => {
    setLegacy(false);
    if (!texture) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setLegacy(image.naturalHeight === 32);
    };
    image.onerror = () => {
      if (!cancelled) onFail?.();
    };
    image.src = texture;
    return () => {
      cancelled = true;
    };
  }, [texture, onFail]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      px: event.clientX,
      py: event.clientY,
      rx: rotation.x,
      ry: rotation.y,
    };
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setRotation({
      x: Math.max(-55, Math.min(55, drag.rx - (event.clientY - drag.py) * 0.4)),
      y: drag.ry + (event.clientX - drag.px) * 0.5,
    });
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const reset = useCallback(() => setRotation({ x: -8, y: 24 }), []);

  const slim = variant === 'slim';
  const armWidth = slim ? 3 : 4;
  // Половина корпуса (4) плюс половина руки: руки висят вплотную к телу.
  const armOffset = 4 + armWidth / 2;

  // Развёртка 1.8+: голова, корпус, правая и левая рука, правая и левая нога.
  // У 64×32 левые конечности совпадают с правыми.
  const parts = [
    { id: 'head', u: 0, v: 0, w: 8, h: 8, d: 8, x: 0, y: -12 },
    { id: 'body', u: 16, v: 16, w: 8, h: 12, d: 4, x: 0, y: -2 },
    { id: 'rightArm', u: 40, v: 16, w: armWidth, h: 12, d: 4, x: -armOffset, y: -2 },
    {
      id: 'leftArm',
      u: legacy ? 40 : 32,
      v: legacy ? 16 : 48,
      w: armWidth,
      h: 12,
      d: 4,
      x: armOffset,
      y: -2,
    },
    { id: 'rightLeg', u: 0, v: 16, w: 4, h: 12, d: 4, x: -2, y: 10 },
    { id: 'leftLeg', u: legacy ? 0 : 16, v: legacy ? 16 : 48, w: 4, h: 12, d: 4, x: 2, y: 10 },
  ];

  return (
    <div
      className={cn(
        'relative flex select-none flex-col overflow-hidden rounded-[12px] border border-line bg-bg-well/55',
        className,
      )}
    >
      <div
        role="img"
        aria-label={t('Модель скина')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={reset}
        className={cn(
          'relative flex flex-1 items-center justify-center',
          dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        style={{ perspective: '1000px', touchAction: 'none' }}
      >
        {/* Мягкая тень под ногами, чтобы модель не «висела» в воздухе. */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-[16%] left-1/2 h-6 w-[46%] -translate-x-1/2 rounded-[50%] bg-black/35 blur-md"
        />

        {texture && (
          <div
            style={{
              width: 0,
              height: 0,
              transformStyle: 'preserve-3d',
              transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
              transition: dragging ? 'none' : 'transform 0.18s ease-out',
            }}
          >
            {parts.map(({ id, ...part }) => (
              <Cuboid key={id} texture={texture} scale={scale} {...part} />
            ))}
          </div>
        )}
      </div>

      <p className="pb-2.5 text-center text-[11px] text-faint">
        {t('Потяните модель, чтобы повернуть')}
      </p>
    </div>
  );
}
