/**
 * Dev-моки Tauri-команд. Активны только когда приложение открыто в обычном
 * браузере (нет __TAURI_INTERNALS__) и это dev-сборка.
 *
 * Нужны исключительно для разработки визуала без перезапуска Rust-сборки.
 */

import type {
  AccountsStore,
  AppSettings,
  CapeInfo,
  DownloadJob,
  Instance,
  JavaRuntime,
  OfflineAccount,
  SkinProfile,
  SkinVariant,
  SystemInfo,
  VersionCatalog,
} from './types';

const now = () => new Date().toISOString();

/** `?theme=light` или `?theme=night` в dev-режиме — быстрая проверка тем. */
function initialTheme(): AppSettings['theme'] {
  const param = new URLSearchParams(window.location.search).get('theme');
  if (param === 'light' || param === 'night') return param;
  return 'dark';
}

function offlineUuid(name: string): string {
  // Упрощённая заглушка — в реальном бэкенде MD5-стандарт.
  const hash = Array.from(name)
    .reduce((acc, ch) => (acc * 33 + ch.charCodeAt(0)) >>> 0, 7)
    .toString(16)
    .padStart(8, '0');
  return `${hash}-1111-3333-8444-${(hash + hash).slice(0, 12)}`;
}

interface MockPart {
  u: number;
  v: number;
  w: number;
  h: number;
  d: number;
  /** Цвета граней: верх, низ, бока, перед, зад. */
  top: string;
  bottom: string;
  side: string;
  front: string;
  back: string;
}

/**
 * Раскладывает деталь по развёртке Minecraft 64×64: верх, низ, бока,
 * перед и зад получают свои прямоугольники в текстуре.
 */
function paintMockPart(ctx: CanvasRenderingContext2D, part: MockPart) {
  const { u, v, w, h, d } = part;
  const rect = (x: number, y: number, rw: number, rh: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, rw, rh);
  };

  rect(u + d, v, w, d, part.top);
  rect(u + d + w, v, w, d, part.bottom);
  rect(u, v + d, d, h, part.side);
  rect(u + d, v + d, w, h, part.front);
  rect(u + d + w, v + d, d, h, part.side);
  rect(u + d + w + d, v + d, w, h, part.back);
}

/**
 * Текстура-заглушка для dev-режима: обычный скин 64×64, нарисованный в canvas.
 * Нужен, чтобы 3D-превью в браузере показывало объёмную фигуру, а не заливку.
 */
function mockSkinTexture(): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const skin = '#c9a27a';
  const skinShade = '#b78f6b';
  const hair = '#4a3524';
  const shirt = '#9fb8a4';
  const shirtShade = '#8aa38f';
  const pants = '#4b5a52';
  const pantsShade = '#3d4a43';
  const shoes = '#2f3833';

  const parts: MockPart[] = [
    { u: 0, v: 0, w: 8, h: 8, d: 8, top: hair, bottom: skinShade, side: hair, front: skin, back: hair },
    { u: 16, v: 16, w: 8, h: 12, d: 4, top: shirt, bottom: shirtShade, side: shirtShade, front: shirt, back: shirt },
    { u: 40, v: 16, w: 4, h: 12, d: 4, top: shirt, bottom: skinShade, side: shirtShade, front: shirt, back: shirt },
    { u: 32, v: 48, w: 4, h: 12, d: 4, top: shirt, bottom: skinShade, side: shirtShade, front: shirt, back: shirt },
    { u: 0, v: 16, w: 4, h: 12, d: 4, top: pants, bottom: shoes, side: pantsShade, front: pants, back: pantsShade },
    { u: 16, v: 48, w: 4, h: 12, d: 4, top: pants, bottom: shoes, side: pantsShade, front: pants, back: pantsShade },
  ];

  parts.forEach((part) => paintMockPart(ctx, part));

  // Лицо: глаза и рот, чтобы на превью читалось направление взгляда.
  ctx.fillStyle = '#f4f4f0';
  ctx.fillRect(9, 10, 2, 2);
  ctx.fillRect(13, 10, 2, 2);
  ctx.fillStyle = '#2b3a4a';
  ctx.fillRect(10, 10, 1, 2);
  ctx.fillRect(14, 10, 1, 2);
  ctx.fillStyle = '#8f6b52';
  ctx.fillRect(11, 13, 2, 1);

  // Рукава заканчиваются кожей, иначе руки сливаются с корпусом.
  ctx.fillStyle = skin;
  ctx.fillRect(44, 28, 4, 4);
  ctx.fillRect(36, 60, 4, 4);

  return canvas.toDataURL('image/png');
}

let mockSkinVariant: SkinVariant = 'classic';
let mockSkinTextureUrl = mockSkinTexture();
let mockCapes: CapeInfo[] = [
  { id: 'cape-founder', name: 'Плащ основателя', active: true },
  { id: 'cape-cartographer', name: 'Плащ картографа', active: false },
];

function mockSkinProfile(accountId: string): SkinProfile {
  const account = accounts.accounts.find((item) => item.id === accountId);
  return {
    accountId,
    id: (account?.uuid ?? '').replace(/-/g, ''),
    name: account?.username ?? 'Player',
    variant: mockSkinVariant,
    textureUrl: 'https://example.invalid/skin.png',
    textureDataUrl: mockSkinTextureUrl,
    capes: structuredClone(mockCapes),
  };
}

let settings: AppSettings = {
  theme: initialTheme(),
  dataDir: 'C:\\HydroLauncher\\data',
  defaultMemoryMb: 4096,
  maxConcurrentDownloads: 8,
  closeOnLaunch: false,
  closeToTray: false,
  language: 'ru',
  autoBackupWorlds: false,
  backupRetention: 5,
  showSnapshots: false,
  customJavaPaths: [],
  releaseChannel: 'stable',
};

let accounts: AccountsStore = {
  activeAccountId: 'acc-1',
  accounts: [
    {
      id: 'acc-1',
      kind: 'offline',
      username: 'HydroDev',
      uuid: '3f2a91c4-1111-3333-8444-a0b1c2d3e4f5',
      createdAt: now(),
      lastUsedAt: now(),
    },
    {
      id: 'acc-2',
      kind: 'offline',
      username: 'Player',
      uuid: '8b1c22d0-1111-3333-8444-5e6f7a8b9c0d',
      createdAt: now(),
      lastUsedAt: null,
    },
  ],
};

let instances: Instance[] = [
  {
    id: 'inst-1',
    name: 'Survival 26.3',
    minecraftVersion: '26.3',
    engine: 'java',
    loader: 'fabric',
    loaderVersion: '0.16.9',
    autoUpdateHorizon: true,
    memoryMbOverride: null,
    javaPathOverride: null,
    jvmArgs: [],
    gameArgs: [],
    icon: '',
    background: '',
    createdAt: '2026-05-12T11:20:00.000Z',
    lastPlayedAt: now(),
    playTimeSeconds: 48_320,
  },
  {
    id: 'inst-2',
    name: 'Build & Redstone',
    minecraftVersion: '1.21.4',
    engine: 'java',
    loader: 'vanilla',
    loaderVersion: null,
    autoUpdateHorizon: true,
    memoryMbOverride: 6144,
    javaPathOverride: null,
    jvmArgs: [],
    gameArgs: [],
    icon: '',
    background: '',
    createdAt: '2026-06-01T08:45:00.000Z',
    lastPlayedAt: null,
    playTimeSeconds: 1_800,
  },
  {
    id: 'inst-3',
    name: 'Atmospheric',
    minecraftVersion: '1.20.1',
    engine: 'java',
    loader: 'forge',
    loaderVersion: '47.2.0',
    autoUpdateHorizon: true,
    memoryMbOverride: null,
    javaPathOverride: null,
    jvmArgs: [],
    gameArgs: [],
    icon: '',
    background: '',
    createdAt: '2026-06-20T16:10:00.000Z',
    lastPlayedAt: null,
    playTimeSeconds: 0,
  },
  {
    id: 'inst-4',
    name: 'Skyblock',
    minecraftVersion: '1.21.4',
    engine: 'java',
    loader: 'neoforge',
    loaderVersion: '21.4.12',
    autoUpdateHorizon: true,
    memoryMbOverride: null,
    javaPathOverride: null,
    jvmArgs: [],
    gameArgs: [],
    icon: '',
    background: '',
    createdAt: '2026-09-02T10:12:00.000Z',
    lastPlayedAt: '2026-11-09T18:40:00.000Z',
    playTimeSeconds: 21_600,
  },
  {
    id: 'inst-5',
    name: 'Horizon Testbed',
    minecraftVersion: '1.21.11',
    engine: 'horizon',
    loader: 'vanilla',
    loaderVersion: 'nightly',
    autoUpdateHorizon: true,
    memoryMbOverride: null,
    javaPathOverride: null,
    jvmArgs: [],
    gameArgs: [],
    icon: '',
    background: '',
    createdAt: '2026-10-11T09:05:00.000Z',
    lastPlayedAt: '2026-11-12T20:15:00.000Z',
    playTimeSeconds: 5_400,
  },
  {
    id: 'inst-6',
    name: 'Modpack Draft',
    minecraftVersion: '1.20.1',
    engine: 'java',
    loader: 'quilt',
    loaderVersion: '0.26.3',
    autoUpdateHorizon: true,
    memoryMbOverride: null,
    javaPathOverride: null,
    jvmArgs: [],
    gameArgs: [],
    icon: '',
    background: '',
    createdAt: '2026-08-19T12:00:00.000Z',
    lastPlayedAt: null,
    playTimeSeconds: 0,
  },
  {
    id: 'inst-7',
    name: 'Speedrun',
    minecraftVersion: '1.16.5',
    engine: 'java',
    loader: 'vanilla',
    loaderVersion: null,
    autoUpdateHorizon: true,
    memoryMbOverride: null,
    javaPathOverride: null,
    jvmArgs: [],
    gameArgs: [],
    icon: '',
    background: '',
    createdAt: '2026-07-04T15:30:00.000Z',
    lastPlayedAt: '2026-10-28T21:05:00.000Z',
    playTimeSeconds: 3_120,
  },
];

const runtime: JavaRuntime[] = [
  {
    path: 'C:\\Java\\jdk-21\\bin\\java.exe',
    version: '21.0.5',
    majorVersion: 21,
    vendor: 'Eclipse Temurin',
    arch: 'x86_64',
    isManaged: false,
  },
  {
    path: 'C:\\HydroLauncher\\data\\runtimes\\jdk-17\\bin\\java.exe',
    version: '17.0.13',
    majorVersion: 17,
    vendor: 'Eclipse Temurin',
    arch: 'x86_64',
    isManaged: true,
  },
];

const systemInfo: SystemInfo = {
  totalMemoryMb: 32_768,
  availableMemoryMb: 12_700,
  recommendedMemoryMb: 8192,
  cpuCores: 16,
  osName: 'Windows 11 Pro',
  arch: 'x86_64',
  defaultDataDir: settings.dataDir,
};

const releaseVersions = ['26.3', '26.2', '26.1', '1.21.11', '1.21.4', '1.21.1', '1.20.6', '1.20.1', '1.19.4', '1.18.2'];

const catalog: VersionCatalog = {
  manifest: {
    latest: { release: '26.3', snapshot: '26.4-snapshot-3' },
    versions: releaseVersions.map((id) => ({
      id,
      type: id.includes('snapshot') ? 'snapshot' : 'release',
      url: 'https://example.invalid/version.json',
      time: now(),
      releaseTime: now(),
      sha1: null,
    })),
  },
};

const running = new Set<string>();

const jobs: DownloadJob[] = [
  {
    id: 'job-demo-1',
    kind: 'prepare',
    title: 'Подготовка «Survival 26.3»',
    instanceId: 'inst-1',
    status: 'running',
    message: 'Скачивание библиотек…',
    current: 12,
    total: 30,
    percent: 40,
    error: null,
    retry: null,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: 'job-demo-2',
    kind: 'modInstall',
    title: 'Мод для «Build & Redstone»',
    instanceId: 'inst-2',
    status: 'succeeded',
    message: 'Готово',
    current: 1,
    total: 1,
    percent: 100,
    error: null,
    retry: null,
    createdAt: new Date(Date.now() - 90_000).toISOString(),
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
  },
];

function activeAccount(): OfflineAccount | null {
  return (
    accounts.accounts.find((a) => a.id === accounts.activeAccountId) ??
    accounts.accounts[0] ??
    null
  );
}

export function isMockEnabled(): boolean {
  return (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    !('__TAURI_INTERNALS__' in window)
  );
}

export async function mockInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 60));

  switch (command) {
    case 'get_settings':
      return structuredClone(settings) as T;
    case 'save_settings_cmd': {
      settings = structuredClone((args?.settings ?? settings) as AppSettings);
      return structuredClone(settings) as T;
    }
    case 'get_system_info':
      return structuredClone(systemInfo) as T;
    case 'get_storage_report':
      return {
        totalBytes: 18_700_000_000,
        categories: [
          { id: 'instances', sizeBytes: 12_400_000_000 },
          { id: 'assets', sizeBytes: 2_100_000_000 },
          { id: 'libraries', sizeBytes: 2_800_000_000 },
          { id: 'versions', sizeBytes: 900_000_000 },
          { id: 'runtimes', sizeBytes: 450_000_000 },
          { id: 'cache', sizeBytes: 50_000_000 },
          { id: 'other', sizeBytes: 0 },
        ],
        instances: instances.map((instance, index) => ({
          id: instance.id,
          name: instance.name,
          totalBytes: [5_200_000_000, 3_100_000_000, 1_600_000_000][index] ?? 850_000_000,
          worldsBytes: [3_800_000_000, 2_100_000_000, 900_000_000][index] ?? 500_000_000,
          modsBytes: [1_200_000_000, 760_000_000, 420_000_000][index] ?? 220_000_000,
          backupsBytes: 150_000_000,
          logsBytes: 5_000_000,
        })),
      } as T;
    case 'cleanup_storage':
      return 45_000_000 as T;
    case 'inspect_drop_paths':
      return ((args?.paths as string[] | undefined) ?? []).map((path) => {
        const fileName = path.split(/[\\\\/]/).pop() ?? path;
        const lower = fileName.toLowerCase();
        const kind = lower.endsWith('.mrpack') ? 'modpack'
          : lower.endsWith('.jar') ? 'mod'
          : lower.endsWith('.zip') ? 'unknown' : 'unknown';
        return { path, fileName, kind, sizeBytes: 12_000_000, isDir: false, hint: kind === 'unknown' ? 'Содержимое архива будет проверено в приложении' : null };
      }) as T;
    case 'import_drop_instance': {
      const imported: Instance = {
        id: `inst-${Date.now()}`, name: 'Импортированная сборка', minecraftVersion: '1.21.4',
        engine: 'java', loader: 'fabric', loaderVersion: '0.16.9', autoUpdateHorizon: true,
        memoryMbOverride: null, javaPathOverride: null, jvmArgs: [], gameArgs: [], icon: '',
        background: '', createdAt: now(), lastPlayedAt: null, playTimeSeconds: 0,
      };
      instances = [...instances, imported];
      return imported as T;
    }
    case 'import_drop_content':
      return { kind: 'world', instanceId: String(args?.instanceId ?? 'inst-1'), name: 'Импортированный мир' } as T;
    case 'pick_directory':
      return null as T;
    case 'validate_data_dir':
      return (args?.path ?? '') as T;
    case 'open_data_dir':
      return undefined as T;
    case 'get_loader_supported_mc_versions':
      return ['1.21.4', '1.21.1', '1.20.4', '1.20.1', '1.19.4'] as T;

    case 'get_accounts':
      return structuredClone(accounts) as T;
    case 'create_account': {
      const username = String(args?.username ?? '').trim();
      if (username.length < 3) throw 'Никнейм должен содержать от 3 до 16 символов';
      if (accounts.accounts.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
        throw `Аккаунт с ником '${username}' уже существует`;
      }
      const account: OfflineAccount = {
        id: `acc-${Date.now()}`,
        kind: 'offline',
        username,
        uuid: offlineUuid(username),
        createdAt: now(),
        lastUsedAt: null,
      };
      accounts.accounts.push(account);
      accounts.activeAccountId ??= account.id;
      return structuredClone(accounts) as T;
    }
    case 'set_active_account':
      accounts.activeAccountId = String(args?.accountId);
      return structuredClone(accounts) as T;
    case 'rename_account': {
      const account = accounts.accounts.find((a) => a.id === args?.accountId);
      if (account) {
        account.username = String(args?.username);
        account.uuid = offlineUuid(account.username);
      }
      return structuredClone(accounts) as T;
    }
    case 'delete_account': {
      accounts.accounts = accounts.accounts.filter((a) => a.id !== args?.accountId);
      if (accounts.activeAccountId === args?.accountId) {
        accounts.activeAccountId = accounts.accounts[0]?.id ?? null;
      }
      return structuredClone(accounts) as T;
    }
    case 'get_active_account':
      return structuredClone(activeAccount()) as T;
    case 'microsoft_login': {
      const existing = accounts.accounts.find((a) => a.kind === 'microsoft');
      if (existing) {
        accounts.activeAccountId = existing.id;
      } else {
        const account: OfflineAccount = {
          id: `acc-ms-${Date.now()}`,
          kind: 'microsoft',
          username: 'Player',
          uuid: '8b1c22d0-1111-3333-8444-5e6f7a8b9c0d',
          createdAt: now(),
          lastUsedAt: now(),
        };
        accounts.accounts.push(account);
        accounts.activeAccountId = account.id;
      }
      return structuredClone(accounts) as T;
    }

    case 'get_skin':
      return mockSkinProfile(String(args?.accountId)) as T;
    case 'upload_skin':
      mockSkinVariant = (args?.variant === 'slim' ? 'slim' : 'classic') as SkinVariant;
      mockSkinTextureUrl = mockSkinTexture() ?? mockSkinTextureUrl;
      return mockSkinProfile(String(args?.accountId)) as T;
    case 'reset_skin':
      mockSkinVariant = 'classic';
      return mockSkinProfile(String(args?.accountId)) as T;
    case 'equip_cape': {
      const capeId = String(args?.capeId);
      mockCapes = mockCapes.map((cape) => ({ ...cape, active: cape.id === capeId }));
      return mockSkinProfile(String(args?.accountId)) as T;
    }
    case 'remove_cape':
      mockCapes = mockCapes.map((cape) => ({ ...cape, active: false }));
      return mockSkinProfile(String(args?.accountId)) as T;
    case 'pick_skin_file':
      return null as T;

    case 'get_instances':
      return structuredClone(instances) as T;
    case 'create_instance': {
      const request = args?.request as {
        name: string;
        minecraftVersion: string;
        engine: Instance['engine'];
        loader: Instance['loader'];
        icon?: string | null;
        background?: string | null;
      };
      const instance: Instance = {
        id: `inst-${Date.now()}`,
        name: request.name,
        minecraftVersion: request.minecraftVersion,
        engine: request.engine,
        loader: request.loader,
        loaderVersion: null,
        autoUpdateHorizon: true,
        memoryMbOverride: null,
        javaPathOverride: null,
        jvmArgs: [],
        gameArgs: [],
        icon: request.icon ?? '',
        background: request.background ?? '',
        createdAt: now(),
        lastPlayedAt: null,
        playTimeSeconds: 0,
      };
      instances = [...instances, instance];
      return structuredClone(instance) as T;
    }
    case 'update_instance': {
      const request = args?.request as {
        id: string;
        name: string;
        memoryMbOverride: number | null;
        javaPathOverride: string | null;
        jvmArgs: string[];
        gameArgs?: string[];
        loaderVersion?: string | null;
        autoUpdateHorizon?: boolean;
        icon?: string | null;
        background?: string | null;
      };
      instances = instances.map((i) =>
        i.id === request.id
          ? {
              ...i,
              name: request.name,
              memoryMbOverride: request.memoryMbOverride,
              javaPathOverride: request.javaPathOverride,
              jvmArgs: request.jvmArgs,
              gameArgs: request.gameArgs ?? i.gameArgs,
              loaderVersion:
                request.loaderVersion !== undefined ? request.loaderVersion : i.loaderVersion,
              autoUpdateHorizon: request.autoUpdateHorizon ?? i.autoUpdateHorizon,
              icon: request.icon ?? i.icon,
              background: request.background ?? i.background,
            }
          : i,
      );
      return structuredClone(instances.find((i) => i.id === request.id)) as T;
    }
    case 'delete_instance':
      instances = instances.filter((i) => i.id !== args?.instanceId);
      return undefined as T;
    case 'duplicate_instance': {
      const source = instances.find((i) => i.id === args?.instanceId);
      if (!source) throw 'Сборка не найдена';
      const copy: Instance = {
        ...source,
        id: `inst-${Date.now()}`,
        name: `${source.name} (копия)`,
        createdAt: now(),
        lastPlayedAt: null,
        playTimeSeconds: 0,
      };
      instances = [...instances, copy];
      return structuredClone(copy) as T;
    }
    case 'open_instance_folder':
      return undefined as T;

    case 'get_java_runtimes':
      return structuredClone(runtime) as T;
    case 'download_java_runtime':
    case 'ensure_java_runtime':
      return structuredClone(runtime[0]) as T;

    case 'get_version_catalog':
      return structuredClone(catalog) as T;
    case 'get_install_status':
      return true as T;
    case 'prepare_instance':
      return undefined as T;
    case 'launch_instance': {
      running.add(String(args?.instanceId));
      return undefined as T;
    }
    case 'terminate_instance':
      running.delete(String(args?.instanceId));
      return true as T;
    case 'get_running_instances':
      return Array.from(running) as T;

    case 'list_jobs':
      return structuredClone(jobs) as T;
    case 'pause_job': {
      const job = jobs.find((item) => item.id === args?.jobId);
      if (job) {
        job.status = 'paused';
        job.message = 'На паузе';
        job.updatedAt = now();
      }
      return undefined as T;
    }
    case 'resume_job': {
      const job = jobs.find((item) => item.id === args?.jobId);
      if (job) {
        job.status = 'running';
        job.message = 'Выполняется';
        job.updatedAt = now();
      }
      return undefined as T;
    }
    case 'cancel_job': {
      const job = jobs.find((item) => item.id === args?.jobId);
      if (job) {
        job.status = 'canceled';
        job.message = 'Отменено';
        job.updatedAt = now();
      }
      return undefined as T;
    }
    case 'dismiss_job': {
      const index = jobs.findIndex((item) => item.id === args?.jobId);
      if (index !== -1) jobs.splice(index, 1);
      return undefined as T;
    }

    case 'search_modrinth_mods':
      return {
        totalHits: 3,
        hits: [
          {
            projectId: 'AANobbMI',
            slug: 'sodium',
            title: 'Sodium',
            description: 'Современный движок рендеринга для Minecraft с кратным ростом FPS.',
            author: 'jellysquid3',
            iconUrl: null,
            downloads: 42500000,
            categories: ['optimization', 'fabric'],
            versions: ['1.21.11', '1.21.1'],
          },
          {
            projectId: 'P7dR8mSH',
            slug: 'fabric-api',
            title: 'Fabric API',
            description: 'Базовая библиотека хуков и API, необходимая большинству модов на Fabric.',
            author: 'modmuss50',
            iconUrl: null,
            downloads: 68200000,
            categories: ['library', 'fabric'],
            versions: ['1.21.11', '1.21.1'],
          },
          {
            projectId: 'YL57xq9U',
            slug: 'iris',
            title: 'Iris Shaders',
            description: 'Совместимый с Sodium загрузчик современных шейдер-паков.',
            author: 'coderbot',
            iconUrl: null,
            downloads: 29400000,
            categories: ['optimization', 'fabric'],
            versions: ['1.21.11', '1.21.1'],
          },
        ],
      } as T;
    case 'get_modrinth_project':
      return {
        id: String(args?.projectId ?? 'AANobbMI'),
        slug: 'sodium',
        title: 'Sodium',
        description: 'Современный движок рендеринга для Minecraft с кратным ростом FPS.',
        body: '# Sodium\n\nSodium — бесплатный движок рендеринга с открытым исходным кодом, который значительно повышает частоту кадров и снижает микрофризы.\n\n## Особенности\n- Оптимизация рендера чанков\n- Снижение потребления памяти\n- Поддержка современных видеокарт',
        iconUrl: null,
        downloads: 42500000,
        followers: 142000,
        categories: ['optimization', 'fabric'],
        loaders: ['fabric', 'neoforge'],
        gameVersions: ['1.21.11', '1.21.1'],
        sourceUrl: 'https://example.invalid/sodium',
        gallery: [],
      } as T;
    case 'get_modrinth_versions':
      return [
        {
          id: 'ver-1',
          name: 'Sodium mc1.21.11-0.6.5',
          versionNumber: '0.6.5',
          versionType: 'release',
          gameVersions: ['1.21.11'],
          loaders: ['fabric'],
          datePublished: '2026-09-10T12:00:00Z',
          downloads: 1850000,
        },
      ] as T;
    case 'install_modrinth_mod':
      return {
        fileName: `${String(args?.projectId ?? 'mod')}-1.0.0.jar`,
        sizeBytes: 512400,
        projectId: String(args?.projectId ?? 'mod'),
        title: String(args?.projectId ?? 'Mod'),
        iconUrl: null,
        versionId: String(args?.versionId ?? 'ver-1'),
        versionNumber: '1.0.0',
        sha1: null,
      } as T;
    case 'get_installed_mods':
      return [
        {
          fileName: 'sodium-fabric-0.6.5.jar',
          kind: 'mod',
          sizeBytes: 812_400,
          projectId: 'AANobbMI',
          title: 'Sodium',
          iconUrl: null,
          versionId: 'ver-1',
          versionNumber: '0.6.5',
          sha1: 'demo-sha1',
        },
      ] as T;
    case 'remove_installed_mod':
      return undefined as T;
    case 'search_horizon_mods':
      return {
        hits: [
          {
            id: 'zoom',
            kind: 'native-mod',
            name: 'Zoom',
            summary: 'Увеличение камеры по нажатию клавиши с плавным зумом колёсиком.',
            author: 'Horizon',
            icon: null,
            downloads: 86500,
            categories: ['utility'],
            latestVersion: '2.0.0',
          },
          {
            id: 'wisdom_horizon',
            kind: 'shader',
            name: 'Wisdom Shaders V3 (Horizon port)',
            summary: 'Порт Wisdom Shaders V3 под нативный шейдерный API Horizon.',
            author: 'bobcao3, iLoong',
            icon: null,
            downloads: 93600,
            categories: ['atmosphere'],
            latestVersion: '1.3.7',
          },
        ],
        totalHits: 2,
      } as T;
    case 'get_horizon_mod_details':
      return {
        id: String(args?.projectId ?? 'zoom'),
        kind: 'native-mod',
        name: 'Zoom',
        summary: 'Увеличение камеры по нажатию клавиши.',
        description: 'Нативный Rust-мод для Horizon (Minecraft 26.3).',
        author: 'Horizon',
        icon: null,
        downloads: 86500,
        categories: ['utility'],
        screenshots: [],
        source: 'https://example.invalid/horizon-mods',
        license: 'MIT',
        versions: [
          {
            version: '2.0.0',
            published: '2026-11-01',
            game: '26.3',
            fileName: 'zoom-2.0.0.hnmod',
            fileSize: 12400,
          },
        ],
      } as T;
    case 'install_horizon_mod':
      return {
        fileName: `${String(args?.projectId ?? 'mod')}-2.0.0.hnmod`,
        sizeBytes: 12400,
        projectId: String(args?.projectId ?? 'zoom'),
        title: String(args?.projectId ?? 'Zoom'),
        iconUrl: null,
        versionId: String(args?.version ?? '2.0.0'),
        versionNumber: String(args?.version ?? '2.0.0'),
      } as T;

    case 'list_installed_horizon_binaries':
      return [
        {
          tagName: 'nightly',
          updatedAt: now(),
          assetSize: 18_400_000,
        },
      ] as T;
    case 'check_launcher_update':
      return {
        currentVersion: '0.1.1',
        latestVersion: '0.1.1',
        updateAvailable: false,
        releaseUrl: 'https://example.invalid/releases/latest',
        publishedAt: now(),
      } as T;
    case 'get_app_links':
      return {
        modrinthProject: 'https://example.invalid/modrinth',
        horizonMod: 'https://example.invalid/horizon-mods',
        repo: 'https://example.invalid/repo',
        issues: 'https://example.invalid/issues',
      } as T;

    // Быстрый запуск и скриншоты сборки
    case 'get_instance_quick_play':
      return {
        worlds: [
          { folderName: 'Новый мир', modifiedMs: Date.now(), iconDataUrl: null },
          { folderName: 'Тестовый мир', modifiedMs: Date.now() - 86_400_000, iconDataUrl: null },
        ],
        servers: [
          { id: 'srv-1', name: 'Локальный сервер', address: 'localhost:25565', favorite: true },
        ],
      } as T;
    case 'add_quick_server':
      return [
        {
          id: `srv-${Date.now()}`,
          name: String(args?.name ?? 'Сервер'),
          address: String(args?.address ?? 'localhost:25565'),
          favorite: false,
        },
      ] as T;
    case 'remove_quick_server':
      return [] as T;
    case 'toggle_quick_server_favorite':
      return [
        {
          id: String(args?.serverId ?? 'srv-1'),
          name: 'Локальный сервер',
          address: 'localhost:25565',
          favorite: true,
        },
      ] as T;
    case 'ping_server':
      return {
        online: true,
        playersOnline: 7,
        playersMax: 20,
        latencyMs: 34,
        version: '1.21.4',
        motd: 'HydroLauncher test server',
      } as T;
    case 'get_instance_screenshots':
      return [] as T;
    case 'list_instance_worlds':
      return [
        {
          folderName: 'Новый мир',
          modifiedMs: Date.now() - 3_600_000,
          sizeBytes: 48 * 1024 * 1024,
          iconDataUrl: null,
        },
        {
          folderName: 'Тестовый мир',
          modifiedMs: Date.now() - 86_400_000,
          sizeBytes: 12 * 1024 * 1024,
          iconDataUrl: null,
        },
      ] as T;
    case 'backup_instance_world':
      return {
        worldFolder: String(args?.folderName ?? 'world'),
        fileName: '20261115-120000.zip',
        createdMs: Date.now(),
        sizeBytes: 18 * 1024 * 1024,
      } as T;
    case 'list_world_backups':
      return [
        {
          worldFolder: 'Новый мир',
          fileName: '20261115-120000.zip',
          createdMs: Date.now() - 3_600_000,
          sizeBytes: 18 * 1024 * 1024,
        },
      ] as T;
    case 'restore_world_backup':
    case 'delete_world_backup':
      return undefined as T;
    case 'delete_instance_world':
      return undefined as T;
    case 'export_instance_archive':
      return {
        path: 'C:\\HydroLauncher\\exports\\instance.zip',
        sizeBytes: 12 * 1024 * 1024,
      } as T;
    case 'pick_instance_archive':
      return null as T;
    case 'import_instance_archive': {
      const imported: Instance = {
        id: `inst-${Date.now()}`,
        name: 'Импортированная сборка',
        minecraftVersion: '1.21.4',
        engine: 'java',
        loader: 'fabric',
        loaderVersion: '0.16.9',
        autoUpdateHorizon: true,
        memoryMbOverride: null,
        javaPathOverride: null,
        jvmArgs: [],
        gameArgs: [],
        icon: '',
        background: '',
        createdAt: now(),
        lastPlayedAt: null,
        playTimeSeconds: 0,
      };
      instances = [...instances, imported];
      return imported as T;
    }
    case 'read_instance_log':
      return [
        '[12:00:00] [stdout] Starting Minecraft',
        '[12:00:01] [stdout] Loaded 42 mods',
      ] as T;
    case 'open_instance_log':
      return undefined as T;
    case 'delete_instance_screenshot':
    case 'open_screenshot_file':
      return undefined as T;

    // Horizon: релизы движка
    case 'list_horizon_releases':
      return [
        { tagName: 'nightly', name: 'Nightly', publishedAt: now() },
      ] as T;
    case 'check_horizon_update':
    case 'update_horizon_binaries':
      return {
        installed: true,
        updateAvailable: false,
        tagName: String(args?.tag ?? 'nightly'),
        installedTag: 'nightly',
        currentUpdatedAt: now(),
        latestUpdatedAt: now(),
      } as T;
    case 'cleanup_horizon_cache':
      return { removedTags: [], freedBytes: 0 } as T;

    // Модлоадеры и обновления модов
    case 'get_loader_versions':
      return [
        (args?.loader as string) === 'forge' ? '47.2.0' : '0.16.9',
      ] as T;
    case 'check_mod_updates':
      return [
        {
          fileName: 'sodium-fabric-0.6.5.jar',
          projectId: 'AANobbMI',
          currentVersionId: 'ver-1',
          currentVersionNumber: '0.6.5',
          latestVersionId: 'ver-2',
          latestVersionNumber: '0.7.0',
          latestChannel: 'beta',
          latestFileSize: 1_204_000,
          latestPublished: '2026-11-02T10:00:00Z',
          localModified: false,
        },
      ] as T;
    case 'toggle_installed_mod':
      return String(args?.fileName ?? 'mod.jar') as T;

    // Модпаки: в моке создаём локальную сборку без скачивания
    case 'install_modrinth_modpack':
    case 'import_mrpack_file': {
      const created: Instance = {
        id: `inst-${Date.now()}`,
        name: String(args?.customName ?? 'Модпак'),
        minecraftVersion: '1.21.4',
        engine: 'java',
        loader: 'fabric',
        loaderVersion: '0.16.9',
        autoUpdateHorizon: true,
        memoryMbOverride: null,
        javaPathOverride: null,
        jvmArgs: [],
        gameArgs: [],
        icon: '',
        background: '',
        createdAt: now(),
        lastPlayedAt: null,
        playTimeSeconds: 0,
      };
      instances = [...instances, created];
      return created as T;
    }
    case 'pick_mrpack_file':
      return null as T;
    case 'export_instance_mrpack':
      return {
        path: 'C:\\HydroLauncher\\exports\\instance.mrpack',
        sizeBytes: 3 * 1024 * 1024,
      } as T;
    case 'pick_local_mod':
      return null as T;
    case 'install_local_mod':
      return {
        fileName: String(args?.filePath ?? 'mod.jar').split('\\').pop() ?? 'mod.jar',
        kind: 'mod',
        sizeBytes: 1024 * 1024,
        projectId: null,
        title: 'Локальный мод',
        iconUrl: null,
        versionId: null,
        versionNumber: null,
        sha1: null,
      } as T;
    case 'open_external_url':
      return undefined as T;
    case 'quit_app':
      return undefined as T;

    default:
      throw `Неизвестная команда: ${command}`;
  }
}
