/**
 * Dev-моки Tauri-команд. Активны только когда приложение открыто в обычном
 * браузере (нет __TAURI_INTERNALS__) и это dev-сборка.
 *
 * Нужны исключительно для разработки визуала без перезапуска Rust-сборки.
 */

import type {
  AccountsStore,
  AppSettings,
  Instance,
  JavaRuntime,
  OfflineAccount,
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
};

let accounts: AccountsStore = {
  activeAccountId: 'acc-1',
  accounts: [
    {
      id: 'acc-1',
      username: 'HydroDev',
      uuid: '3f2a91c4-1111-3333-8444-a0b1c2d3e4f5',
      createdAt: now(),
      lastUsedAt: now(),
    },
    {
      id: 'acc-2',
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
    path: 'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.5.11-hotspot\\bin\\java.exe',
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
      url: 'https://piston-meta.mojang.com/mock.json',
      time: now(),
      releaseTime: now(),
      sha1: null,
    })),
  },
};

const running = new Set<string>();

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
        sourceUrl: 'https://github.com/CaffeineMC/sodium',
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
      } as T;
    case 'get_installed_mods':
      return [] as T;
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
        source: 'https://github.com/horizon-rust/horizon-mods',
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
        latestVersion: '0.1.2',
        updateAvailable: true,
        releaseUrl: 'https://github.com/nnnegrvpeni-lang/HydroLauncher/releases/latest',
        publishedAt: now(),
      } as T;
    case 'get_app_links':
      return {
        modrinthProject: 'https://modrinth.com/mod/',
        horizonMod: 'https://playhorizon.dev/mods/',
        repo: 'https://github.com/nnnegrvpeni-lang/HydroLauncher',
        issues: 'https://github.com/nnnegrvpeni-lang/HydroLauncher/issues/new/choose',
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
        path: 'C:\\Users\\Public\\HydroLauncher-instance.zip',
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
      return [] as T;
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
        path: 'C:\\Users\\Public\\HydroLauncher-export.mrpack',
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
      } as T;
    case 'open_external_url':
      return undefined as T;
    case 'quit_app':
      return undefined as T;

    default:
      throw `Неизвестная команда: ${command}`;
  }
}
