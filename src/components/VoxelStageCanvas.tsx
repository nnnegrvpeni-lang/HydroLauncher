import { useEffect, useRef, type CSSProperties } from 'react';

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
    stoneTop: '#9ba1a9',
    stoneLeft: '#888e97',
    stoneRight: '#767c85',
    glow: 'rgba(98, 184, 92, 0.16)',
    particle: 'rgba(155, 218, 146, 0.5)',
  },
  fabric: {
    top: '#ddceb0',
    left: '#a5845d',
    right: '#7a5f3f',
    accentTop: '#f0e6cf',
    accentLeft: '#c9b492',
    accentRight: '#9a825f',
    stoneTop: '#b0a99b',
    stoneLeft: '#9d9686',
    stoneRight: '#8a8374',
    glow: 'rgba(218, 198, 162, 0.15)',
    particle: 'rgba(235, 222, 196, 0.45)',
  },
  forge: {
    top: '#848e9c',
    left: '#525a66',
    right: '#414955',
    accentTop: '#ef9852',
    accentLeft: '#cf6f32',
    accentRight: '#994c1f',
    stoneTop: '#9aa2ae',
    stoneLeft: '#878e9a',
    stoneRight: '#757c88',
    glow: 'rgba(229, 132, 68, 0.18)',
    particle: 'rgba(244, 162, 92, 0.5)',
  },
  neoforge: {
    top: '#4fb091',
    left: '#4a535f',
    right: '#3c444f',
    accentTop: '#ec8d49',
    accentLeft: '#c76c2e',
    accentRight: '#8e481b',
    stoneTop: '#95a5a7',
    stoneLeft: '#829294',
    stoneRight: '#708082',
    glow: 'rgba(79, 176, 145, 0.17)',
    particle: 'rgba(118, 209, 180, 0.45)',
  },
  quilt: {
    top: '#8b79e0',
    left: '#6252b3',
    right: '#50439f',
    accentTop: '#5ec4af',
    accentLeft: '#429886',
    accentRight: '#2e6e61',
    stoneTop: '#a49eba',
    stoneLeft: '#918ba7',
    stoneRight: '#7e7895',
    glow: 'rgba(139, 121, 224, 0.17)',
    particle: 'rgba(176, 162, 245, 0.45)',
  },
  horizon: {
    top: '#757e8c',
    left: '#49505b',
    right: '#3b414a',
    accentTop: '#ea8d52',
    accentLeft: '#c76c34',
    accentRight: '#8f491f',
    stoneTop: '#9ba2af',
    stoneLeft: '#888f9c',
    stoneRight: '#767d8a',
    glow: 'rgba(234, 141, 82, 0.18)',
    particle: 'rgba(240, 168, 118, 0.45)',
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
  { dx: 3.9, dy: -1.2, dz: 3.4, kind: 'accent', scale: 0.72, amp: 2.6, phase: 0.4, speed: 0.7 },
  { dx: -2.6, dy: 3.3, dz: 3.9, kind: 'main', scale: 0.86, amp: 2.2, phase: 2.2, speed: 0.6 },
  { dx: 2.9, dy: -3.1, dz: 5.1, kind: 'stone', scale: 0.6, amp: 3, phase: 3.7, speed: 0.85 },
  { dx: 4.8, dy: 3.9, dz: 1.2, kind: 'accent', scale: 0.56, amp: 2.4, phase: 5.1, speed: 0.65 },
  { dx: 0.4, dy: -4.2, dz: 2.4, kind: 'stone', scale: 0.66, amp: 2.2, phase: 1.3, speed: 0.8 },
];

// Пылинки двигаются CSS-анимацией: в кадре нет ни одной JS-операции.
const DUST = Array.from({ length: 10 }, (_, i) => ({
  x: ((i * 37 + 13) % 88) + 6,
  y: ((i * 53 + 27) % 74) + 14,
  size: 2 + (i % 3),
  alpha: 0.12 + (i % 4) * 0.04,
  dur: 15 + (i % 5) * 3.5,
  delay: -((i * 3.7) % 24),
}));

type Pt = [number, number];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

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

// Грани чуть перекрывают друг друга, иначе на стыках просвечивает фон
// тонкой пунктирной линией.
function expandPolygon(points: Pt[], amount: number): Pt[] {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of points) {
    cx += x;
    cy += y;
  }
  cx /= points.length;
  cy /= points.length;
  return points.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [x + (dx / len) * amount, y + (dy / len) * amount] as Pt;
  });
}

function fillFace(ctx: CanvasRenderingContext2D, points: Pt[], color: string) {
  const grown = expandPolygon(points, 0.4);
  const bounds = faceBounds(grown);
  ctx.save();
  facePath(ctx, grown);
  ctx.clip();
  ctx.fillStyle = color;
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
  isLight: boolean;
  palette: Palette;
  showTop: boolean;
  showLeft: boolean;
  showRight: boolean;
}

function paintBlock(ctx: CanvasRenderingContext2D, opts: BlockPaintOptions) {
  const { sx, sy, hw, hh, depth, kind, shade, isLight, palette } = opts;

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
    fillFace(ctx, topQuad, topColor);

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
    fillFace(ctx, leftQuad, leftColor);
    if (grassBand) {
      const band = topBand(leftQuad, 0.26);
      fillFace(ctx, band, grassBand);
      strokeSegment(
        ctx,
        band[3],
        band[2],
        isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(0, 0, 0, 0.12)',
      );
    }
    sideShade(ctx, leftQuad, isLight ? 0.03 : 0.06);
  }

  if (opts.showRight) {
    fillFace(ctx, rightQuad, rightColor);
    if (grassBand) {
      const band = topBand(rightQuad, 0.26);
      fillFace(ctx, band, grassBand);
      strokeSegment(
        ctx,
        band[3],
        band[2],
        isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(0, 0, 0, 0.12)',
      );
    }
    sideShade(ctx, rightQuad, isLight ? 0.025 : 0.05);
  }

  // Ребро между боковыми гранями добавляет объём без «сетки».
  if (opts.showLeft && opts.showRight) {
    strokeSegment(
      ctx,
      [sx, sy + hh],
      [sx, sy + hh + depth],
      isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(0, 0, 0, 0.08)',
    );
  }
}

const occupiedCells = new Set(ISLAND_VOXELS.map((v) => `${v.gx},${v.gy},${v.gz}`));
const sortedIsland = [...ISLAND_VOXELS].sort(
  (a, b) => a.gx + a.gy - (b.gx + b.gy) || a.gz - b.gz,
);

interface IslandGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  shadowX: number;
  shadowY: number;
  shadowRx: number;
  shadowRy: number;
}

interface FloatGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

const cssVars = (value: Record<string, string | number>) =>
  value as unknown as CSSProperties;

function bakeIsland(
  target: HTMLCanvasElement,
  scale: number,
  dpr: number,
  isLight: boolean,
  palette: Palette,
): IslandGeometry | null {
  const hw = 36 * scale;
  const hh = 18 * scale;
  const depth = 36 * scale;

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

  target.width = Math.ceil(width * dpr);
  target.height = Math.ceil(height * dpr);
  target.style.width = `${width}px`;
  target.style.height = `${height}px`;

  const ctx = target.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  for (const v of sortedIsland) {
    const rx = v.gx - ISLAND_CENTER;
    const ry = v.gy - ISLAND_CENTER;
    const sx = (rx - ry) * hw + offsetX;
    const sy = (rx + ry) * hh - v.gz * depth + offsetY;

    const overhung =
      occupiedCells.has(`${v.gx + 1},${v.gy},${v.gz + 1}`) ||
      occupiedCells.has(`${v.gx},${v.gy + 1},${v.gz + 1}`) ||
      occupiedCells.has(`${v.gx - 1},${v.gy},${v.gz + 1}`) ||
      occupiedCells.has(`${v.gx},${v.gy - 1},${v.gz + 1}`);
    // Все блоки одного уровня одного типа — одного тона: глубину держат только
    // грани, травяной пояс и лёгкое затемнение под нависаниями. Разнобой
    // яркостей между соседними кубами читался как кривые тени.
    const shade = clamp(0.994 + v.gz * 0.004 - (overhung ? 0.012 : 0), 0.97, 1.01);

    paintBlock(ctx, {
      sx,
      sy,
      hw,
      hh,
      depth,
      kind: v.kind,
      shade,
      isLight,
      palette,
      showTop: !occupiedCells.has(`${v.gx},${v.gy},${v.gz + 1}`),
      showLeft: !occupiedCells.has(`${v.gx},${v.gy + 1},${v.gz}`),
      showRight: !occupiedCells.has(`${v.gx + 1},${v.gy},${v.gz}`),
    });
  }

  return {
    x: minX - pad,
    y: minY - pad,
    w: width,
    h: height,
    shadowX: hw * 0.6,
    shadowY: maxY + 8 * scale,
    shadowRx: (maxX - minX) * 0.36,
    shadowRy: 13 * scale,
  };
}

function bakeFloat(
  target: HTMLCanvasElement,
  float: FloatingVoxel,
  hw: number,
  hh: number,
  depth: number,
  dpr: number,
  isLight: boolean,
  palette: Palette,
): FloatGeometry {
  const fw = hw * float.scale;
  const fh = hh * float.scale;
  const fd = depth * float.scale;
  const floatPad = 2;
  const w = Math.ceil(fw * 2) + floatPad * 2;
  const h = Math.ceil(fh * 2 + fd) + floatPad * 2;

  target.width = Math.ceil(w * dpr);
  target.height = Math.ceil(h * dpr);
  target.style.width = `${w}px`;
  target.style.height = `${h}px`;

  const ctx = target.getContext('2d');
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    paintBlock(ctx, {
      sx: floatPad + fw,
      sy: floatPad + fh,
      hw: fw,
      hh: fh,
      depth: fd,
      kind: float.kind,
      shade: 0.98,
      isLight,
      palette,
      showTop: true,
      showLeft: true,
      showRight: true,
    });
  }

  return {
    x: (float.dx - float.dy) * hw - fw - floatPad,
    y: (float.dx + float.dy) * hh - float.dz * depth - fh - floatPad,
    w,
    h,
  };
}

export function VoxelStageCanvas({
  engine,
  loader,
  isRunning = false,
}: VoxelStageCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const islandRef = useRef<HTMLCanvasElement>(null);
  const islandWrapRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const floatWraps = useRef<Array<HTMLDivElement | null>>([]);
  const floatCanvases = useRef<Array<HTMLCanvasElement | null>>([]);

  const paletteKey = engine === 'horizon' ? 'horizon' : loader;
  const palette = PALETTES[paletteKey] ?? PALETTES.vanilla;

  useEffect(() => {
    const stage = stageRef.current;
    const islandCanvas = islandRef.current;
    if (!stage || !islandCanvas) return;

    let islandGeo: IslandGeometry | null = null;
    let floatGeo: FloatGeometry[] = [];
    let metric = { hw: 0, hh: 0, depth: 0 };
    let lastKey = '';
    let timer = 0;

    // Пересобираем сцену только при смене палитры, темы, масштаба или dpr.
    const bake = (scale: number, dpr: number, isLight: boolean) => {
      const geo = bakeIsland(islandCanvas, scale, dpr, isLight, palette);
      if (!geo) return false;
      islandGeo = geo;
      metric = { hw: 36 * scale, hh: 18 * scale, depth: 36 * scale };
      floatGeo = FLOATING_VOXELS.map((f, i) => {
        const canvas = floatCanvases.current[i];
        if (!canvas) return { x: 0, y: 0, w: 0, h: 0 };
        return bakeFloat(
          canvas,
          f,
          metric.hw,
          metric.hh,
          metric.depth,
          dpr,
          isLight,
          palette,
        );
      });
      return true;
    };

    const layout = () => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      if (w < 40 || h < 40) return;

      // Запекаем с двукратным запасом: движение на доли пикселя остаётся
      // плавным, без «прыжков» nearest-neighbor.
      const dpr = Math.min((window.devicePixelRatio || 1) * 2, 3);
      const scale = Math.round(clamp(Math.min(w / 1180, h / 680), 0.72, 1.16) * 40) / 40;
      const isLight = document.documentElement.dataset.theme === 'light';
      const key = `${paletteKey}|${isLight ? 'light' : 'dark'}|${scale.toFixed(3)}|${dpr}`;

      if (key !== lastKey) {
        if (!bake(scale, dpr, isLight)) return;
        lastKey = key;
      }
      if (!islandGeo) return;

      const islandLeft = Math.round(w * 0.72 - islandGeo.w / 2);
      const islandTop = Math.round(h * 0.5 - islandGeo.h / 2);

      const wrap = islandWrapRef.current;
      if (wrap) {
        wrap.style.left = `${islandLeft}px`;
        wrap.style.top = `${islandTop}px`;
        wrap.style.width = `${islandGeo.w}px`;
        wrap.style.height = `${islandGeo.h}px`;
      }

      const shadow = shadowRef.current;
      if (shadow) {
        const cx = islandLeft + (islandGeo.shadowX - islandGeo.x);
        const cy = islandTop + (islandGeo.shadowY - islandGeo.y);
        shadow.style.left = `${Math.round(cx - islandGeo.shadowRx)}px`;
        shadow.style.top = `${Math.round(cy - islandGeo.shadowRy)}px`;
        shadow.style.width = `${Math.round(islandGeo.shadowRx * 2)}px`;
        shadow.style.height = `${Math.round(islandGeo.shadowRy * 2)}px`;
      }

      floatWraps.current.forEach((el, i) => {
        const g = floatGeo[i];
        if (!el || !g || !islandGeo) return;
        el.style.left = `${Math.round(islandLeft - islandGeo.x + g.x)}px`;
        el.style.top = `${Math.round(islandTop - islandGeo.y + g.y)}px`;
        el.style.width = `${g.w}px`;
        el.style.height = `${g.h}px`;
      });
    };

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(layout, 90);
    };

    layout();

    const ro = new ResizeObserver(schedule);
    ro.observe(stage);

    const mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Параллакс: только CSS-переменные, без перерисовки канваса.
    const onMove = (event: PointerEvent) => {
      const nx = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      const ny = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
      stage.style.setProperty('--par-x', nx.toFixed(3));
      stage.style.setProperty('--par-y', ny.toFixed(3));
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('pointermove', onMove);
    };
  }, [paletteKey, palette]);

  return (
    <div
      ref={stageRef}
      className={`hl-voxel-stage pointer-events-none absolute inset-0${isRunning ? ' is-running' : ''}`}
      style={cssVars({ '--dust': palette.particle })}
      aria-hidden
    >
      <div
        className="hl-voxel-glow"
        style={{
          background: `radial-gradient(ellipse 48% 60% at 72% 52%, ${palette.glow} 0%, rgba(0, 0, 0, 0) 74%)`,
        }}
      />

      {DUST.map((d, i) => (
        <div
          key={`dust-${i}`}
          className="hl-voxel-dust"
          style={cssVars({
            left: `${d.x}%`,
            top: `${d.y}%`,
            '--size': `${d.size}px`,
            '--alpha': d.alpha.toFixed(2),
            '--dur': `${d.dur}s`,
            animationDelay: `${d.delay}s`,
          })}
        />
      ))}

      <div className="hl-voxel-scene">
        <div ref={shadowRef} className="hl-voxel-shadow" />

        <div ref={islandWrapRef} className="hl-voxel-piece hl-voxel-island">
          <canvas ref={islandRef} />
        </div>

        {FLOATING_VOXELS.map((f, i) => (
          <div
            key={`float-${i}`}
            ref={(el) => {
              floatWraps.current[i] = el;
            }}
            className="hl-voxel-piece"
            style={cssVars({
              '--bob': `${f.amp}px`,
              '--dur': `${((2 * Math.PI) / f.speed).toFixed(2)}s`,
              animationDelay: `${(-(f.phase / f.speed)).toFixed(2)}s`,
            })}
          >
            <canvas
              ref={(el) => {
                floatCanvases.current[i] = el;
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
