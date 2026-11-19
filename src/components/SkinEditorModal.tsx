import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, RotateCcw, Shirt } from 'lucide-react';
import { api, type OfflineAccount, type SkinProfile, type SkinVariant } from '../api';
import { useI18n } from '../i18n';
import { localizeError } from '../i18n/errors';
import { cn } from '../utils/cn';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

interface SkinEditorModalProps {
  open: boolean;
  account: OfflineAccount | null;
  onClose: () => void;
}

type Box = [number, number, number, number];
type View = 'front' | 'back';

const VIEWS: Record<View, { head: Box; body: Box; rightArm: Box; leftArm: Box; rightLeg: Box; leftLeg: Box }> = {
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

const SCALE = 6;
const VIEW_WIDTH = 64;
const VIEW_HEIGHT = 36;

function drawPart(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  box: Box,
  x: number,
  y: number,
) {
  ctx.drawImage(
    image,
    box[0],
    box[1],
    box[2],
    box[3],
    x,
    y,
    box[2] * SCALE,
    box[3] * SCALE,
  );
}

function drawView(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  view: View,
  offsetX: number,
  slim: boolean,
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

  const center = offsetX + (VIEW_WIDTH * SCALE) / 2;

  drawPart(ctx, image, parts.head, center - 4 * SCALE, 2 * SCALE);
  drawPart(ctx, image, parts.body, center - 4 * SCALE, 10 * SCALE);
  drawPart(
    ctx,
    image,
    rightArm,
    center - (4 + armWidth) * SCALE,
    10 * SCALE,
  );
  drawPart(ctx, image, leftArm, center + 4 * SCALE, 10 * SCALE);
  drawPart(ctx, image, parts.rightLeg, center - 4 * SCALE, 22 * SCALE);
  drawPart(ctx, image, parts.leftLeg, center, 22 * SCALE);
}

function SkinPreview({ texture, variant }: { texture: string | null; variant: SkinVariant }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    setFailed(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    if (!texture) {
      setFailed(true);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const slim = variant === 'slim';
      drawView(ctx, image, 'front', 0, slim);
      drawView(ctx, image, 'back', (VIEW_WIDTH + 14) * SCALE, slim);
    };
    image.onerror = () => {
      if (!cancelled) setFailed(true);
    };
    image.src = texture;
    return () => {
      cancelled = true;
    };
  }, [texture, variant]);

  return (
    <div className="rounded-[10px] border border-line bg-bg-well/70 px-3 py-3">
      <div className="flex items-center justify-between text-[11px] text-faint">
        <span>{t('Вид спереди')}</span>
        <span>{t('Вид сзади')}</span>
      </div>
      <div className="mt-1.5 flex justify-center">
        <canvas
          ref={canvasRef}
          width={(VIEW_WIDTH * 2 + 14) * SCALE}
          height={VIEW_HEIGHT * SCALE}
          className="h-auto w-full max-w-[420px]"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
      {failed && (
        <p className="mt-1 text-center text-[11px] text-muted">
          {t('Текстура скина не загрузилась')}
        </p>
      )}
    </div>
  );
}

export function SkinEditorModal({ open, account, onClose }: SkinEditorModalProps) {
  const { t, language } = useI18n();
  const [profile, setProfile] = useState<SkinProfile | null>(null);
  const [variant, setVariant] = useState<SkinVariant>('classic');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !account) return;
    setProfile(null);
    setFilePath(null);
    setError(null);
    setLoading(true);
    let cancelled = false;
    api
      .getSkin(account.id)
      .then((value) => {
        if (cancelled) return;
        setProfile(value);
        setVariant(value.variant);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, account]);

  const run = async (action: () => Promise<SkinProfile>) => {
    setBusy(true);
    setError(null);
    try {
      const value = await action();
      setProfile(value);
      setVariant(value.variant);
      return value;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async () => {
    setError(null);
    try {
      const path = await api.pickSkinFile();
      if (path) setFilePath(path);
    } catch (err) {
      setError(String(err));
    }
  };

  const fileName = filePath?.split(/[\\/]/).pop() ?? null;

  return (
    <Modal
      open={open}
      title={t('Скин и плащ')}
      subtitle={account?.username}
      onClose={onClose}
      className="max-w-[560px]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Закрыть')}
          </Button>
          <Button
            variant="secondary"
            disabled={busy || loading || !account}
            onClick={() => {
              if (!account) return;
              void run(() => api.resetSkin(account.id));
            }}
          >
            <RotateCcw size={13} />
            {t('Сбросить скин')}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted">
          <Loader2 size={14} className="animate-spin" />
          {t('Загрузка скина…')}
        </div>
      ) : (
        <>
          <SkinPreview texture={profile?.textureDataUrl ?? null} variant={variant} />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void pickFile()}
              >
                <ImagePlus size={13} />
                {t('Выбрать PNG')}
              </Button>
              <span className="min-w-0 flex-1 truncate text-xs text-muted">
                {fileName ?? t('Файл 64×64 или 64×32 пикселя')}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-[7px] border border-line bg-bg-well p-0.5">
                {(['classic', 'slim'] as const).map((model) => (
                  <button
                    key={model}
                    onClick={() => setVariant(model)}
                    className={cn(
                      'rounded-[5px] px-3 py-1 text-xs font-medium transition-colors duration-150',
                      variant === model
                        ? 'keycap-surface text-ink'
                        : 'text-muted hover:text-ink',
                    )}
                  >
                    {model === 'classic' ? t('Классическая') : t('Тонкая')}
                  </button>
                ))}
              </div>
              <Button
                variant="primary"
                size="sm"
                disabled={busy || !filePath || !account}
                onClick={() => {
                  if (!account || !filePath) return;
                  void run(() => api.uploadSkin(account.id, filePath, variant)).then((value) => {
                    if (value) setFilePath(null);
                  });
                }}
              >
                {t('Загрузить скин')}
              </Button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-faint">
              <Shirt size={12} />
              {t('Плащи')}
            </div>
            {profile && profile.capes.length > 0 ? (
              <div className="space-y-1">
                {profile.capes.map((cape) => (
                  <div
                    key={cape.id}
                    className="flex items-center justify-between gap-3 rounded-[8px] border border-line bg-surface-2/40 px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-xs text-ink">
                      {cape.active && <Check size={12} className="shrink-0 text-led" />}
                      <span className="truncate">{cape.name}</span>
                    </span>
                    {cape.active ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || !account}
                        onClick={() => {
                          if (!account) return;
                          void run(() => api.removeCape(account.id));
                        }}
                      >
                        {t('Снять')}
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy || !account}
                        onClick={() => {
                          if (!account) return;
                          void run(() => api.equipCape(account.id, cape.id));
                        }}
                      >
                        {t('Надеть')}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted">
                {t('У этого аккаунта нет доступных плащей')}
              </p>
            )}
          </div>

          {error && <p className="text-xs text-danger">{localizeError(error, language)}</p>}
        </>
      )}
    </Modal>
  );
}
