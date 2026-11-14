import { invoke } from './invoke';

export const THEME_CHANNEL = 'hydro://theme-changed';

export type ThemeMode = 'system' | 'dark' | 'night' | 'light';

export interface AppSettings {
  theme: ThemeMode;
  dataDir: string;
  defaultMemoryMb: number;
  maxConcurrentDownloads: number;
  closeOnLaunch: boolean;
  showSnapshots: boolean;
  customJavaPaths: string[];
}

export interface SystemInfo {
  totalMemoryMb: number;
  availableMemoryMb: number;
  cpuCores: number;
  osName: string;
  arch: string;
  defaultDataDir: string;
}

export type EngineKind = 'java' | 'horizon';
export type ModLoaderKind = 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt';

export interface Instance {
  id: string;
  name: string;
  minecraftVersion: string;
  engine: EngineKind;
  loader: ModLoaderKind;
  loaderVersion: string | null;
  memoryMbOverride: number | null;
  javaPathOverride: string | null;
  jvmArgs: string[];
  gameArgs: string[];
  createdAt: string;
  lastPlayedAt: string | null;
  playTimeSeconds: number;
}

export interface CreateInstanceRequest {
  name: string;
  minecraftVersion: string;
  engine: EngineKind;
  loader: ModLoaderKind;
  loaderVersion?: string | null;
}

export interface UpdateInstanceRequest {
  id: string;
  name: string;
  memoryMbOverride: number | null;
  javaPathOverride: string | null;
  jvmArgs: string[];
  loaderVersion?: string | null;
}

export interface OfflineAccount {
  id: string;
  username: string;
  uuid: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface AccountsStore {
  activeAccountId: string | null;
  accounts: OfflineAccount[];
}

export interface JavaRuntime {
  path: string;
  version: string;
  majorVersion: number;
  vendor: string;
  arch: string;
  isManaged: boolean;
}

export interface VersionSummary {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  url: string;
  time: string;
  releaseTime: string;
  sha1: string | null;
}

export interface VersionManifest {
  latest: { release: string; snapshot: string };
  versions: VersionSummary[];
}

export interface VersionCatalog {
  manifest: VersionManifest;
}

export interface LaunchProgress {
  instanceId: string;
  stage: string;
  message: string;
  current: number;
  total: number;
  percent: number;
}

export interface GameLog {
  instanceId: string;
  stream: string;
  line: string;
  timestamp: string;
}

export interface GameState {
  instanceId: string;
  state: 'preparing' | 'launching' | 'running' | 'exited' | 'crashed';
  exitCode: number | null;
}

export interface ModrinthSearchHit {
  projectId: string;
  projectType?: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  iconUrl: string | null;
  downloads: number;
  categories: string[];
  versions: string[];
}

export interface ModrinthSearchResult {
  hits: ModrinthSearchHit[];
  totalHits: number;
}

export interface SearchModrinthRequest {
  query: string;
  projectType?: string;
  category?: string;
  loader?: ModLoaderKind;
  gameVersion?: string;
  limit?: number;
  offset?: number;
}

export interface InstalledModFile {
  fileName: string;
  kind: 'mod' | 'shader' | 'resourcepack';
  sizeBytes: number;
  projectId: string | null;
  title: string | null;
  iconUrl: string | null;
  versionId: string | null;
  versionNumber: string | null;
}

export interface ModrinthGalleryImage {
  url: string;
  title: string | null;
  description: string | null;
}

export interface ModrinthProjectDetails {
  id: string;
  projectType?: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  iconUrl: string | null;
  downloads: number;
  followers: number;
  categories: string[];
  loaders: string[];
  gameVersions: string[];
  sourceUrl: string | null;
  gallery: ModrinthGalleryImage[];
}

export interface ModrinthVersionInfo {
  id: string;
  name: string;
  versionNumber: string;
  versionType: string;
  gameVersions: string[];
  loaders: string[];
  datePublished: string;
  downloads: number;
}

export interface SearchHorizonModsRequest {
  query: string;
  kind?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

export interface HorizonModSearchHit {
  id: string;
  kind: string;
  name: string;
  summary: string;
  author: string;
  icon: string | null;
  downloads: number;
  categories: string[];
  latestVersion: string | null;
}

export interface HorizonModsSearchResult {
  hits: HorizonModSearchHit[];
  totalHits: number;
}

export interface HorizonModVersionInfo {
  version: string;
  published: string;
  game: string;
  fileName: string;
  fileSize: number;
}

export interface HorizonModDetails {
  id: string;
  kind: string;
  name: string;
  summary: string;
  description: string;
  author: string;
  icon: string | null;
  downloads: number;
  categories: string[];
  screenshots: string[];
  source: string | null;
  license: string | null;
  versions: HorizonModVersionInfo[];
}

export interface QuickPlayWorld {
  folderName: string;
  modifiedMs: number;
  iconDataUrl: string | null;
}

export interface QuickPlayServer {
  id: string;
  name: string;
  address: string;
}

export interface InstanceQuickPlay {
  worlds: QuickPlayWorld[];
  servers: QuickPlayServer[];
}

export interface QuickPlayTarget {
  kind: 'world' | 'server';
  value: string;
}

export interface ModUpdateInfo {
  fileName: string;
  projectId: string;
  currentVersionId: string;
  latestVersionId: string;
  latestVersionNumber: string;
}

export interface InstanceScreenshot {
  fileName: string;
  modifiedMs: number;
  sizeBytes: number;
  dataUrl: string | null;
}

export interface HorizonUpdateInfo {
  installed: boolean;
  updateAvailable: boolean;
  tagName: string;
  currentUpdatedAt: string | null;
  latestUpdatedAt: string | null;
}

export const api = {
  // Аккаунты
  getAccounts: () => invoke<AccountsStore>('get_accounts'),
  createAccount: (username: string) => invoke<AccountsStore>('create_account', { username }),
  setActiveAccount: (accountId: string) => invoke<AccountsStore>('set_active_account', { accountId }),
  renameAccount: (accountId: string, username: string) =>
    invoke<AccountsStore>('rename_account', { accountId, username }),
  deleteAccount: (accountId: string) => invoke<AccountsStore>('delete_account', { accountId }),
  getActiveAccount: () => invoke<OfflineAccount | null>('get_active_account'),

  // Сборки
  getInstances: () => invoke<Instance[]>('get_instances'),
  createInstance: (request: CreateInstanceRequest) => invoke<Instance>('create_instance', { request }),
  updateInstance: (request: UpdateInstanceRequest) => invoke<Instance>('update_instance', { request }),
  deleteInstance: (instanceId: string) => invoke<void>('delete_instance', { instanceId }),
  openInstanceFolder: (instanceId: string, subfolder?: 'mods' | 'game') =>
    invoke<void>('open_instance_folder', { instanceId, subfolder }),
  getInstanceQuickPlay: (instanceId: string) =>
    invoke<InstanceQuickPlay>('get_instance_quick_play', { instanceId }),
  addQuickServer: (instanceId: string, name: string, address: string) =>
    invoke<QuickPlayServer[]>('add_quick_server', { instanceId, name, address }),
  removeQuickServer: (instanceId: string, serverId: string) =>
    invoke<QuickPlayServer[]>('remove_quick_server', { instanceId, serverId }),
  getInstanceScreenshots: (instanceId: string) =>
    invoke<InstanceScreenshot[]>('get_instance_screenshots', { instanceId }),
  deleteInstanceScreenshot: (instanceId: string, fileName: string) =>
    invoke<void>('delete_instance_screenshot', { instanceId, fileName }),
  openScreenshotFile: (instanceId: string, fileName: string) =>
    invoke<void>('open_screenshot_file', { instanceId, fileName }),

  // Настройки
  getSettings: () => invoke<AppSettings>('get_settings'),
  saveSettings: (settings: AppSettings) => invoke<AppSettings>('save_settings_cmd', { settings }),
  getSystemInfo: () => invoke<SystemInfo>('get_system_info'),
  pickDirectory: () => invoke<string | null>('pick_directory'),
  validateDataDir: (path: string) => invoke<string>('validate_data_dir', { path }),

  // Java
  getJavaRuntimes: () => invoke<JavaRuntime[]>('get_java_runtimes'),
  downloadJavaRuntime: (majorVersion: number) =>
    invoke<JavaRuntime>('download_java_runtime', { majorVersion }),
  ensureJavaRuntime: (majorVersion: number) =>
    invoke<JavaRuntime>('ensure_java_runtime', { majorVersion }),

  // Версии и запуск
  getVersionCatalog: () => invoke<VersionCatalog>('get_version_catalog'),
  getInstallStatus: (versionId: string) => invoke<boolean>('get_install_status', { versionId }),
  prepareInstance: (instanceId: string) => invoke<void>('prepare_instance', { instanceId }),
  launchInstance: (instanceId: string, quickPlay?: QuickPlayTarget) =>
    invoke<void>('launch_instance', { instanceId, quickPlay }),
  terminateInstance: (instanceId: string) => invoke<boolean>('terminate_instance', { instanceId }),
  getRunningInstances: () => invoke<string[]>('get_running_instances'),
  getLoaderVersions: (loader: ModLoaderKind, minecraftVersion: string) =>
    invoke<string[]>('get_loader_versions', { loader, minecraftVersion }),
  checkHorizonUpdate: () => invoke<HorizonUpdateInfo>('check_horizon_update'),
  updateHorizonBinaries: (instanceId?: string) =>
    invoke<HorizonUpdateInfo>('update_horizon_binaries', { instanceId }),

  // Моды (Modrinth)
  searchModrinthMods: (request: SearchModrinthRequest) =>
    invoke<ModrinthSearchResult>('search_modrinth_mods', { request }),
  getModrinthProject: (projectId: string) =>
    invoke<ModrinthProjectDetails>('get_modrinth_project', { projectId }),
  getModrinthVersions: (projectId: string, loader?: ModLoaderKind, gameVersion?: string) =>
    invoke<ModrinthVersionInfo[]>('get_modrinth_versions', {
      projectId,
      loader,
      gameVersion,
    }),
  installModrinthMod: (instanceId: string, projectId: string, versionId?: string) =>
    invoke<InstalledModFile>('install_modrinth_mod', { instanceId, projectId, versionId }),
  getInstalledMods: (instanceId: string) =>
    invoke<InstalledModFile[]>('get_installed_mods', { instanceId }),
  removeInstalledMod: (instanceId: string, fileName: string) =>
    invoke<void>('remove_installed_mod', { instanceId, fileName }),
  toggleInstalledMod: (instanceId: string, fileName: string) =>
    invoke<string>('toggle_installed_mod', { instanceId, fileName }),
  checkModUpdates: (instanceId: string) =>
    invoke<ModUpdateInfo[]>('check_mod_updates', { instanceId }),
  installModrinthModpack: (projectId: string, customName?: string) =>
    invoke<Instance>('install_modrinth_modpack', { projectId, customName }),
  importMrpackFile: (filePath: string, customName?: string) =>
    invoke<Instance>('import_mrpack_file', { filePath, customName }),
  pickMrpackFile: () => invoke<string | null>('pick_mrpack_file'),

  // Моды (Horizon)
  searchHorizonMods: (request: SearchHorizonModsRequest) =>
    invoke<HorizonModsSearchResult>('search_horizon_mods', { request }),
  getHorizonModDetails: (projectId: string) =>
    invoke<HorizonModDetails>('get_horizon_mod_details', { projectId }),
  installHorizonMod: (instanceId: string, projectId: string, version?: string) =>
    invoke<InstalledModFile>('install_horizon_mod', { instanceId, projectId, version }),
};
