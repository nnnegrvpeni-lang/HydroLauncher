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
    top: '#6cb15f',
    left: '#8a6547',
    right: '#6b5138',
    accentTop: '#8ccf84',
    accentLeft: '#5f8f53',
    accentRight: '#466b3d',
    stoneTop: '#757c87',
    stoneLeft: '#5a616b',
    stoneRight: '#464c56',
    glow: 'rgba(98, 184, 92, 0.16)',
    particle: 'rgba(155, 218, 146, 0.55)',
  },
  fabric: {
    top: '#ddceb0',
    left: '#a5845d',
    right: '#7a5f3f',
    accentTop: '#f0e6cf',
    accentLeft: '#c9b492',
    accentRight: '#9a825f',
    stoneTop: '#7d786e',
    stoneLeft: '#666158',
    stoneRight: '#4e4942',
    glow: 'rgba(218, 198, 162, 0.15)',
    particle: 'rgba(235, 222, 196, 0.5)',
  },
  forge: {
    top: '#848e9c',
    left: '#525a66',
    right: '#414955',
    accentTop: '#ef9852',
    accentLeft: '#cf6f32',
    accentRight: '#994c1f',
    stoneTop: '#6a7280',
    stoneLeft: '#4b525e',
    stoneRight: '#373d47',
    glow: 'rgba(229, 132, 68, 0.18)',
    particle: 'rgba(244, 162, 92, 0.6)',
  },
  neoforge: {
    top: '#4fb091',
    left: '#4a535f',
    right: '#3c444f',
    accentTop: '#ec8d49',
    accentLeft: '#c76c2e',
    accentRight: '#8e481b',
    stoneTop: '#687a7b',
    stoneLeft: '#4a585a',
    stoneRight: '#374144',
    glow: 'rgba(79, 176, 145, 0.17)',
    particle: 'rgba(118, 209, 180, 0.55)',
  },
  quilt: {
    top: '#8b79e0',
    left: '#6252b3',
    right: '#50439f',
    accentTop: '#5ec4af',
    accentLeft: '#429886',
    accentRight: '#2e6e61',
    stoneTop: '#7a74a0',
    stoneLeft: '#565175',
    stoneRight: '#423c5c',
    glow: 'rgba(139, 121, 224, 0.17)',
    particle: 'rgba(176, 162, 245, 0.55)',
  },
  horizon: {
    top: '#757e8c',
    left: '#49505b',
    right: '#3b414a',
    accentTop: '#ea8d52',
    accentLeft: '#c76c34',
    accentRight: '#8f491f',
    stoneTop: '#687080',
    stoneLeft: '#4a515b',
    stoneRight: '#343941',
    glow: 'rgba(234, 141, 82, 0.18)',
    particle: 'rgba(240, 168, 118, 0.55)',
  },
};

type VoxelKind = 'main' | 'accent' | 'stone';

interface VoxelSpec {
  gx: number;
  gy: number;
  gz: number;
  kind: VoxelKind;
}

interface FloatingVoxel {
  dx: number;
  dy: number;
  dz: number;
  kind: VoxelKind;
  scale: number;
  amp: number;
  phase: number;
  speed: number;
}

const ISLAND_CENTER = 2;

const isRoundedCell = (dx: number, dy: number, radius: number) =>
  Math.max(Math.abs(dx), Math.abs(dy)) <= radius &&
  !(Math.abs(dx) === radius && Math.abs(dy) === radius);

// Парящий остров: каменная вершина, ступенчатый пояс, травяная шапка,
// небольшой холм с акцентным вокселем и каменный валун.
function buildIsland(): VoxelSpec[] {
  const voxels: VoxelSpec[] = [];
  const add = (dx: number, dy: number, gz: number, kind: VoxelKind) => {
    voxels.push({ gx: dx + ISLAND_CENTER, gy: dy + ISLAND_CENTER, gz, kind });
  };

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) add(dx, dy, 0, 'stone');
  }

  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      if (!isRoundedCell(dx, dy, 2)) continue;
      if ((Math.abs(dx) === 2 && dy === 0) || (dx === 0 && Math.abs(dy) === 2)) continue;
      add(dx, dy, 1, 'stone');
    }
  }

  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      if (!isRoundedCell(dx, dy, 2)) continue;
      // Эрозия на дальней кромке: виден каменный уступ под травой.
      if (dx === 0 && dy === -2) continue;
      add(dx, dy, 2, 'main');
    }
  }

  add(1, -1, 3, 'main');
  add(2, -1, 3, 'main');
  add(1, 0, 3, 'main');
  add(1, -1, 4, 'accent');
  add(-1, 1, 3, 'stone');

  return voxels;
}

const ISLAND_VOXELS = buildIsland();

const FLOATING_VOXELS: FloatingVoxel[] = [
  { dx: 3.9, dy: -1.2, dz: 3.4, kind: 'accent', scale: 0.72, amp: 1.4, phase: 0.4, speed: 0.7 },
  { dx: -2.6, dy: 3.3, dz: 3.9, kind: 'main', scale: 0.86, amp: 1.2, phase: 2.2, speed: 0.6 },
  { dx: 2.9, dy: -3.1, dz: 5.1, kind: 'stone', scale: 0.6, amp: 1.5, phase: 3.7, speed: 0.85 },
  { dx: 4.8, dy: 3.9, dz: 1.2, kind: 'accent', scale: 0.56, amp: 1.3, phase: 5.1, speed: 0.65 },
  { dx: 0.4, dy: -4.2, dz: 2.4, kind: 'stone', scale: 0.66, amp: 1.2, phase: 1.3, speed: 0.8 },
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

interface FloatSprite {
  img: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
  amp: number;
  phase: number;
  speed: number;
}

interface Scene {
  key: string;
  island: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
  shadowX: number;
  shadowY: number;
  shadowRx: number;
  shadowRy: number;
  floats: FloatSprite[];
}

type Pt = [number, number];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function mulberry32(seed: number) {
  let a = Math.floor(seed * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseHex(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(value) || hex.length !== 7) return [128, 128, 128];
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function toHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function shadeColor(hex: string, factor: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex(
    clamp(Math.round(r * factor), 0, 255),
    clamp(Math.round(g * factor), 0, 255),
    clamp(Math.round(b * factor), 0, 255),
  );
}

// Небольшая бесшовная плитка «пиксельной» текстуры: базовый цвет + шум.
function createTextureTile(color: string, seed: number, texel: number): HTMLCanvasElement {
  const cells = 7;
  const size = cells * texel;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const tileCtx = tile.getContext('2d');
  if (!tileCtx) return tile;

  tileCtx.fillStyle = color;
  tileCtx.fillRect(0, 0, size, size);

  const rand = mulberry32(seed);
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      const n = rand();
      if (n > 0.74) {
        tileCtx.fillStyle = `rgba(255, 255, 255, ${(0.03 + (n - 0.74) * 0.14).toFixed(3)})`;
      } else if (n < 0.24) {
        tileCtx.fillStyle = `rgba(0, 0, 0, ${(0.02 + (0.24 - n) * 0.1).toFixed(3)})`;
      } else {
        continue;
      }
      tileCtx.fillRect(x * texel, y * texel, texel, texel);
    }
  }
  return tile;
}

const patternCaches = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

function texturePattern(
  ctx: CanvasRenderingContext2D,
  color: string,
  seed: number,
  texel: number,
): CanvasPattern | null {
  let cache = patternCaches.get(ctx);
  if (!cache) {
    cache = new Map<string, CanvasPattern>();
    patternCaches.set(ctx, cache);
  }
  const key = `${color}|${seed.toFixed(4)}|${texel}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const pattern = ctx.createPattern(createTextureTile(color, seed, texel), 'repeat');
  if (!pattern) return null;
  cache.set(key, pattern);
  return pattern;
}

function facePath(ctx: CanvasRenderingContext2D, points: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.closePath();
}

function faceBounds(points: Pt[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    x: Math.floor(minX),
    y: Math.floor(minY),
    w: Math.ceil(maxX - minX) + 1,
    h: Math.ceil(maxY - minY) + 1,
  };
}

function fillFace(
  ctx: CanvasRenderingContext2D,
  points: Pt[],
  color: string,
  texel: number,
  seed: number,
) {
  const bounds = faceBounds(points);
  ctx.save();
  facePath(ctx, points);
  ctx.clip();
  const pattern = texturePattern(ctx, color, seed, texel);
  ctx.fillStyle = pattern ?? color;
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.restore();
}

function sideShade(ctx: CanvasRenderingContext2D, quad: Pt[], alpha: number) {
  const bounds = faceBounds(quad);
  const [topLeft] = quad;
  const bottomLeft = quad[3];
  ctx.save();
  facePath(ctx, quad);
  ctx.clip();
  const gradient = ctx.createLinearGradient(
    topLeft[0],
    topLeft[1],
    bottomLeft[0],
    bottomLeft[1],
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, `rgba(0, 0, 0, ${alpha})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.restore();
}

const lerpPt = (from: Pt, to: Pt, t: number): Pt => [
  from[0] + (to[0] - from[0]) * t,
  from[1] + (to[1] - from[1]) * t,
];

// Верхняя полоса грани (травяной «свисающий» край на боковых гранях).
function topBand(quad: Pt[], t: number): Pt[] {
  const [a, b, c, d] = quad;
  return [a, b, lerpPt(b, c, t), lerpPt(a, d, t)];
}

function strokeSegment(
  ctx: CanvasRenderingContext2D,
  from: Pt,
  to: Pt,
  color: string,
  width = 1,
) {
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

interface BlockPaintOptions {
  sx: number;
  sy: number;
  hw: number;
  hh: number;
  depth: number;
  kind: VoxelKind;
  shade: number;
  texel: number;
  isLight: boolean;
  palette: Palette;
  showTop: boolean;
  showLeft: boolean;
  showRight: boolean;
  seedSalt?: number;
}

function paintBlock(ctx: CanvasRenderingContext2D, opts: BlockPaintOptions) {
  const { sx, sy, hw, hh, depth, kind, shade, texel, isLight, palette } = opts;
  const salt = opts.seedSalt ?? 0;

  const colors =
    kind === 'accent'
      ? [palette.accentTop, palette.accentLeft, palette.accentRight]
      : kind === 'stone'
        ? [palette.stoneTop, palette.stoneLeft, palette.stoneRight]
        : [palette.top, palette.left, palette.right];

  const topColor = shadeColor(colors[0], shade);
  const leftColor = shadeColor(colors[1], shade);
  const rightColor = shadeColor(colors[2], shade);
  const grassBand = kind === 'main' ? shadeColor(palette.top, shade * 0.82) : null;

  const topSeed = hashString(`${kind}-top`) + salt;
  const leftSeed = hashString(`${kind}-left`) + salt;
  const rightSeed = hashString(`${kind}-right`) + salt;

  const topQuad: Pt[] = [
    [sx, sy - hh],
    [sx + hw, sy],
    [sx, sy + hh],
    [sx - hw, sy],
  ];
  const leftQuad: Pt[] = [
    [sx - hw, sy],
    [sx, sy + hh],
    [sx, sy + hh + depth],
    [sx - hw, sy + depth],
  ];
  const rightQuad: Pt[] = [
    [sx + hw, sy],
    [sx, sy + hh],
    [sx, sy + hh + depth],
    [sx + hw, sy + depth],
  ];

  if (opts.showTop) {
    fillFace(ctx, topQuad, topColor, texel, topSeed);

    // Мягкий блик по задним рёбрам верхней грани.
    ctx.beginPath();
    ctx.moveTo(sx - hw + 0.5, sy);
    ctx.lineTo(sx, sy - hh + 0.5);
    ctx.lineTo(sx + hw - 0.5, sy);
    ctx.strokeStyle = isLight ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (opts.showLeft) {
    fillFace(ctx, leftQuad, leftColor, texel, leftSeed);
    if (grassBand) {
      const band = topBand(leftQuad, 0.26);
      fillFace(ctx, band, grassBand, texel, leftSeed);
      strokeSegment(
        ctx,
        band[3],
        band[2],
        isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 0, 0, 0.16)',
      );
    }
    sideShade(ctx, leftQuad, isLight ? 0.035 : 0.08);
  }

  if (opts.showRight) {
    fillFace(ctx, rightQuad, rightColor, texel, rightSeed);
    if (grassBand) {
      const band = topBand(rightQuad, 0.26);
      fillFace(ctx, band, grassBand, texel, rightSeed);
      strokeSegment(
        ctx,
        band[3],
        band[2],
        isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 0, 0, 0.16)',
      );
    }
    sideShade(ctx, rightQuad, isLight ? 0.03 : 0.07);
  }

  // Ребро между боковыми гранями добавляет объём без «сетки».
  if (opts.showLeft && opts.showRight) {
    strokeSegment(
      ctx,
      [sx, sy + hh],
      [sx, sy + hh + depth],
      isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(0, 0, 0, 0.1)',
    );
  }
}

export function VoxelStageCanvas({
  engine,
  loader,
  isRunning = false,
}: VoxelStageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ tx: 0, ty: 0, x: 0, y: 0 });
  const paletteKey = engine === 'horizon' ? 'horizon' : loader;
  const palette = PALETTES[paletteKey] ?? PALETTES.vanilla;

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

    const particles: Particle[] = Array.from({ length: 16 }, (_, i) => ({
      x: ((i * 73) % 100) / 100,
      y: ((i * 41) % 100) / 100,
      vx: (i % 5 - 2) * 0.000025,
      vy: -0.00008 - (i % 4) * 0.00002,
      size: 1.2 + (i % 3) * 0.8,
      alpha: 0.16 + (i % 4) * 0.1,
      phase: i * 0.9,
    }));

    const occupied = new Set(ISLAND_VOXELS.map((v) => `${v.gx},${v.gy},${v.gz}`));
    const sortedIsland = [...ISLAND_VOXELS].sort(
      (a, b) => a.gx + a.gy - (b.gx + b.gy) || a.gz - b.gz,
    );

    const bakeScene = (scale: number, dpr: number, isLight: boolean): Scene | null => {
      const hw = 36 * scale;
      const hh = 18 * scale;
      const depth = 36 * scale;
      const texel = Math.max(2, Math.round(hw / 7));

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const v of sortedIsland) {
        const rx = v.gx - ISLAND_CENTER;
        const ry = v.gy - ISLAND_CENTER;
        const sx = (rx - ry) * hw;
        const sy = (rx + ry) * hh - v.gz * depth;
        minX = Math.min(minX, sx - hw);
        maxX = Math.max(maxX, sx + hw);
        minY = Math.min(minY, sy - hh);
        maxY = Math.max(maxY, sy + hh + depth);
      }

      const pad = 3;
      const width = Math.ceil(maxX - minX) + pad * 2;
      const height = Math.ceil(maxY - minY) + pad * 2;
      const offsetX = pad - minX;
      const offsetY = pad - minY;

      const island = document.createElement('canvas');
      island.width = Math.ceil(width * dpr);
      island.height = Math.ceil(height * dpr);
      const islandCtx = island.getContext('2d');
      if (!islandCtx) return null;
      islandCtx.scale(dpr, dpr);

      for (const v of sortedIsland) {
        const rx = v.gx - ISLAND_CENTER;
        const ry = v.gy - ISLAND_CENTER;
        const sx = (rx - ry) * hw + offsetX;
        const sy = (rx + ry) * hh - v.gz * depth + offsetY;

        const jitter = hashString(`${v.gx}:${v.gy}:${v.gz}`) - 0.5;
        const overhung =
          occupied.has(`${v.gx + 1},${v.gy},${v.gz + 1}`) ||
          occupied.has(`${v.gx},${v.gy + 1},${v.gz + 1}`) ||
          occupied.has(`${v.gx - 1},${v.gy},${v.gz + 1}`) ||
          occupied.has(`${v.gx},${v.gy - 1},${v.gz + 1}`);
        const shade = clamp(
          0.85 + v.gz * 0.04 + jitter * 0.07 - (overhung ? 0.035 : 0),
          0.78,
          1.02,
        );

        paintBlock(islandCtx, {
          sx,
          sy,
          hw,
          hh,
          depth,
          kind: v.kind,
          shade,
          texel,
          isLight,
          palette,
          seedSalt: jitter * 1000,
          showTop: !occupied.has(`${v.gx},${v.gy},${v.gz + 1}`),
          showLeft: !occupied.has(`${v.gx},${v.gy + 1},${v.gz}`),
          showRight: !occupied.has(`${v.gx + 1},${v.gy},${v.gz}`),
        });
      }

      const floats: FloatSprite[] = [];
      for (const [floatIndex, f] of FLOATING_VOXELS.entries()) {
        const fw = hw * f.scale;
        const fh = hh * f.scale;
        const fd = depth * f.scale;
        const floatPad = 2;
        const w = Math.ceil(fw * 2) + floatPad * 2;
        const h = Math.ceil(fh * 2 + fd) + floatPad * 2;

        const sprite = document.createElement('canvas');
        sprite.width = Math.ceil(w * dpr);
        sprite.height = Math.ceil(h * dpr);
        const spriteCtx = sprite.getContext('2d');
        if (!spriteCtx) continue;
        spriteCtx.scale(dpr, dpr);

        paintBlock(spriteCtx, {
          sx: floatPad + fw,
          sy: floatPad + fh,
          hw: fw,
          hh: fh,
          depth: fd,
          kind: f.kind,
          shade: 0.98,
          texel: Math.max(2, Math.round(fw / 7)),
          isLight,
          palette,
          seedSalt: floatIndex * 137.5,
          showTop: true,
          showLeft: true,
          showRight: true,
        });

        floats.push({
          img: sprite,
          x: (f.dx - f.dy) * hw - fw - floatPad,
          y: (f.dx + f.dy) * hh - f.dz * depth - fh - floatPad,
          w,
          h,
          amp: f.amp * scale,
          phase: f.phase,
          speed: f.speed,
        });
      }

      return {
        key: '',
        island,
        x: minX - pad,
        y: minY - pad,
        w: width,
        h: height,
        shadowX: hw * 0.6,
        shadowY: maxY + 8 * scale,
        shadowRx: (maxX - minX) * 0.36,
        shadowRy: 13 * scale,
        floats,
      };
    };

    let scene: Scene | null = null;
    let raf = 0;
    const start = performance.now();

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      const nextW = Math.floor(w * dpr);
      const nextH = Math.floor(h * dpr);
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
        ctx.imageSmoothingEnabled = false;
      }
    };

    ctx.imageSmoothingEnabled = false;

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const render = (now: number) => {
      const t = (now - start) / 1000;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      if (w <= 0 || h <= 0) {
        raf = requestAnimationFrame(render);
        return;
      }

      const isLight = document.documentElement.dataset.theme === 'light';
      const scale = Math.round(clamp(Math.min(w / 1180, h / 680), 0.72, 1.16) * 40) / 40;
      const cacheKey = `${paletteKey}|${isLight ? 'light' : 'dark'}|${scale.toFixed(3)}|${dpr}`;
      if (!scene || scene.key !== cacheKey) {
        const baked = bakeScene(scale, dpr, isLight);
        if (baked) scene = { ...baked, key: cacheKey };
      }

      pointerRef.current.x += (pointerRef.current.tx - pointerRef.current.x) * 0.05;
      pointerRef.current.y += (pointerRef.current.ty - pointerRef.current.y) * 0.05;
      const px = pointerRef.current.x;
      const py = pointerRef.current.y;

      const snap = (value: number) => Math.round(value * dpr) / dpr;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const originX = w * 0.72 - (scene ? scene.x + scene.w / 2 : 0) - px * 10;
      const originY =
        h * 0.5 -
        (scene ? scene.y + scene.h / 2 : 0) -
        py * 7 +
        Math.sin(t * 0.4) * 1.3;

      if (scene) {
        // Мягкая тень под островом: радиальный градиент вместо дорогого filter: blur.
        const shadowRx = scene.shadowRx;
        const shadowRy = scene.shadowRy;
        ctx.save();
        ctx.translate(originX + scene.shadowX, originY + scene.shadowY);
        ctx.scale(1, shadowRy / shadowRx);
        const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowRx);
        shadow.addColorStop(0, isLight ? 'rgba(16, 18, 22, 0.14)' : 'rgba(0, 0, 0, 0.38)');
        shadow.addColorStop(0.6, isLight ? 'rgba(16, 18, 22, 0.05)' : 'rgba(0, 0, 0, 0.15)');
        shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.arc(0, 0, shadowRx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.drawImage(
          scene.island,
          snap(originX + scene.x),
          snap(originY + scene.y),
          scene.island.width / dpr,
          scene.island.height / dpr,
        );

        const speedMul = isRunning ? 1.5 : 1;
        for (const f of scene.floats) {
          const bob = Math.sin(t * f.speed * speedMul + f.phase) * f.amp;
          ctx.drawImage(
            f.img,
            snap(originX + f.x),
            snap(originY + f.y + bob),
            f.img.width / dpr,
            f.img.height / dpr,
          );
        }
      }

      // Спокойные квадратные воксельные частицы в воздухе.
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy * (isRunning ? 1.8 : 1);
        if (p.y < -0.05) {
          p.y = 1.05;
          p.x = ((p.x * 100 + 37) % 100) / 100;
        }
        if (p.x < 0) p.x = 1;
        if (p.x > 1) p.x = 0;

        const flicker = 0.75 + 0.25 * Math.sin(t * 1.6 + p.phase);
        const posX = p.x * w - px * 8;
        const posY = p.y * h - py * 6;
        ctx.globalAlpha = p.alpha * flicker * (isLight ? 0.45 : 0.7);
        ctx.fillStyle = palette.particle;
        ctx.fillRect(Math.round(posX), Math.round(posY), p.size, p.size);
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
  }, [engine, loader, isRunning, palette, paletteKey]);

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 48% 60% at 72% 52%, ${palette.glow} 0%, rgba(0, 0, 0, 0) 74%)`,
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
