import { useEffect, useRef } from 'react';

interface VoxelStageCanvasProps {
  engine: string;
  loader: string;
  isRunning?: boolean;
}

interface Palette {
  top: string;
  left: string;
  right: string;
  accentTop: string;
  accentLeft: string;
  accentRight: string;
  stoneTop: string;
  stoneLeft: string;
  stoneRight: string;
  glow: string;
  particle: string;
}

const PALETTES: Record<string, Palette> = {
  vanilla: {
    top: '#67b961',
    left: '#7d5638',
    right: '#563923',
    accentTop: '#83cf7a',
    accentLeft: '#5f8f53',
    accentRight: '#466b3d',
    stoneTop: '#6b727c',
    stoneLeft: '#4e545d',
    stoneRight: '#373c43',
    glow: 'rgba(98, 184, 92, 0.16)',
    particle: 'rgba(155, 218, 146, 0.55)',
  },
  fabric: {
    top: '#e5dac2',
    left: '#b8a585',
    right: '#87765b',
    accentTop: '#f3ebd8',
    accentLeft: '#cbb999',
    accentRight: '#9b8a6d',
    stoneTop: '#7a756c',
    stoneLeft: '#5a564f',
    stoneRight: '#3f3c37',
    glow: 'rgba(218, 198, 162, 0.15)',
    particle: 'rgba(235, 222, 196, 0.5)',
  },
  forge: {
    top: '#848e9c',
    left: '#525a66',
    right: '#353c46',
    accentTop: '#ef9852',
    accentLeft: '#cf6f32',
    accentRight: '#994c1f',
    stoneTop: '#5e6673',
    stoneLeft: '#404650',
    stoneRight: '#2b3038',
    glow: 'rgba(229, 132, 68, 0.18)',
    particle: 'rgba(244, 162, 92, 0.6)',
  },
  neoforge: {
    top: '#4fb091',
    left: '#4a535f',
    right: '#303740',
    accentTop: '#ec8d49',
    accentLeft: '#c76c2e',
    accentRight: '#8e481b',
    stoneTop: '#5b6b6c',
    stoneLeft: '#3f4c4e',
    stoneRight: '#2b3537',
    glow: 'rgba(79, 176, 145, 0.17)',
    particle: 'rgba(118, 209, 180, 0.55)',
  },
  quilt: {
    top: '#8b79e0',
    left: '#6252b3',
    right: '#453887',
    accentTop: '#5ec4af',
    accentLeft: '#429886',
    accentRight: '#2e6e61',
    stoneTop: '#6b6587',
    stoneLeft: '#4b4663',
    stoneRight: '#332f45',
    glow: 'rgba(139, 121, 224, 0.17)',
    particle: 'rgba(176, 162, 245, 0.55)',
  },
  horizon: {
    top: '#757e8c',
    left: '#49505b',
    right: '#2f343c',
    accentTop: '#ea8d52',
    accentLeft: '#c76c34',
    accentRight: '#8f491f',
    stoneTop: '#5c636e',
    stoneLeft: '#3e444d',
    stoneRight: '#282c33',
    glow: 'rgba(234, 141, 82, 0.18)',
    particle: 'rgba(240, 168, 118, 0.55)',
  },
};

interface VoxelSpec {
  gx: number;
  gy: number;
  gz: number;
  kind: 'main' | 'accent' | 'stone';
  floatAmp?: number;
  phase?: number;
}

// Изометрический мини-остров: основание + ступенчатый рельеф + парящие воксели
const ISLAND_VOXELS: VoxelSpec[] = [
  // Нижний каменный слой (z = 0)
  { gx: 0, gy: 0, gz: 0, kind: 'stone' },
  { gx: 1, gy: 0, gz: 0, kind: 'stone' },
  { gx: 2, gy: 0, gz: 0, kind: 'stone' },
  { gx: 0, gy: 1, gz: 0, kind: 'stone' },
  { gx: 1, gy: 1, gz: 0, kind: 'stone' },
  { gx: 2, gy: 1, gz: 0, kind: 'stone' },
  { gx: 0, gy: 2, gz: 0, kind: 'stone' },
  { gx: 1, gy: 2, gz: 0, kind: 'stone' },
  { gx: 2, gy: 2, gz: 0, kind: 'stone' },

  // Основной верхний слой (z = 1)
  { gx: 0, gy: 0, gz: 1, kind: 'main' },
  { gx: 1, gy: 0, gz: 1, kind: 'main' },
  { gx: 2, gy: 0, gz: 1, kind: 'main' },
  { gx: 0, gy: 1, gz: 1, kind: 'main' },
  { gx: 1, gy: 1, gz: 1, kind: 'main' },
  { gx: 2, gy: 1, gz: 1, kind: 'accent' },
  { gx: 0, gy: 2, gz: 1, kind: 'main' },
  { gx: 1, gy: 2, gz: 1, kind: 'main' },
  { gx: 2, gy: 2, gz: 1, kind: 'main' },

  // Возвышенность / башня (z = 2, 3)
  { gx: 0, gy: 0, gz: 2, kind: 'main' },
  { gx: 1, gy: 0, gz: 2, kind: 'accent' },
  { gx: 0, gy: 1, gz: 2, kind: 'main' },
  { gx: 0, gy: 0, gz: 3, kind: 'accent' },

  // Парящие спутники-воксели вокруг острова
  { gx: 3.15, gy: 0.4, gz: 2.35, kind: 'accent', floatAmp: 5.5, phase: 0.4 },
  { gx: -1.1, gy: 2.1, gz: 2.1, kind: 'main', floatAmp: 4.5, phase: 2.1 },
  { gx: 2.35, gy: 3.05, gz: 1.55, kind: 'stone', floatAmp: 4, phase: 3.8 },
  { gx: 1.15, gy: -1.15, gz: 2.6, kind: 'accent', floatAmp: 5, phase: 5.0 },
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
}

export function VoxelStageCanvas({
  engine,
  loader,
  isRunning = false,
}: VoxelStageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ tx: 0, ty: 0, x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      const ny = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
      pointerRef.current.tx = nx;
      pointerRef.current.ty = ny;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const key = engine === 'horizon' ? 'horizon' : loader;
    const palette = PALETTES[key] ?? PALETTES.vanilla;

    const particles: Particle[] = Array.from({ length: 28 }, (_, i) => ({
      x: ((i * 73) % 100) / 100,
      y: ((i * 41) % 100) / 100,
      vx: (((i % 5) - 2) * 0.00004),
      vy: -0.00012 - (i % 4) * 0.00004,
      size: 1.5 + (i % 3) * 1.1,
      alpha: 0.25 + (i % 4) * 0.15,
      phase: i * 0.9,
    }));

    let raf = 0;
    const start = performance.now();

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const drawIsoBlock = (
      cx: number,
      cy: number,
      hw: number,
      hh: number,
      depth: number,
      topColor: string,
      leftColor: string,
      rightColor: string,
      isLight: boolean,
    ) => {
      // Верхняя грань
      ctx.beginPath();
      ctx.moveTo(cx, cy - hh);
      ctx.lineTo(cx + hw, cy);
      ctx.lineTo(cx, cy + hh);
      ctx.lineTo(cx - hw, cy);
      ctx.closePath();
      ctx.fillStyle = topColor;
      ctx.fill();

      // Левая грань
      ctx.beginPath();
      ctx.moveTo(cx - hw, cy);
      ctx.lineTo(cx, cy + hh);
      ctx.lineTo(cx, cy + hh + depth);
      ctx.lineTo(cx - hw, cy + depth);
      ctx.closePath();
      ctx.fillStyle = leftColor;
      ctx.fill();

      // Правая грань
      ctx.beginPath();
      ctx.moveTo(cx + hw, cy);
      ctx.lineTo(cx, cy + hh);
      ctx.lineTo(cx, cy + hh + depth);
      ctx.lineTo(cx + hw, cy + depth);
      ctx.closePath();
      ctx.fillStyle = rightColor;
      ctx.fill();

      // Тонкая световая кромка сверху (тактильная фаска)
      ctx.beginPath();
      ctx.moveTo(cx - hw, cy);
      ctx.lineTo(cx, cy - hh);
      ctx.lineTo(cx + hw, cy);
      ctx.strokeStyle = isLight
        ? 'rgba(255, 255, 255, 0.48)'
        : 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Чёткая внутренняя грань
      ctx.beginPath();
      ctx.moveTo(cx - hw, cy);
      ctx.lineTo(cx, cy + hh);
      ctx.lineTo(cx + hw, cy);
      ctx.moveTo(cx, cy + hh);
      ctx.lineTo(cx, cy + hh + depth);
      ctx.strokeStyle = isLight
        ? 'rgba(16, 18, 22, 0.08)'
        : 'rgba(255, 255, 255, 0.09)';
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    const render = (now: number) => {
      const t = (now - start) / 1000;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      if (w <= 0 || h <= 0) {
        raf = requestAnimationFrame(render);
        return;
      }

      const isLight = document.documentElement.dataset.theme === 'light';

      // Плавная инерция параллакса
      pointerRef.current.x += (pointerRef.current.tx - pointerRef.current.x) * 0.06;
      pointerRef.current.y += (pointerRef.current.ty - pointerRef.current.y) * 0.06;
      const px = pointerRef.current.x;
      const py = pointerRef.current.y;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      // Фоновое студийное свечение вокруг диорамы (смещено вправо)
      const originX = w * 0.72 - px * 16;
      const originY = h * 0.45 - py * 12 + Math.sin(t * 1.1) * 4;

      const radial = ctx.createRadialGradient(
        originX,
        originY,
        10,
        originX,
        originY,
        Math.max(w, h) * 0.56,
      );
      radial.addColorStop(0, palette.glow);
      radial.addColorStop(0.55, isLight ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.015)');
      radial.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, w, h);

      // Мягкая тень под парящим островом
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(originX, originY + 135, 145, 36, 0, 0, Math.PI * 2);
      ctx.fillStyle = isLight ? 'rgba(16, 18, 22, 0.09)' : 'rgba(0, 0, 0, 0.42)';
      ctx.filter = 'blur(18px)';
      ctx.fill();
      ctx.restore();

      // Размер одного вокселя адаптивно к окну
      const scale = Math.max(0.78, Math.min(1.18, Math.min(w / 1180, h / 680)));
      const hw = 34 * scale;
      const hh = 18 * scale;
      const depth = 36 * scale;

      // Сортировка художником (painter's algorithm): по сумме (gx + gy), затем gz
      const sorted = [...ISLAND_VOXELS].sort((a, b) => {
        const dA = a.gx + a.gy;
        const dB = b.gx + b.gy;
        if (Math.abs(dA - dB) > 0.01) return dA - dB;
        return a.gz - b.gz;
      });

      const baseCenterOffset = 1; // центрируем 3x3 остров вокруг (1, 1)
      for (const v of sorted) {
        const rx = v.gx - baseCenterOffset;
        const ry = v.gy - baseCenterOffset;
        const bob = v.floatAmp
          ? Math.sin(t * (isRunning ? 2.1 : 1.35) + (v.phase ?? 0)) * v.floatAmp
          : 0;

        const sx = originX + (rx - ry) * hw;
        const sy = originY + (rx + ry) * hh - v.gz * depth + bob;

        const colors =
          v.kind === 'accent'
            ? [palette.accentTop, palette.accentLeft, palette.accentRight]
            : v.kind === 'stone'
              ? [palette.stoneTop, palette.stoneLeft, palette.stoneRight]
              : [palette.top, palette.left, palette.right];

        drawIsoBlock(sx, sy, hw, hh, depth, colors[0], colors[1], colors[2], isLight);
      }

      // Спокойные квадратные воксельные частицы в воздухе
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy * (isRunning ? 1.8 : 1);
        if (p.y < -0.05) {
          p.y = 1.05;
          p.x = ((p.x * 100 + 37) % 100) / 100;
        }
        if (p.x < 0) p.x = 1;
        if (p.x > 1) p.x = 0;

        const flicker = 0.65 + 0.35 * Math.sin(t * 2.2 + p.phase);
        const pxPos = p.x * w - px * 8;
        const pyPos = p.y * h - py * 6;
        ctx.globalAlpha = p.alpha * flicker * (isLight ? 0.55 : 0.9);
        ctx.fillStyle = palette.particle;
        ctx.fillRect(Math.round(pxPos), Math.round(pyPos), p.size, p.size);
      }
      ctx.globalAlpha = 1;

      ctx.restore();
      raf = requestAnimationFrame(render);
    };

    render(performance.now());
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [engine, loader, isRunning]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}
