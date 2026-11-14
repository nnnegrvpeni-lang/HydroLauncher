import { useEffect } from 'react';
import { create } from 'zustand';
import {
  api,
  type ModLoaderKind,
  type ModrinthSearchHit,
  type VersionCatalog,
} from '../api';

const CATALOG_KEY = 'hl:cache:versionCatalog:v1';
const LOADER_MC_KEY = 'hl:cache:loaderSupportedMc:v1';
const MODS_SEARCH_KEY = 'hl:cache:modsSearch:v1';

const CATALOG_TTL_MS = 6 * 60 * 60 * 1000; // 6 часов
const MODS_TTL_MS = 15 * 60 * 1000; // 15 минут
const MAX_PERSISTED_SEARCHES = 12;

const PRELOAD_LOADERS: ModLoaderKind[] = ['fabric', 'forge', 'neoforge', 'quilt'];

interface CachedCatalog {
  data: VersionCatalog;
  updatedAt: number;
}

interface CachedLoaderMc {
  versions: string[];
  updatedAt: number;
}

export interface CachedModsSearch {
  hits: ModrinthSearchHit[];
  totalHits: number;
  updatedAt: number;
}

function readStorage<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStorage<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Игнорируем переполнение localStorage
  }
}

function loadInitialCatalog(): CachedCatalog | null {
  return readStorage<CachedCatalog>(CATALOG_KEY);
}

function loadInitialLoaderMc(): Partial<Record<ModLoaderKind, CachedLoaderMc>> {
  return readStorage<Partial<Record<ModLoaderKind, CachedLoaderMc>>>(LOADER_MC_KEY) ?? {};
}

function loadInitialModsSearch(): Record<string, CachedModsSearch> {
  return readStorage<Record<string, CachedModsSearch>>(MODS_SEARCH_KEY) ?? {};
}

function persistModsSearch(map: Record<string, CachedModsSearch>): void {
  const entries = Object.entries(map)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, MAX_PERSISTED_SEARCHES);
  writeStorage(MODS_SEARCH_KEY, Object.fromEntries(entries));
}

const initialCatalog = loadInitialCatalog();
const initialLoaderMc = loadInitialLoaderMc();
const initialModsSearch = loadInitialModsSearch();

const inflightCatalog = { promise: null as Promise<VersionCatalog> | null };
const inflightLoaderMc: Partial<Record<ModLoaderKind, Promise<string[]>>> = {};
const inflightLoaderVersions: Record<string, Promise<string[]>> = {};

interface CatalogState {
  versionCatalog: VersionCatalog | null;
  versionCatalogUpdatedAt: number;
  versionCatalogLoading: boolean;

  loaderSupportedMc: Partial<Record<ModLoaderKind, CachedLoaderMc>>;
  loaderSupportedMcLoading: Partial<Record<ModLoaderKind, boolean>>;

  loaderVersionsCache: Record<string, string[]>;
  modsSearchCache: Record<string, CachedModsSearch>;

  ensureVersionCatalog: (force?: boolean) => Promise<VersionCatalog | null>;
  ensureLoaderSupportedMc: (loader: ModLoaderKind, force?: boolean) => Promise<string[]>;
  ensureLoaderVersions: (loader: ModLoaderKind, mcVersion: string) => Promise<string[]>;

  getModsSearch: (key: string) => (CachedModsSearch & { isStale: boolean }) | null;
  setModsSearch: (key: string, hits: ModrinthSearchHit[], totalHits: number) => void;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  versionCatalog: initialCatalog?.data ?? null,
  versionCatalogUpdatedAt: initialCatalog?.updatedAt ?? 0,
  versionCatalogLoading: false,

  loaderSupportedMc: initialLoaderMc,
  loaderSupportedMcLoading: {},

  loaderVersionsCache: {},
  modsSearchCache: initialModsSearch,

  ensureVersionCatalog: async (force = false) => {
    const { versionCatalog, versionCatalogUpdatedAt } = get();
    const isFresh =
      versionCatalog !== null && Date.now() - versionCatalogUpdatedAt < CATALOG_TTL_MS;

    if (isFresh && !force) {
      return versionCatalog;
    }

    if (inflightCatalog.promise) {
      return inflightCatalog.promise;
    }

    if (!versionCatalog) {
      set({ versionCatalogLoading: true });
    }

    const req = api
      .getVersionCatalog()
      .then((data) => {
        const updatedAt = Date.now();
        writeStorage(CATALOG_KEY, { data, updatedAt });
        set({
          versionCatalog: data,
          versionCatalogUpdatedAt: updatedAt,
          versionCatalogLoading: false,
        });
        return data;
      })
      .catch((err) => {
        set({ versionCatalogLoading: false });
        if (!versionCatalog) throw err;
        return versionCatalog;
      })
      .finally(() => {
        inflightCatalog.promise = null;
      });

    inflightCatalog.promise = req;
    return req;
  },

  ensureLoaderSupportedMc: async (loader, force = false) => {
    if (loader === 'vanilla') return [];
    const entry = get().loaderSupportedMc[loader];
    const isFresh = entry !== undefined && Date.now() - entry.updatedAt < CATALOG_TTL_MS;

    if (isFresh && !force) {
      return entry.versions;
    }

    const existing = inflightLoaderMc[loader];
    if (existing) return existing;

    if (!entry) {
      set((s) => ({
        loaderSupportedMcLoading: { ...s.loaderSupportedMcLoading, [loader]: true },
      }));
    }

    const req = api
      .getLoaderSupportedMcVersions(loader)
      .then((versions) => {
        const updatedAt = Date.now();
        set((s) => {
          const nextMap = {
            ...s.loaderSupportedMc,
            [loader]: { versions, updatedAt },
          };
          writeStorage(LOADER_MC_KEY, nextMap);
          return {
            loaderSupportedMc: nextMap,
            loaderSupportedMcLoading: { ...s.loaderSupportedMcLoading, [loader]: false },
          };
        });
        return versions;
      })
      .catch(() => {
        set((s) => ({
          loaderSupportedMcLoading: { ...s.loaderSupportedMcLoading, [loader]: false },
        }));
        return entry?.versions ?? [];
      })
      .finally(() => {
        delete inflightLoaderMc[loader];
      });

    inflightLoaderMc[loader] = req;
    return req;
  },

  ensureLoaderVersions: async (loader, mcVersion) => {
    if (loader === 'vanilla' || !mcVersion) return [];
    const cacheKey = `${loader}:${mcVersion}`;
    const cached = get().loaderVersionsCache[cacheKey];
    if (cached) return cached;

    const existing = inflightLoaderVersions[cacheKey];
    if (existing) return existing;

    const req = api
      .getLoaderVersions(loader, mcVersion)
      .then((versions) => {
        set((s) => ({
          loaderVersionsCache: { ...s.loaderVersionsCache, [cacheKey]: versions },
        }));
        return versions;
      })
      .catch(() => [])
      .finally(() => {
        delete inflightLoaderVersions[cacheKey];
      });

    inflightLoaderVersions[cacheKey] = req;
    return req;
  },

  getModsSearch: (key) => {
    const entry = get().modsSearchCache[key];
    if (!entry) return null;
    return {
      ...entry,
      isStale: Date.now() - entry.updatedAt > MODS_TTL_MS,
    };
  },

  setModsSearch: (key, hits, totalHits) => {
    const updatedAt = Date.now();
    set((s) => {
      const next = {
        ...s.modsSearchCache,
        [key]: { hits, totalHits, updatedAt },
      };
      persistModsSearch(next);
      return { modsSearchCache: next };
    });
  },
}));

/**
 * Фоновая предзагрузка каталогов при запуске лаунчера (SWR):
 * если кэш на диске свежий — не делает лишних запросов;
 * если устарел или отсутствует — тихо обновляет в фоне.
 */
export function useInitCatalogPreload() {
  useEffect(() => {
    const state = useCatalogStore.getState();

    // 1. Каталог версий Mojang
    void state.ensureVersionCatalog();

    // 2. Совместимость модлоадеров
    for (const loader of PRELOAD_LOADERS) {
      void state.ensureLoaderSupportedMc(loader);
    }

    // 3. Дефолтная первая страница модов Modrinth (если отсутствует или устарела)
    const defaultModsKey = 'modrinth||mod|all|all|all|0';
    const cachedMods = state.getModsSearch(defaultModsKey);
    if (!cachedMods || cachedMods.isStale) {
      void api
        .searchModrinthMods({
          query: '',
          projectType: 'mod',
          category: 'all',
          limit: 24,
          offset: 0,
        })
        .then((res) => {
          useCatalogStore.getState().setModsSearch(defaultModsKey, res.hits, res.totalHits);
        })
        .catch(() => {
          // Тихо игнорируем ошибку фонового прогрева
        });
    }
  }, []);
}
