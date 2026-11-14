import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  ExternalLink,
  Heart,
  Image as ImageIcon,
  Info,
  Loader2,
  Package,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  api,
  type InstalledModFile,
  type Instance,
  type ModLoaderKind,
  type ModrinthProjectDetails,
  type ModrinthSearchHit,
  type ModrinthVersionInfo,
} from '../api';
import { VoxelEmblem } from '../components/VoxelEmblem';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useCatalogStore } from '../stores/catalogStore';
import { useInstancesStore } from '../stores/instancesStore';
import { cn } from '../utils/cn';
import { formatLoaderLabel } from '../utils/format';

interface ModsPageProps {
  targetInstanceId: string | null;
  onClearTargetInstance: () => void;
  onQuickCreateInstance: () => void;
}

const PAGE_SIZE = 24;

const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'optimization', label: 'Оптимизация' },
  { id: 'utility', label: 'Утилиты' },
  { id: 'technology', label: 'Технологии' },
  { id: 'magic', label: 'Магия' },
  { id: 'decoration', label: 'Декор' },
  { id: 'library', label: 'Библиотеки' },
];

const LOADER_FILTERS: Array<{ id: ModLoaderKind | 'all'; label: string }> = [
  { id: 'all', label: 'Любой загрузчик' },
  { id: 'fabric', label: 'Fabric' },
  { id: 'forge', label: 'Forge' },
  { id: 'neoforge', label: 'NeoForge' },
  { id: 'quilt', label: 'Quilt' },
];

const HORIZON_KIND_FILTERS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'Все типы' },
  { id: 'native-mod', label: 'Нативные (.hnmod)' },
  { id: 'mod', label: 'Контент (.hmod)' },
  { id: 'shader', label: 'Шейдеры' },
  { id: 'resourcepack', label: 'Ресурспаки' },
];

const MODRINTH_TYPE_FILTERS: Array<{ id: string; label: string }> = [
  { id: 'mod', label: 'Моды' },
  { id: 'shader', label: 'Шейдеры' },
  { id: 'resourcepack', label: 'Ресурспаки' },
  { id: 'all', label: 'Все' },
];

const HORIZON_KIND_LABEL: Record<string, string> = {
  'native-mod': 'Native Mod',
  mod: 'Content Mod',
  shader: 'Shader',
  resourcepack: 'Resource Pack',
};

const KNOWN_LOADERS = ['fabric', 'forge', 'neoforge', 'quilt'] as const;

function formatDownloads(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}K`;
  return String(count);
}

function formatShortDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function normalizeLoaderForModrinth(loader: string): string {
  return loader.toLowerCase();
}

function isInstanceCompatible(
  instance: Instance,
  supportedLoaders: string[],
  supportedVersions: string[],
  isHorizonProject = false,
  projectType = 'mod',
): { compatible: boolean; reason?: string } {
  if (isHorizonProject) {
    if (instance.engine !== 'horizon') {
      return { compatible: false, reason: 'Только для Horizon (Rust)' };
    }
    return { compatible: true };
  }
  if (instance.engine === 'horizon') {
    return { compatible: false, reason: 'Только для Java Edition' };
  }
  if (projectType === 'shader' || projectType === 'resourcepack') {
    if (
      supportedVersions.length > 0 &&
      !supportedVersions.includes(instance.minecraftVersion)
    ) {
      return {
        compatible: false,
        reason: `Версия ${instance.minecraftVersion} не поддерживается`,
      };
    }
    return { compatible: true };
  }
  if (instance.loader === 'vanilla') {
    return { compatible: false, reason: 'Vanilla не поддерживает моды' };
  }
  const instLoader = normalizeLoaderForModrinth(instance.loader);
  const normalizedSupported = supportedLoaders.map(normalizeLoaderForModrinth);

  if (normalizedSupported.length > 0 && !normalizedSupported.includes(instLoader)) {
    return {
      compatible: false,
      reason: `Нужен ${supportedLoaders.map(formatLoaderLabel).join(' / ')}`,
    };
  }
  if (
    supportedVersions.length > 0 &&
    !supportedVersions.includes(instance.minecraftVersion)
  ) {
    return {
      compatible: false,
      reason: `Версия ${instance.minecraftVersion} не поддерживается`,
    };
  }
  return { compatible: true };
}

/**
 * Рендер описания Modrinth с поддержкой изображений (`![alt](url)` и `<img src="...">`),
 * заголовков, списков и абзацев.
 */
function ModBodyMarkdown({ body }: { body: string }) {
  const blocks = useMemo(() => {
    // Преобразуем HTML-картинки <img src="..." ...> в markdown-формат перед очисткой тегов
    const withMdImages = body.replace(
      /<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi,
      '\n\n![]($1)\n\n',
    );

    const cleaned = withMdImages
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1');

    return cleaned
      .split(/\r?\n\r?\n+/)
      .map((b) => b.trim())
      .filter(Boolean);
  }, [body]);

  if (blocks.length === 0) {
    return <p className="text-xs text-muted">Описание не предоставлено автором.</p>;
  }

  return (
    <div className="space-y-3.5 text-[13px] leading-relaxed text-muted">
      {blocks.slice(0, 60).map((block, idx) => {
        // Изображение вида ![alt](url)
        const imgMatch = block.match(/^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/);
        if (imgMatch) {
          return (
            <div
              key={idx}
              className="overflow-hidden rounded-[8px] border border-line bg-bg-well"
            >
              <img
                src={imgMatch[2]}
                alt={imgMatch[1]}
                className="max-h-[420px] w-full object-contain"
                loading="lazy"
              />
            </div>
          );
        }

        // Внутри абзаца могут быть inline-картинки — вытащим их отдельно
        if (/!\[[^\]]*\]\(https?:\/\/[^)\s]+\)/.test(block)) {
          const parts = block.split(/(!\[[^\]]*\]\(https?:\/\/[^)\s]+\))/g).filter(Boolean);
          return (
            <div key={idx} className="space-y-2.5">
              {parts.map((part, pIdx) => {
                const m = part.match(/^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/);
                if (m) {
                  return (
                    <img
                      key={pIdx}
                      src={m[2]}
                      alt={m[1]}
                      className="max-h-[380px] rounded-[8px] border border-line bg-bg-well object-contain"
                      loading="lazy"
                    />
                  );
                }
                return (
                  <p key={pIdx} className="whitespace-pre-line">
                    {part.trim()}
                  </p>
                );
              })}
            </div>
          );
        }

        if (block.startsWith('#')) {
          const text = block.replace(/^#+\s*/, '');
          return (
            <h3
              key={idx}
              className="pt-2 text-[14.5px] font-semibold tracking-tight text-ink"
            >
              {text}
            </h3>
          );
        }

        const lines = block.split(/\r?\n/);
        if (lines.every((l) => /^[-*]\s+/.test(l.trim()))) {
          return (
            <ul key={idx} className="list-disc space-y-1 pl-5">
              {lines.map((line, i) => (
                <li key={i}>{line.trim().replace(/^[-*]\s+/, '')}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={idx} className="whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </div>
  );
}

/** Страница каталога модов Modrinth с пагинацией и полноэкранной карточкой мода. */
export function ModsPage({
  targetInstanceId,
  onClearTargetInstance,
  onQuickCreateInstance,
}: ModsPageProps) {
  const instances = useInstancesStore((s) => s.instances);
  const topRef = useRef<HTMLDivElement>(null);

  const [manualSource, setManualSource] = useState<'modrinth' | 'horizon'>('modrinth');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [modrinthTypeFilter, setModrinthTypeFilter] = useState<string>('mod');
  const [loaderFilter, setLoaderFilter] = useState<ModLoaderKind | 'all'>('all');
  const [gameVersionFilter, setGameVersionFilter] = useState<string>('all');
  const versionCatalog = useCatalogStore((s) => s.versionCatalog);
  const loaderSupportedMc = useCatalogStore((s) => s.loaderSupportedMc);
  const ensureVersionCatalog = useCatalogStore((s) => s.ensureVersionCatalog);
  const ensureLoaderSupportedMc = useCatalogStore((s) => s.ensureLoaderSupportedMc);
  const getModsSearch = useCatalogStore((s) => s.getModsSearch);
  const setModsSearch = useCatalogStore((s) => s.setModsSearch);
  const releaseVersions = useMemo(() => {
    const allReleases = (versionCatalog?.manifest.versions ?? [])
      .filter((v) => v.type === 'release')
      .map((v) => v.id);

    if (loaderFilter !== 'all') {
      const supported = loaderSupportedMc[loaderFilter]?.versions;
      if (supported && supported.length > 0) {
        const supportedSet = new Set(supported);
        return allReleases.filter((id) => supportedSet.has(id)).slice(0, 40);
      }
    }

    return allReleases.slice(0, 40);
  }, [versionCatalog, loaderFilter, loaderSupportedMc]);
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const versionMenuRef = useRef<HTMLDivElement>(null);
  const [horizonKindFilter, setHorizonKindFilter] = useState<string>('all');
  const [showHorizonGuide, setShowHorizonGuide] = useState(false);
  const [page, setPage] = useState(0);

  const [hits, setHits] = useState<ModrinthSearchHit[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Установленные моды целевой сборки (если перешли из конкретной сборки)
  const targetInstance = useMemo(
    () => (targetInstanceId ? instances.find((i) => i.id === targetInstanceId) ?? null : null),
    [instances, targetInstanceId],
  );
  const catalogSource: 'modrinth' | 'horizon' =
    targetInstance ? (targetInstance.engine === 'horizon' ? 'horizon' : 'modrinth') : manualSource;
  const [targetInstalledMods, setTargetInstalledMods] = useState<InstalledModFile[]>([]);
  const [directInstallingIds, setDirectInstallingIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Модалка выбора совместимой сборки (когда targetInstance не задан)
  const [installTarget, setInstallTarget] = useState<{
    projectId: string;
    projectType?: string;
    title: string;
    loaders: string[];
    versions: string[];
    versionId?: string;
    versionNumber?: string;
  } | null>(null);
  const [installingInstanceIds, setInstallingInstanceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [installedIntoIds, setInstalledIntoIds] = useState<Set<string>>(new Set());
  const [installError, setInstallError] = useState<string | null>(null);

  // Полноэкранная карточка мода
  const [detailHit, setDetailHit] = useState<ModrinthSearchHit | null>(null);
  const [detailProject, setDetailProject] = useState<ModrinthProjectDetails | null>(null);
  const [detailVersions, setDetailVersions] = useState<ModrinthVersionInfo[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'description' | 'versions' | 'gallery'>('description');

  // Подгружаем каталог версий, если он ещё не в кэше
  useEffect(() => {
    if (!versionCatalog) {
      void ensureVersionCatalog().catch(() => {});
    }
  }, [versionCatalog, ensureVersionCatalog]);

  // Подгружаем поддерживаемые версии выбранного модлоадера и сбрасываем несовместимую версию игры
  useEffect(() => {
    if (loaderFilter === 'all') return;
    if (!loaderSupportedMc[loaderFilter]) {
      void ensureLoaderSupportedMc(loaderFilter);
    }
  }, [loaderFilter, loaderSupportedMc, ensureLoaderSupportedMc]);

  useEffect(() => {
    if (loaderFilter === 'all' || gameVersionFilter === 'all') return;
    const supported = loaderSupportedMc[loaderFilter]?.versions;
    if (supported && supported.length > 0 && !supported.includes(gameVersionFilter)) {
      setGameVersionFilter('all');
    }
  }, [loaderFilter, gameVersionFilter, loaderSupportedMc]);

  useEffect(() => {
    if (!versionMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (versionMenuRef.current && !versionMenuRef.current.contains(e.target as Node)) {
        setVersionMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVersionMenuOpen(false);
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [versionMenuOpen]);

  // При смене фильтров сбрасываем страницу на 0
  useEffect(() => {
    setPage(0);
  }, [
    query,
    category,
    modrinthTypeFilter,
    loaderFilter,
    gameVersionFilter,
    horizonKindFilter,
    catalogSource,
    targetInstanceId,
  ]);

  const loadTargetInstalled = useCallback(async (instanceId: string) => {
    try {
      const list = await api.getInstalledMods(instanceId);
      setTargetInstalledMods(list);
    } catch {
      setTargetInstalledMods([]);
    }
  }, []);

  useEffect(() => {
    if (targetInstance) {
      void loadTargetInstalled(targetInstance.id);
    } else {
      setTargetInstalledMods([]);
    }
  }, [targetInstance, loadTargetInstalled]);

  const installedProjectIds = useMemo(() => {
    const set = new Set<string>();
    for (const m of targetInstalledMods) {
      if (m.projectId) set.add(m.projectId);
    }
    return set;
  }, [targetInstalledMods]);

  const searchMods = useCallback(async () => {
    const trimmedQuery = query.trim();

    if (catalogSource === 'horizon') {
      const cacheKey = ['horizon', trimmedQuery, horizonKindFilter, category, page].join('|');
      const cached = getModsSearch(cacheKey);
      if (cached) {
        setHits(cached.hits);
        setTotalHits(cached.totalHits);
        setLoading(false);
        if (!cached.isStale) return;
      } else {
        setLoading(true);
      }

      setError(null);
      try {
        const res = await api.searchHorizonMods({
          query: trimmedQuery,
          kind: horizonKindFilter,
          category,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        });
        const mapped: ModrinthSearchHit[] = res.hits.map((h) => ({
          projectId: h.id,
          slug: h.id,
          title: h.name,
          description: h.summary,
          author: h.author || 'Horizon',
          iconUrl: h.icon,
          downloads: h.downloads,
          categories: [HORIZON_KIND_LABEL[h.kind] ?? h.kind, ...h.categories],
          versions: h.latestVersion ? [h.latestVersion] : [],
        }));
        setHits(mapped);
        setTotalHits(res.totalHits);
        setModsSearch(cacheKey, mapped, res.totalHits);
      } catch (err) {
        if (!cached) setError(String(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    const effectiveLoader =
      modrinthTypeFilter === 'shader' || modrinthTypeFilter === 'resourcepack'
        ? undefined
        : targetInstance && targetInstance.loader !== 'vanilla'
          ? targetInstance.loader
          : loaderFilter === 'all'
            ? undefined
            : loaderFilter;

    const effectiveGameVersion =
      targetInstance?.minecraftVersion ??
      (gameVersionFilter === 'all' ? undefined : gameVersionFilter);

    const cacheKey = [
      'modrinth',
      trimmedQuery,
      modrinthTypeFilter,
      category,
      effectiveLoader ?? 'all',
      effectiveGameVersion ?? 'all',
      page,
    ].join('|');

    const cached = getModsSearch(cacheKey);
    if (cached) {
      setHits(cached.hits);
      setTotalHits(cached.totalHits);
      setLoading(false);
      if (!cached.isStale) return;
    } else {
      setLoading(true);
    }

    setError(null);
    try {
      const res = await api.searchModrinthMods({
        query: trimmedQuery,
        projectType: modrinthTypeFilter,
        category,
        loader: effectiveLoader,
        gameVersion: effectiveGameVersion,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setHits(res.hits);
      setTotalHits(res.totalHits);
      setModsSearch(cacheKey, res.hits, res.totalHits);
    } catch (err) {
      if (!cached) setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [
    catalogSource,
    query,
    category,
    modrinthTypeFilter,
    loaderFilter,
    gameVersionFilter,
    horizonKindFilter,
    page,
    targetInstance,
    getModsSearch,
    setModsSearch,
  ]);

  useEffect(() => {
    const delay = query.trim() ? 180 : 0;
    const timer = window.setTimeout(() => {
      void searchMods();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [searchMods, query]);

  const totalPages = Math.max(1, Math.ceil(totalHits / PAGE_SIZE));

  const goToPage = (nextPage: number) => {
    const clamped = Math.max(0, Math.min(totalPages - 1, nextPage));
    setPage(clamped);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleInstallAction = async (
    hit: ModrinthSearchHit,
    version?: ModrinthVersionInfo,
  ) => {
    // Если открыт каталог для конкретной сборки — ставим сразу в неё в 1 клик
    if (targetInstance) {
      const busyKey = version?.id ?? hit.projectId;
      if (directInstallingIds.has(busyKey)) return;
      setDirectInstallingIds((prev) => new Set(prev).add(busyKey));
      setError(null);
      try {
        if (targetInstance.engine === 'horizon') {
          await api.installHorizonMod(
            targetInstance.id,
            hit.projectId,
            version?.versionNumber,
          );
        } else {
          await api.installModrinthMod(targetInstance.id, hit.projectId, version?.id);
        }
        await loadTargetInstalled(targetInstance.id);
      } catch (err) {
        setError(String(err));
      } finally {
        setDirectInstallingIds((prev) => {
          const next = new Set(prev);
          next.delete(busyKey);
          return next;
        });
      }
      return;
    }

    // Иначе показываем окно выбора совместимых сборок
    const hitLoaders =
      catalogSource === 'horizon'
        ? ['horizon']
        : hit.categories.filter((c) => (KNOWN_LOADERS as readonly string[]).includes(c));
    setInstallError(null);
    setInstalledIntoIds(new Set());
    setInstallTarget({
      projectId: hit.projectId,
      projectType: detailProject?.projectType ?? hit.projectType ?? modrinthTypeFilter,
      title: hit.title,
      loaders:
        catalogSource === 'horizon'
          ? ['horizon']
          : version
            ? version.loaders
            : detailProject?.loaders ?? hitLoaders,
      versions: version ? version.gameVersions : detailProject?.gameVersions ?? hit.versions,
      versionId: version?.id,
      versionNumber: version?.versionNumber,
    });
  };

  const openModDetail = async (hit: ModrinthSearchHit) => {
    setDetailHit(hit);
    setDetailProject(null);
    setDetailVersions([]);
    setDetailTab('description');
    setDetailLoading(true);
    try {
      if (catalogSource === 'horizon') {
        const d = await api.getHorizonModDetails(hit.projectId);
        setDetailProject({
          id: d.id,
          slug: d.id,
          title: d.name,
          description: d.summary,
          body: d.description,
          iconUrl: d.icon,
          downloads: d.downloads,
          followers: 0,
          categories: d.categories,
          loaders: ['horizon'],
          gameVersions: ['26.3'],
          sourceUrl: d.source,
          gallery: d.screenshots.map((url) => ({ url, title: null, description: null })),
        });
        setDetailVersions(
          d.versions.map((v) => ({
            id: v.version,
            name: `${d.name} ${v.version}`,
            versionNumber: v.version,
            versionType: 'release',
            gameVersions: [v.game],
            loaders: ['horizon'],
            datePublished: v.published,
            downloads: d.downloads,
          })),
        );
      } else {
        const [project, versions] = await Promise.all([
          api.getModrinthProject(hit.projectId),
          api.getModrinthVersions(
            hit.projectId,
            targetInstance && targetInstance.loader !== 'vanilla'
              ? targetInstance.loader
              : undefined,
            targetInstance?.minecraftVersion,
          ),
        ]);
        setDetailProject(project);
        setDetailVersions(versions);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleInstallIntoInstance = async (instanceId: string) => {
    if (!installTarget || installingInstanceIds.has(instanceId)) return;
    setInstallingInstanceIds((prev) => new Set(prev).add(instanceId));
    setInstallError(null);
    try {
      if (installTarget.loaders.includes('horizon')) {
        await api.installHorizonMod(
          instanceId,
          installTarget.projectId,
          installTarget.versionNumber,
        );
      } else {
        await api.installModrinthMod(
          instanceId,
          installTarget.projectId,
          installTarget.versionId,
        );
      }
      setInstalledIntoIds((prev) => new Set(prev).add(instanceId));
    } catch (err) {
      setInstallError(String(err));
    } finally {
      setInstallingInstanceIds((prev) => {
        const next = new Set(prev);
        next.delete(instanceId);
        return next;
      });
    }
  };

  const compatibilityList = useMemo(() => {
    if (!installTarget) return { compatible: [], incompatible: [] };
    const isHorizonProj = installTarget.loaders.includes('horizon');
    const compatible: Instance[] = [];
    const incompatible: Array<{ instance: Instance; reason: string }> = [];

    for (const inst of instances) {
      const check = isInstanceCompatible(
        inst,
        installTarget.loaders,
        installTarget.versions,
        isHorizonProj,
        installTarget.projectType ?? 'mod',
      );
      if (check.compatible) {
        compatible.push(inst);
      } else {
        incompatible.push({
          instance: inst,
          reason: check.reason ?? 'Несовместима',
        });
      }
    }
    return { compatible, incompatible };
  }, [installTarget, instances]);

  // Полноэкранная карточка мода (как на Modrinth)
  if (detailHit) {
    const icon = detailProject?.iconUrl ?? detailHit.iconUrl;
    const isInstalledInTarget =
      targetInstance !== null && installedProjectIds.has(detailHit.projectId);
    const isDirectBusy = directInstallingIds.has(detailHit.projectId);

    return (
      <div className="hl-fade-up mx-auto max-w-[1160px] px-7 py-6">
        <button
          type="button"
          onClick={() => setDetailHit(null)}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-line-strong bg-surface/65 px-3 py-1.5 text-xs font-medium text-muted backdrop-blur-md transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeft size={13} />
          Назад к каталогу
        </button>

        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
          {/* Левая колонка — паспорт мода */}
          <aside className="space-y-4">
            <div className="deck-surface rounded-[14px] p-5">
              <div className="flex items-start gap-3.5">
                {icon ? (
                  <img
                    src={icon}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-[10px] border border-line bg-bg-well object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[10px] border border-line bg-bg-well font-mono text-base font-semibold text-muted">
                    {detailHit.title.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h1 className="text-[17px] font-semibold tracking-tight text-ink">
                    {detailProject?.title ?? detailHit.title}
                  </h1>
                  <p className="mt-0.5 text-xs text-faint">от {detailHit.author}</p>
                </div>
              </div>

              <p className="mt-3.5 text-xs leading-relaxed text-muted">
                {detailProject?.description ?? detailHit.description}
              </p>

              {catalogSource === 'horizon' && detailHit.categories.includes('Native Mod') && (
                <div className="mt-3.5 rounded-[8px] border border-warn/30 bg-warn/8 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
                  <p className="font-medium text-warn">Нативный мод (.hnmod)</p>
                  <p className="mt-1">
                    Скачается в <code className="font-mono text-ink">horizon-native-mods/</code>, но
                    готовый клиент Horizon Nightly не подгружает <code className="font-mono text-ink">.hnmod</code>{' '}
                    на лету — для него нужна пересборка движка из исходников Rust.
                  </p>
                </div>
              )}

              <div className="mt-4">
                <Button
                  variant={isInstalledInTarget ? 'secondary' : 'accent'}
                  disabled={isDirectBusy}
                  onClick={() => void handleInstallAction(detailHit)}
                  className="w-full"
                >
                  {isDirectBusy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : isInstalledInTarget ? (
                    <Check size={14} className="text-led" />
                  ) : (
                    <Download size={14} />
                  )}
                  {isDirectBusy
                    ? 'Установка…'
                    : isInstalledInTarget
                      ? `Установлен в ${targetInstance?.name}`
                      : targetInstance
                        ? `Установить в ${targetInstance.name}`
                        : 'Установить'}
                </Button>
              </div>

              <div className="mt-4 space-y-2 border-t border-line pt-3.5 text-xs">
                <div className="flex items-center justify-between text-muted">
                  <span>Скачиваний</span>
                  <span className="font-mono text-ink">
                    {formatDownloads(detailProject?.downloads ?? detailHit.downloads)}
                  </span>
                </div>
                {detailProject && (
                  <div className="flex items-center justify-between text-muted">
                    <span>Подписчиков</span>
                    <span className="inline-flex items-center gap-1 font-mono text-ink">
                      <Heart size={11} className="text-faint" />
                      {formatDownloads(detailProject.followers)}
                    </span>
                  </div>
                )}
                {detailProject && detailProject.loaders.length > 0 && (
                  <div className="flex items-start justify-between gap-2 text-muted">
                    <span className="shrink-0">Загрузчики</span>
                    <span className="text-right font-mono text-[11px] text-ink">
                      {detailProject.loaders.map(formatLoaderLabel).join(', ')}
                    </span>
                  </div>
                )}
                <div className="pt-1">
                  <a
                    href={
                      catalogSource === 'horizon'
                        ? `https://playhorizon.dev/mods/${detailHit.slug}`
                        : `https://modrinth.com/mod/${detailHit.slug}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-ink"
                  >
                    Открыть на {catalogSource === 'horizon' ? 'Horizon' : 'Modrinth'}
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </div>
          </aside>

          {/* Правая колонка — вкладки Описание / Версии / Галерея */}
          <section className="deck-surface min-w-0 rounded-[14px] p-5">
            <div className="flex items-center gap-1 border-b border-line pb-3">
              <button
                type="button"
                onClick={() => setDetailTab('description')}
                className={cn(
                  'rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors',
                  detailTab === 'description'
                    ? 'bg-bg-well text-ink'
                    : 'text-muted hover:text-ink',
                )}
              >
                Описание
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('versions')}
                className={cn(
                  'rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors',
                  detailTab === 'versions'
                    ? 'bg-bg-well text-ink'
                    : 'text-muted hover:text-ink',
                )}
              >
                Версии {detailVersions.length > 0 ? `· ${detailVersions.length}` : ''}
              </button>
              {detailProject && detailProject.gallery.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDetailTab('gallery')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors',
                    detailTab === 'gallery'
                      ? 'bg-bg-well text-ink'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  <ImageIcon size={12} />
                  Галерея · {detailProject.gallery.length}
                </button>
              )}
            </div>

            <div className="mt-4">
              {detailLoading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted">
                  <Loader2 size={15} className="animate-spin" />
                  Загрузка страницы мода…
                </div>
              ) : detailTab === 'description' ? (
                <ModBodyMarkdown body={detailProject?.body ?? detailHit.description} />
              ) : detailTab === 'versions' ? (
                <div className="divide-y divide-line rounded-[8px] border border-line bg-bg-well/40">
                  {detailVersions.length === 0 ? (
                    <p className="px-4 py-10 text-center text-xs text-muted">
                      Совместимых версий не найдено
                    </p>
                  ) : (
                    detailVersions.map((ver) => {
                      const verBusy = directInstallingIds.has(ver.id);
                      return (
                        <div
                          key={ver.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-xs font-medium text-ink">
                                {ver.name}
                              </span>
                              <span className="font-mono text-[10.5px] text-faint">
                                {ver.versionType}
                              </span>
                            </div>
                            <p className="mt-0.5 font-mono text-[11px] text-muted">
                              {ver.loaders.map(formatLoaderLabel).join(', ')} ·{' '}
                              {ver.gameVersions.slice(0, 5).join(', ')}
                              {ver.gameVersions.length > 5 ? '…' : ''} ·{' '}
                              {formatShortDate(ver.datePublished)}
                            </p>
                          </div>

                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={verBusy}
                            onClick={() => void handleInstallAction(detailHit, ver)}
                          >
                            {verBusy ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Download size={12} />
                            )}
                            {verBusy ? 'Установка…' : 'Установить'}
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {detailProject?.gallery.map((img, i) => (
                    <figure
                      key={i}
                      className="overflow-hidden rounded-[8px] border border-line bg-bg-well"
                    >
                      <img
                        src={img.url}
                        alt={img.title ?? ''}
                        className="aspect-video w-full object-cover"
                        loading="lazy"
                      />
                      {(img.title || img.description) && (
                        <figcaption className="px-3 py-2 text-[11px] text-muted">
                          {img.title ?? img.description}
                        </figcaption>
                      )}
                    </figure>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div ref={topRef} className="mx-auto max-w-[1160px] px-7 py-7 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Моды</h1>
          <p className="mt-0.5 text-xs text-muted">
            Каталог {catalogSource === 'horizon' ? 'Horizon' : 'Modrinth'}
            {totalHits > 0 ? ` · ${totalHits.toLocaleString('ru-RU')} проектов` : ''}
          </p>
        </div>

        {targetInstance ? (
          <div className="flex items-center gap-2.5 rounded-[10px] border border-line-strong bg-surface/65 px-3 py-1.5 backdrop-blur-xl">
            <VoxelEmblem
              engine={targetInstance.engine}
              loader={targetInstance.loader}
              size={22}
            />
            <span className="text-xs text-muted">
              Установка в{' '}
              <span className="font-medium text-ink">{targetInstance.name}</span>{' '}
              <span className="font-mono text-[11px] text-faint">
                ({targetInstance.minecraftVersion} ·{' '}
                {targetInstance.engine === 'horizon'
                  ? 'Horizon'
                  : formatLoaderLabel(targetInstance.loader)}
                )
              </span>
            </span>
            <button
              type="button"
              onClick={onClearTargetInstance}
              title="Отвязать от сборки"
              className="ml-1 rounded p-0.5 text-muted hover:bg-bg-well hover:text-ink"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 rounded-[10px] border border-line bg-surface/55 p-1 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setManualSource('modrinth')}
              className={cn(
                'rounded-[7px] border px-3 py-1 text-xs font-medium transition-colors duration-150',
                catalogSource === 'modrinth'
                  ? 'keycap-surface text-ink'
                  : 'border-transparent text-muted hover:text-ink',
              )}
            >
              Modrinth (Java)
            </button>
            <button
              type="button"
              onClick={() => setManualSource('horizon')}
              className={cn(
                'rounded-[7px] border px-3 py-1 text-xs font-medium transition-colors duration-150',
                catalogSource === 'horizon'
                  ? 'keycap-surface text-ink'
                  : 'border-transparent text-muted hover:text-ink',
              )}
            >
              Horizon (Rust)
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2.5 rounded-[8px] border border-danger/35 bg-danger/10 px-4 py-3">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-danger" />
          <p className="text-xs leading-relaxed break-all text-danger">{error}</p>
        </div>
      )}

      {/* Поиск и фильтры */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[260px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              catalogSource === 'horizon'
                ? 'Поиск модов и шейдеров Horizon (AE2, Zoom, Atlas)…'
                : 'Поиск модов на Modrinth (Sodium, Iris, JEI)…'
            }
            autoComplete="off"
            spellCheck={false}
            className="hl-input h-9 pl-8.5 text-xs"
          />
        </div>

        {catalogSource === 'horizon' ? (
          <div className="flex items-center gap-1 rounded-[10px] border border-line bg-surface/55 p-1 backdrop-blur-xl">
            {HORIZON_KIND_FILTERS.map((kf) => (
              <button
                key={kf.id}
                type="button"
                onClick={() => setHorizonKindFilter(kf.id)}
                className={cn(
                  'rounded-[7px] border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
                  horizonKindFilter === kf.id
                    ? 'keycap-surface text-ink'
                    : 'border-transparent text-muted hover:text-ink',
                )}
              >
                {kf.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-[10px] border border-line bg-surface/55 p-1 backdrop-blur-xl">
              {MODRINTH_TYPE_FILTERS.map((tf) => (
                <button
                  key={tf.id}
                  type="button"
                  onClick={() => setModrinthTypeFilter(tf.id)}
                  className={cn(
                    'rounded-[7px] border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
                    modrinthTypeFilter === tf.id
                      ? 'keycap-surface text-ink'
                      : 'border-transparent text-muted hover:text-ink',
                  )}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            {!targetInstance && (
              <div
                aria-disabled={
                  modrinthTypeFilter === 'shader' || modrinthTypeFilter === 'resourcepack'
                }
                className={cn(
                  'flex items-center gap-1 rounded-[10px] border border-line bg-surface/55 p-1 backdrop-blur-xl transition-opacity duration-150',
                  (modrinthTypeFilter === 'shader' || modrinthTypeFilter === 'resourcepack') &&
                    'pointer-events-none opacity-35',
                )}
              >
                {LOADER_FILTERS.map((lf) => (
                  <button
                    key={lf.id}
                    type="button"
                    tabIndex={
                      modrinthTypeFilter === 'shader' || modrinthTypeFilter === 'resourcepack'
                        ? -1
                        : 0
                    }
                    onClick={() => setLoaderFilter(lf.id)}
                    className={cn(
                      'rounded-[7px] border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
                      loaderFilter === lf.id
                        ? 'keycap-surface text-ink'
                        : 'border-transparent text-muted hover:text-ink',
                    )}
                  >
                    {lf.label}
                  </button>
                ))}
              </div>
            )}

            {!targetInstance && (
              <div ref={versionMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setVersionMenuOpen((v) => !v)}
                  className={cn(
                    'flex h-[34px] items-center gap-2 rounded-[10px] border bg-surface/55 px-3 text-xs backdrop-blur-xl transition-colors',
                    versionMenuOpen || gameVersionFilter !== 'all'
                      ? 'border-line-strong text-ink'
                      : 'border-line text-muted hover:border-line-strong hover:text-ink',
                  )}
                >
                  <span className="font-mono">
                    {gameVersionFilter === 'all' ? 'Все версии' : gameVersionFilter}
                  </span>
                  <ChevronDown
                    size={12}
                    className={cn(
                      'text-faint transition-transform duration-150',
                      versionMenuOpen && 'rotate-180 text-ink',
                    )}
                  />
                </button>

                {versionMenuOpen && (
                  <div className="absolute right-0 top-full z-30 mt-1.5 w-[164px] overflow-hidden rounded-[9px] border border-line-strong bg-surface/95 p-1 shadow-[0_14px_32px_rgba(0,0,0,0.55)] backdrop-blur-xl">
                    <div className="max-h-[240px] space-y-0.5 overflow-y-auto pr-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setGameVersionFilter('all');
                          setVersionMenuOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left text-xs transition-colors',
                          gameVersionFilter === 'all'
                            ? 'bg-bg-well font-medium text-ink'
                            : 'text-muted hover:bg-bg-well/60 hover:text-ink',
                        )}
                      >
                        <span>Все версии</span>
                        {gameVersionFilter === 'all' && <Check size={12} className="text-led" />}
                      </button>
                      {releaseVersions.map((ver) => {
                        const active = gameVersionFilter === ver;
                        return (
                          <button
                            key={ver}
                            type="button"
                            onClick={() => {
                              setGameVersionFilter(ver);
                              setVersionMenuOpen(false);
                            }}
                            className={cn(
                              'flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left font-mono text-xs transition-colors',
                              active
                                ? 'bg-bg-well font-medium text-ink'
                                : 'text-muted hover:bg-bg-well/60 hover:text-ink',
                            )}
                          >
                            <span>{ver}</span>
                            {active && <Check size={12} className="text-led" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategory(cat.id)}
            className={cn(
              'rounded-[6px] border px-2.5 py-1 text-xs transition-colors',
              category === cat.id
                ? 'border-line-strong bg-surface text-ink'
                : 'border-transparent text-muted hover:bg-surface/60 hover:text-ink',
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {catalogSource === 'horizon' && (
        <div className="mt-3 rounded-[9px] border border-line bg-surface px-3.5 py-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-muted">
              <Info size={14} className="shrink-0 text-ink/70" />
              <span>
                <span className="font-medium text-ink">Контент-моды (.hmod)</span>, шейдеры и
                ресурспаки работают сразу.{' '}
                <span className="font-medium text-warn">Нативные (.hnmod)</span> требуют пересборки
                Horizon из исходников.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowHorizonGuide((v) => !v)}
              className="inline-flex shrink-0 items-center gap-1 font-medium text-ink/85 transition-colors hover:text-ink"
            >
              {showHorizonGuide ? 'Скрыть инструкцию' : 'Как запустить .hnmod?'}
              {showHorizonGuide ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          {showHorizonGuide && (
            <div className="mt-2.5 space-y-1.5 border-t border-line pt-2.5 text-[11.5px] leading-relaxed text-muted">
              <p>
                <span className="font-medium text-ink">1. Моды, которые работают без сборки:</span>{' '}
                выберите фильтр <span className="font-mono text-ink">Контент (.hmod)</span>,{' '}
                <span className="font-mono text-ink">Шейдеры</span> или{' '}
                <span className="font-mono text-ink">Ресурспаки</span> — лаунчер сам положит их в{' '}
                <code className="font-mono text-ink">horizon-mods/</code>,{' '}
                <code className="font-mono text-ink">shaderpacks/</code> или{' '}
                <code className="font-mono text-ink">resourcepacks/</code>, и игра сразу их увидит.
              </p>
              <p>
                <span className="font-medium text-ink">2. Зачем .hnmod нужна компиляция:</span>{' '}
                файлы <code className="font-mono text-ink">.hnmod</code> (например,{' '}
                <span className="font-mono">appleskin</span>,{' '}
                <span className="font-mono">mod_menu</span>) содержат Rust-миксины, которые
                встраиваются в исходный код движка до компиляции.
              </p>
              <p>
                <span className="font-medium text-ink">3. Как всё-таки запустить с .hnmod:</span>{' '}
                установите <span className="font-mono text-ink">Rust (rustup)</span> и{' '}
                <span className="font-mono text-ink">MSVC Build Tools</span>, затем воспользуйтесь
                официальным <span className="font-mono text-ink">horizon-launcher</span> (он сам
                подтянет исходники с GitHub и пересоберёт клиент с вашими{' '}
                <code className="font-mono text-ink">.hnmod</code>) либо соберите{' '}
                <span className="font-mono text-ink">horizon-rust/horizon</span> вручную через{' '}
                <code className="font-mono text-ink">horizon-mixins</code> +{' '}
                <code className="font-mono text-ink">cargo build</code>.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-5">
        {loading && hits.length === 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-[10px] border border-line bg-surface py-16 text-xs text-muted">
            <Loader2 size={15} className="animate-spin" />
            Загрузка каталога Modrinth…
          </div>
        ) : hits.length === 0 ? (
          <div className="rounded-[10px] border border-line bg-surface px-6 py-14 text-center">
            <Package size={22} className="mx-auto text-faint" strokeWidth={1.6} />
            <p className="mt-2.5 text-sm font-medium text-ink">Ничего не найдено</p>
            <p className="mt-1 text-xs text-muted">
              Попробуйте изменить поисковый запрос, загрузчик или категорию
            </p>
          </div>
        ) : (
          <div
            className={cn(
              'transition-opacity duration-150',
              loading && 'pointer-events-none opacity-55',
            )}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {hits.map((hit, idx) => {
                const hitLoaders = hit.categories.filter((c) =>
                  (KNOWN_LOADERS as readonly string[]).includes(c),
                );
                const isInstalled =
                  targetInstance !== null && installedProjectIds.has(hit.projectId);
                const isBusy = directInstallingIds.has(hit.projectId);

                return (
                  <article
                    key={hit.projectId}
                    style={{ animationDelay: `${Math.min(idx * 15, 160)}ms` }}
                    className="deck-surface hl-fade-up group flex items-start justify-between gap-3.5 rounded-[13px] p-4 transition-all duration-150 hover:-translate-y-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => void openModDetail(hit)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      {hit.iconUrl ? (
                        <img
                          src={hit.iconUrl}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-[10px] border border-line-strong bg-bg-well object-cover transition-transform duration-150 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border border-line-strong bg-bg-well font-mono text-xs font-semibold text-muted">
                          {hit.title.slice(0, 2).toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <h2 className="truncate text-[14px] font-semibold text-ink transition-colors group-hover:text-accent">
                            {hit.title}
                          </h2>
                          <span className="shrink-0 font-mono text-[11px] text-faint">
                            {formatDownloads(hit.downloads)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-faint">
                          от {hit.author}
                          {hitLoaders.length > 0 &&
                            ` · ${hitLoaders.map(formatLoaderLabel).join(', ')}`}
                          {catalogSource === 'horizon' &&
                            hit.categories.includes('Native Mod') && (
                              <span className="text-warn"> · требует пересборки (.hnmod)</span>
                            )}
                        </p>
                        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">
                          {hit.description}
                        </p>
                      </div>
                    </button>

                    <Button
                      size="sm"
                      variant={isInstalled ? 'secondary' : 'accent'}
                      disabled={isBusy}
                      onClick={() => void handleInstallAction(hit)}
                      className="shrink-0"
                    >
                      {isBusy ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : isInstalled ? (
                        <Check size={13} className="text-led" />
                      ) : (
                        <Download size={13} />
                      )}
                      {isBusy ? 'Установка…' : isInstalled ? 'Установлен' : 'Установить'}
                    </Button>
                  </article>
                );
              })}
            </div>

            {/* Пагинация */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
                <p className="font-mono text-xs text-faint">
                  Страница {page + 1} из {totalPages.toLocaleString('ru-RU')}
                </p>

                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={page === 0}
                    onClick={() => goToPage(page - 1)}
                  >
                    <ChevronLeft size={14} />
                    Назад
                  </Button>

                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const start = Math.max(0, Math.min(page - 2, totalPages - 5));
                    const p = start + i;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => goToPage(p)}
                        className={cn(
                          'h-8 min-w-[32px] rounded-[6px] border px-2 font-mono text-xs transition-colors',
                          p === page
                            ? 'border-line-strong bg-surface text-ink'
                            : 'border-transparent text-muted hover:bg-surface/60 hover:text-ink',
                        )}
                      >
                        {p + 1}
                      </button>
                    );
                  })}

                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={page >= totalPages - 1}
                    onClick={() => goToPage(page + 1)}
                  >
                    Вперёд
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Модалка выбора совместимой сборки при установке мода */}
      <Modal
        open={installTarget !== null}
        onClose={() => setInstallTarget(null)}
        title={installTarget ? `Установить «${installTarget.title}»` : ''}
        subtitle={
          installTarget?.versionNumber
            ? `Версия ${installTarget.versionNumber} · выберите совместимую сборку`
            : 'Выберите сборку, совместимую с этим модом'
        }
        className="max-w-[520px]"
      >
        {installError && (
          <div className="mb-3 flex items-start gap-2 rounded-[8px] border border-danger/35 bg-danger/10 px-3 py-2.5">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-danger" />
            <p className="text-xs text-danger">{installError}</p>
          </div>
        )}

        {instances.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm font-medium text-ink">У вас ещё нет сборок</p>
            <p className="mt-1 text-xs text-muted">
              Создайте сборку с Fabric, Forge, NeoForge или Quilt, чтобы установить мод.
            </p>
            <Button
              className="mt-4"
              variant="primary"
              size="sm"
              onClick={() => {
                setInstallTarget(null);
                onQuickCreateInstance();
              }}
            >
              <Plus size={14} />
              Создать сборку
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {compatibilityList.compatible.length === 0 ? (
              <div className="rounded-[8px] border border-line bg-bg-well/70 p-4 text-center">
                <p className="text-xs font-medium text-ink">
                  Нет совместимых сборок для этого мода
                </p>
                <p className="mt-1 text-[11.5px] text-muted">
                  Создайте сборку с подходящей версией Minecraft и загрузчиком (
                  {installTarget?.loaders.map(formatLoaderLabel).join(', ') || 'Fabric / Forge'}).
                </p>
                <Button
                  className="mt-3"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setInstallTarget(null);
                    onQuickCreateInstance();
                  }}
                >
                  <Plus size={14} />
                  Создать совместимую сборку
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-faint">
                  Совместимые сборки
                </p>
                {compatibilityList.compatible.map((inst) => {
                  const busy = installingInstanceIds.has(inst.id);
                  const done = installedIntoIds.has(inst.id);
                  return (
                    <div
                      key={inst.id}
                      className="group flex items-center justify-between gap-3 rounded-[8px] border border-line bg-bg-well/55 px-3 py-2.5 transition-colors hover:border-line-strong"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <VoxelEmblem engine={inst.engine} loader={inst.loader} size={30} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-ink">{inst.name}</p>
                          <p className="font-mono text-[11px] text-muted">
                            {inst.minecraftVersion} · {formatLoaderLabel(inst.loader)}
                          </p>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant={done ? 'secondary' : 'primary'}
                        disabled={busy}
                        onClick={() => void handleInstallIntoInstance(inst.id)}
                      >
                        {busy ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : done ? (
                          <Check size={13} className="text-led" />
                        ) : (
                          <Download size={13} />
                        )}
                        {busy ? 'Установка…' : done ? 'Установлено' : 'Установить'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {compatibilityList.incompatible.length > 0 && (
              <div className="space-y-1.5 border-t border-line pt-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-faint">
                  Несовместимые
                </p>
                {compatibilityList.incompatible.map(({ instance: inst, reason }) => (
                  <div
                    key={inst.id}
                    className="flex items-center justify-between gap-3 rounded-[8px] border border-line/60 bg-bg-well/25 px-3 py-2 opacity-60"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <VoxelEmblem engine={inst.engine} loader={inst.loader} size={24} />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink">{inst.name}</p>
                        <p className="font-mono text-[10.5px] text-muted">
                          {inst.minecraftVersion} · {formatLoaderLabel(inst.loader)}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] text-faint">{reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
