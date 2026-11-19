import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { cn } from '../utils/cn';

type Box = [number, number, number, number];
type View = 'front' | 'back';

const VIEWS: Record<
  View,
  { head: Box; body: Box; rightArm: Box; leftArm: Box; rightLeg: Box; leftLeg: Box }
> = {
  front: {
    head: [8, 8, 8, 8],
    body: [20, 20, 8, 12],
    rightArm: [44, 20, 4, 12],
    leftArm: [36, 52, 4, 12],
    rightLeg: [4, 20, 4, 12],
    leftLeg: [20, 52, 4, 12],
  },
  back: {
    head: [24, 8, 8, 8],
    body: [32, 20, 8, 12],
    rightArm: [52, 20, 4, 12],
    leftArm: [44, 52, 4, 12],
    rightLeg: [12, 20, 4, 12],
    leftLeg: [28, 52, 4, 12],
  },
};

/** Ширина фигуры в «пикселях» текстуры: руки + корпус. */
const FIGURE_WIDTH = 16;
const FIGURE_HEIGHT = 32;

function drawPart(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  box: Box,
  x: number,
  y: number,
  scale: number,
) {
  ctx.drawImage(
    image,
    box[0],
    box[1],
    box[2],
    box[3],
    x,
    y,
    box[2] * scale,
    box[3] * scale,
  );
}

function drawView(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  view: View,
  slim: boolean,
  scale: number,
) {
  const parts = VIEWS[view];
  const armWidth = slim ? 3 : 4;
  const rightArmBackX = slim ? 51 : 52;
  const leftArmBackX = slim ? 43 : 44;

  const rightArm: Box = [...parts.rightArm];
  const leftArm: Box = [...parts.leftArm];
  rightArm[2] = armWidth;
  leftArm[2] = armWidth;
  if (view === 'back') rightArm[0] = rightArmBackX;
  if (view === 'back') leftArm[0] = leftArmBackX;

  const center = (FIGURE_WIDTH * scale) / 2;

  drawPart(ctx, image, parts.head, center - 4 * scale, 0, scale);
  drawPart(ctx, image, parts.body, center - 4 * scale, 8 * scale, scale);
  drawPart(ctx, image, rightArm, center - (4 + armWidth) * scale, 8 * scale, scale);
  drawPart(ctx, image, leftArm, center + 4 * scale, 8 * scale, scale);
  drawPart(ctx, image, parts.rightLeg, center - 4 * scale, 20 * scale, scale);
  drawPart(ctx, image, parts.leftLeg, center, 20 * scale, scale);
}

function SkinFigure({
  texture,
  variant,
  view,
  scale,
  onFail,
}: {
  texture: string | null;
  variant: 'classic' | 'slim';
  view: View;
  scale: number;
  onFail: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    if (!texture) return;

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      drawView(ctx, image, view, variant === 'slim', scale);
    };
    image.onerror = () => {
      if (!cancelled) onFail();
    };
    image.src = texture;
    return () => {
      cancelled = true;
    };
  }, [texture, variant, view, scale, onFail]);

  return (
    <canvas
      ref={canvasRef}
      width={FIGURE_WIDTH * scale}
      height={FIGURE_HEIGHT * scale}
      className="h-auto w-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

interface SkinPreviewProps {
  texture: string | null;
  variant: 'classic' | 'slim';
  /** Размер пикселя текстуры на canvas. */
  scale?: number;
  className?: string;
}

/** Превью скина: вид спереди и сзади, нарисованные из текстуры 64×64. */
export function SkinPreview({ texture, variant, scale = 8, className }: SkinPreviewProps) {
  const [failed, setFailed] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    setFailed(!texture);
  }, [texture]);

  const handleFail = useCallback(() => setFailed(true), []);

  return (
    <div
      className={cn(
        'flex flex-col rounded-[12px] border border-line bg-bg-well/55 px-4 py-4',
        className,
      )}
    >
      <div className="grid flex-1 grid-cols-2 gap-3">
        {(['front', 'back'] as const).map((view) => (
          <div key={view} className="flex min-w-0 flex-col">
            <span className="mb-1.5 text-center text-[11px] text-faint">
              {view === 'front' ? t('Вид спереди') : t('Вид сзади')}
            </span>
            <div className="flex flex-1 items-center justify-center">
              <SkinFigure
                texture={texture}
                variant={variant}
                view={view}
                scale={scale}
                onFail={handleFail}
              />
            </div>
          </div>
        ))}
      </div>
      {failed && (
        <p className="mt-2 text-center text-[11px] text-muted">
          {t('Текстура скина не загрузилась')}
        </p>
      )}
    </div>
  );
}
