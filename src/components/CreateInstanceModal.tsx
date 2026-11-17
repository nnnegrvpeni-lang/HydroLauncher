import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, FileArchive, FolderOpen, Loader2, Palette, Search } from 'lucide-react';
import {
  api,
  type EngineKind,
  type ModLoaderKind,
  type ModrinthSearchHit,
} from '../api';
import { useCatalogStore } from '../stores/catalogStore';
import { useInstancesStore } from '../stores/instancesStore';
import { useNotifyStore } from '../stores/notifyStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useI18n } from '../i18n';
import { isJobCanceled, localizeError } from '../i18n/errors';
import { cn } from '../utils/cn';
import { formatCompactNumber } from '../utils/format';
import {
  backgroundLabel,
  randomInstanceIcon,
  symbolLabel,
  type InstanceIconConfig,
} from '../utils/instanceIcons';
import { InstanceIcon } from './InstanceIcon';
import { InstanceIconEditorModal } from './InstanceIconEditorModal';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

type CreateTab = 'custom' | 'modpack' | 'import';

const ENGINE_OPTIONS: Array<{ value: EngineKind; label: string }> = [
  { value: 'java', label: 'Java Edition' },
  { value: 'horizon', label: 'Horizon (Rust)' },
];

const LOADER_OPTIONS: Array<{ value: ModLoaderKind; label: string }> = [
  { value: 'vanilla', label: 'Vanilla' },
  { value: 'fabric', label: 'Fabric' },
  { value: 'forge', label: 'Forge' },
  { value: 'neoforge', label: 'NeoForge' },
  { value: 'quilt', label: 'Quilt' },
];

const TYPE_LABEL: Record<string, string> = {
  release: 'Релиз',
  snapshot: 'Снапшот',
  old_beta: 'Beta',
  old_alpha: 'Alpha',
};

interface CreateInstanceModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (instanceId: string) => void;
}

export function CreateInstanceModal({
  open,
  onClose,
  onCreated,
}: CreateInstanceModalProps) {
  const create = useInstancesStore((s) => s.create);
  const loadInstances = useInstancesStore((s) => s.load);
  const showSnapshots = useSettingsStore((s) => s.settings?.showSnapshots ?? false);
  const notify = useNotifyStore((s) => s.push);
  const { t, tf, language } = useI18n();

  // Подготовка идёт в фоне и не должна отменять уже созданную сборку:
  // сообщаем об ошибке, чтобы она не потерялась молча.
  const reportPrepareFailure = (err: unknown) => {
    notify(
      tf('Не удалось подготовить сборку: {error}', {
        error: localizeError(String(err), language),
      }),
      'error',
    );
  };

  const versionCatalog = useCatalogStore((s) => s.versionCatalog);
  const loading = useCatalogStore((s) => s.versionCatalogLoading);
  const loaderSupportedMc = useCatalogStore((s) => s.loaderSupportedMc);
  const loaderSupportedMcLoading = useCatalogStore((s) => s.loaderSupportedMcLoading);
  const horizonReleases = useCatalogStore((s) => s.horizonReleases);
  const horizonReleasesLoading = useCatalogStore((s) => s.horizonReleasesLoading);
  const ensureVersionCatalog = useCatalogStore((s) => s.ensureVersionCatalog);
  const ensureLoaderSupportedMc = useCatalogStore((s) => s.ensureLoaderSupportedMc);
  const ensureLoaderVersions = useCatalogStore((s) => s.ensureLoaderVersions);
  const ensureHorizonReleases = useCatalogStore((s) => s.ensureHorizonReleases);
  const getModsSearch = useCatalogStore((s) => s.getModsSearch);
  const setModsSearch = useCatalogStore((s) => s.setModsSearch);

  const allVersions = useMemo(
    () => versionCatalog?.manifest.versions ?? [],
    [versionCatalog],
  );

  const [tab, setTab] = useState<CreateTab>('custom');

  // Кастомная сборка
  const [name, setName] = useState('');
  const [versionQuery, setVersionQuery] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [engine, setEngine] = useState<EngineKind>('java');
  const [loader, setLoader] = useState<ModLoaderKind>('vanilla');
  const [loaderVersions, setLoaderVersions] = useState<string[]>([]);
  const [loaderVersion, setLoaderVersion] = useState<string>('');
  const [loaderVersionsLoading, setLoaderVersionsLoading] = useState(false);
  const [loaderDropdownOpen, setLoaderDropdownOpen] = useState(false);
  const loaderDropdownRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [iconConfig, setIconConfig] = useState<InstanceIconConfig>(() => randomInstanceIcon());
  const [iconEditorOpen, setIconEditorOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIconConfig(randomInstanceIcon());
    setIconEditorOpen(false);
  }, [open]);

  const supportedMcSet = useMemo(() => {
    if (engine !== 'java' || loader === 'vanilla') return null;
    const entry = loaderSupportedMc[loader];
    return entry ? new Set(entry.versions) : null;
  }, [engine, loader, loaderSupportedMc]);

  const supportedMcLoading =
    engine === 'java' && loader !== 'vanilla' && Boolean(loaderSupportedMcLoading[loader]);

  // Готовые сборки Modrinth
  const [packQuery, setPackQuery] = useState('');
  const [packHits, setPackHits] = useState<ModrinthSearchHit[]>([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [installingPackId, setInstallingPackId] = useState<string | null>(null);

  // Импорт .mrpack
  const [mrpackPath, setMrpackPath] = useState('');
  const [importName, setImportName] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (versionCatalog) {
      setSelectedVersion((prev) => prev || versionCatalog.manifest.latest.release);
      return;
    }
    let active = true;
    setError(null);
    ensureVersionCatalog()
      .then((catalog) => {
        if (!active || !catalog) return;
        setSelectedVersion((prev) => prev || catalog.manifest.latest.release);
      })
      .catch((err) => {
        if (active) setError(String(err));
      });
    return () => {
      active = false;
    };
  }, [open, versionCatalog, ensureVersionCatalog]);

  useEffect(() => {
    if (!open || tab !== 'modpack') return;
    const trimmed = packQuery.trim();
    const cacheKey = `modpack|${trimmed}`;
    const cached = getModsSearch(cacheKey);
    if (cached) {
      setPackHits(cached.hits);
      setPacksLoading(false);
      if (!cached.isStale) return;
    } else {
      setPacksLoading(true);
    }

    let active = true;
    setError(null);
    const delay = cached ? 0 : trimmed ? 220 : 0;
    const timer = window.setTimeout(() => {
      api
        .searchModrinthMods({
          query: trimmed,
          projectType: 'modpack',
          limit: 16,
          offset: 0,
        })
        .then((res) => {
          if (!active) return;
          setPackHits(res.hits);
          setModsSearch(cacheKey, res.hits, res.totalHits);
        })
        .catch((err) => {
          if (active && !cached) setError(String(err));
        })
        .finally(() => {
          if (active) setPacksLoading(false);
        });
    }, delay);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, tab, packQuery, getModsSearch, setModsSearch]);

  useEffect(() => {
    if (!open || tab !== 'custom' || engine !== 'java' || loader === 'vanilla') {
      return;
    }
    void ensureLoaderSupportedMc(loader);
  }, [open, tab, engine, loader, ensureLoaderSupportedMc]);

  useEffect(() => {
    if (
      !open ||
      tab !== 'custom' ||
      engine !== 'java' ||
      loader === 'vanilla' ||
      !supportedMcSet ||
      supportedMcSet.size === 0 ||
      allVersions.length === 0
    ) {
      return;
    }
    if (!supportedMcSet.has(selectedVersion)) {
      const fallback = allVersions.find(
        (v) => (showSnapshots || v.type === 'release') && supportedMcSet.has(v.id),
      );
      if (fallback) {
        setSelectedVersion(fallback.id);
      }
    }
  }, [open, tab, engine, loader, supportedMcSet, allVersions, showSnapshots, selectedVersion]);

  useEffect(() => {
    if (!open || tab !== 'custom') return;
    if (engine === 'horizon') {
      setLoaderVersions([]);
      setLoaderVersion('');
      void ensureHorizonReleases();
      return;
    }
    if (loader === 'vanilla' || !selectedVersion) {
      setLoaderVersions([]);
      setLoaderVersion('');
      return;
    }
    let active = true;
    setLoaderVersionsLoading(true);
    setLoaderVersion('');
    ensureLoaderVersions(loader, selectedVersion)
      .then((list) => {
        if (active) setLoaderVersions(list);
      })
      .finally(() => {
        if (active) setLoaderVersionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, tab, engine, loader, selectedVersion, ensureLoaderVersions, ensureHorizonReleases]);

  useEffect(() => {
    if (!loaderDropdownOpen) return;
    const onDown = (e: MouseEvent) => {
      if (loaderDropdownRef.current && !loaderDropdownRef.current.contains(e.target as Node)) {
        setLoaderDropdownOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [loaderDropdownOpen]);

  const submitCustom = async () => {
    try {
      setError(null);
      const created = await create({
        name: name.trim(),
        minecraftVersion: selectedVersion,
        engine,
        loader,
        loaderVersion:
          (engine === 'horizon' || loader !== 'vanilla') && loaderVersion
            ? loaderVersion
            : null,
        icon: iconConfig.icon,
        background: iconConfig.background,
      });
      setName('');
      setVersionQuery('');
      setLoaderVersion('');
      onCreated?.(created.id);
      onClose();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleInstallModpack = async (hit: ModrinthSearchHit) => {
    setInstallingPackId(hit.projectId);
    setError(null);
    try {
      const created = await api.installModrinthModpack(hit.projectId);
      await loadInstances();
      void api.prepareInstance(created.id).catch(reportPrepareFailure);
      onCreated?.(created.id);
      onClose();
    } catch (err) {
      if (!isJobCanceled(String(err))) setError(String(err));
    } finally {
      setInstallingPackId(null);
    }
  };

  const handlePickMrpack = async () => {
    setError(null);
    try {
      const picked = await api.pickMrpackFile();
      if (picked) setMrpackPath(picked);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleImportMrpack = async () => {
    if (!mrpackPath.trim()) return;
    setImporting(true);
    setError(null);
    try {
      const created = await api.importMrpackFile(
        mrpackPath.trim(),
        importName.trim() || undefined,
      );
      await loadInstances();
      void api.prepareInstance(created.id).catch(reportPrepareFailure);
      setMrpackPath('');
      setImportName('');
      onCreated?.(created.id);
      onClose();
    } catch (err) {
      if (!isJobCanceled(String(err))) setError(String(err));
    } finally {
      setImporting(false);
    }
  };

  const filteredByType = allVersions.filter((v) =>
    showSnapshots ? true : v.type === 'release',
  );
  const visibleVersions = filteredByType
    .filter((v) => v.id.toLowerCase().includes(versionQuery.trim().toLowerCase()))
    .slice(0, 80);

  const loaderUnavailable =
    engine === 'java' &&
    loader !== 'vanilla' &&
    !loaderVersionsLoading &&
    loaderVersions.length === 0;

  return (
    <Modal
      open={open}
      title={t('Новая сборка')}
      subtitle={t('Кастомная конфигурация, модпак Modrinth или импорт .mrpack')}
      onClose={onClose}
      className="max-w-[780px]"
      footer={
        tab === 'custom' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('Отмена')}
            </Button>
            <Button
              variant="accent"
              onClick={() => void submitCustom()}
              disabled={!name.trim() || !selectedVersion || loaderUnavailable}
            >
              {t('Создать')}
            </Button>
          </>
        ) : tab === 'import' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('Отмена')}
            </Button>
            <Button
              variant="accent"
              onClick={() => void handleImportMrpack()}
              disabled={!mrpackPath.trim() || importing}
            >
              {importing && <Loader2 size={13} className="animate-spin" />}
              {importing ? t('Импорт…') : t('Импортировать')}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            {t('Закрыть')}
          </Button>
        )
      }
    >
      <div className="grid grid-cols-3 gap-1 rounded-[9px] border border-line bg-bg-well p-1">
        {(
          [
            { id: 'custom', label: 'Кастомная' },
            { id: 'modpack', label: 'Modrinth' },
            { id: 'import', label: 'Импорт .mrpack' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setError(null);
              setTab(item.id);
            }}
            className={cn(
              'h-8 rounded-[7px] border px-2.5 text-xs font-medium transition-colors duration-150',
              tab === item.id
                ? 'keycap-surface text-ink'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t(item.label)}
          </button>
        ))}
      </div>

      {tab === 'custom' && (
        <div className={cn(engine === 'java' ? 'grid grid-cols-1 gap-5 md:grid-cols-2' : 'space-y-4')}>
          <div className="space-y-4">
            <div>
              <label className="hl-field-label" htmlFor="instance-name">
                {t('Название')}
              </label>
              <input
                id="instance-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('Например, Survival 26.3')}
                autoComplete="off"
                spellCheck={false}
                className="hl-input"
                autoFocus
              />
            </div>

            <div>
              <span className="hl-field-label">{t('Оформление')}</span>
              <div className="flex items-center gap-3 rounded-[10px] border border-line bg-bg-well/55 p-2">
                <InstanceIcon
                  icon={iconConfig.icon}
                  background={iconConfig.background}
                  seed={name || 'new-instance'}
                  className="h-[52px] w-[52px] shrink-0 rounded-[9px]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-ink">
                    {t(symbolLabel(iconConfig.icon))}
                  </p>
                  <p className="truncate text-[11px] text-faint">
                    {t(backgroundLabel(iconConfig.background))}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setIconEditorOpen(true)}>
                  <Palette size={12.5} />
                  {t('Изменить')}
                </Button>
              </div>
            </div>

            <div>
              <span className="hl-field-label">{t('Движок')}</span>
              <div className="grid grid-cols-2 gap-1.5 rounded-[9px] border border-line bg-bg-well p-1">
                {ENGINE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setEngine(option.value);
                      if (option.value === 'horizon') {
                        setLoader('vanilla');
                        setSelectedVersion('26.3');
                      } else if (selectedVersion === '26.3' && allVersions.length > 0) {
                        setSelectedVersion(
                          allVersions.find((v) => v.type === 'release')?.id ?? allVersions[0].id,
                        );
                      }
                    }}
                    className={cn(
                      'flex h-8 items-center justify-center gap-2 rounded-[7px] border px-3 text-xs font-medium transition-colors duration-150',
                      engine === option.value
                        ? 'keycap-surface text-ink'
                        : 'border-transparent text-muted hover:text-ink',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

          {engine === 'horizon' ? (
            <div className="space-y-3">
              <div className="rounded-[10px] border border-line bg-bg-well/70 p-4 text-xs leading-relaxed text-muted">
                <div className="flex items-center justify-between text-ink">
                  <span className="font-medium">{t('Нативный движок Horizon (Rust)')}</span>
                  <span className="font-mono text-[11px] text-muted">Minecraft 26.3</span>
                </div>
                <p className="mt-2">
                  {t(
                    'Запускается нативно без JVM. После создания сборки лаунчер скачает бинарники Horizon с GitHub и подготовит ресурсы официального клиента 26.3.',
                  )}
                </p>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="hl-field-label mb-0">{t('Версия бинарников Horizon')}</span>
                  <span className="font-mono text-[11px] text-faint">
                    {horizonReleasesLoading && horizonReleases.length === 0
                      ? t('Загрузка…')
                      : horizonReleases.length > 0
                        ? tf('Доступно: {count}', { count: horizonReleases.length })
                        : ''}
                  </span>
                </div>
                <div ref={loaderDropdownRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setLoaderDropdownOpen((v) => !v)}
                    className="hl-input flex items-center justify-between text-left text-xs"
                  >
                    <span className="truncate font-mono">
                      {horizonReleasesLoading && horizonReleases.length === 0
                        ? t('Загрузка релизов Horizon…')
                        : loaderVersion
                          ? horizonReleases.find((r) => r.tagName === loaderVersion)?.name ??
                            loaderVersion
                          : t('Авто (последний nightly)')}
                    </span>
                    <ChevronDown size={13} className="shrink-0 text-muted" />
                  </button>
                  {loaderDropdownOpen && (
                    <div className="absolute right-0 bottom-full left-0 z-20 mb-1 max-h-44 overflow-y-auto rounded-[8px] border border-line-strong bg-surface p-1 shadow-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setLoaderVersion('');
                          setLoaderDropdownOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left text-xs transition-colors',
                          loaderVersion === ''
                            ? 'bg-surface-2 font-medium text-ink'
                            : 'text-muted hover:bg-surface-2/60 hover:text-ink',
                        )}
                      >
                        <span>{t('Авто (последний nightly)')}</span>
                      </button>
                      {horizonReleases.map((rel) => (
                        <button
                          key={rel.tagName}
                          type="button"
                          onClick={() => {
                            setLoaderVersion(rel.tagName);
                            setLoaderDropdownOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-xs transition-colors',
                            loaderVersion === rel.tagName
                              ? 'bg-surface-2 font-medium text-ink'
                              : 'text-muted hover:bg-surface-2/60 hover:text-ink',
                          )}
                        >
                          <span className="truncate font-mono">{rel.tagName}</span>
                          <span className="shrink-0 text-[11px] text-faint">{rel.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div>
                <span className="hl-field-label">{t('Модлоадер')}</span>
                <div className="flex flex-wrap gap-1.5">
                  {LOADER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setLoader(option.value)}
                      className={cn(
                        'flex h-8 items-center justify-center rounded-[7px] border px-3 text-xs font-medium transition-colors duration-150',
                        loader === option.value
                          ? 'keycap-surface text-ink'
                          : 'border-line bg-bg-well text-muted hover:border-line-strong hover:text-ink',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {loader !== 'vanilla' && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="hl-field-label mb-0">{t('Версия модлоадера')}</span>
                    <span className="font-mono text-[11px] text-faint">
                      {loaderVersionsLoading
                        ? t('Проверка…')
                        : loaderVersions.length > 0
                          ? tf('Доступно: {count}', { count: loaderVersions.length })
                          : t('Недоступно')}
                    </span>
                  </div>
                  <div ref={loaderDropdownRef} className="relative">
                    <button
                      type="button"
                      disabled={loaderVersionsLoading || loaderVersions.length === 0}
                      onClick={() => setLoaderDropdownOpen((v) => !v)}
                      className={cn(
                        'hl-input flex items-center justify-between text-left text-xs',
                        loaderUnavailable && 'border-danger/60 text-danger',
                      )}
                    >
                      <span className="truncate font-mono">
                        {loaderVersionsLoading
                          ? t('Загрузка версий лоадера…')
                          : loaderVersions.length === 0
                            ? tf('Нет версий для {version}', { version: selectedVersion })
                            : loaderVersion || tf('Авто ({version})', { version: loaderVersions[0] })}
                      </span>
                      <ChevronDown size={13} className="shrink-0 text-muted" />
                    </button>
                    {loaderDropdownOpen && loaderVersions.length > 0 && (
                      <div className="absolute right-0 bottom-full left-0 z-20 mb-1 max-h-48 overflow-y-auto rounded-[9px] border border-line-strong bg-surface/96 p-1 shadow-xl backdrop-blur-2xl">
                        <button
                          type="button"
                          onClick={() => {
                            setLoaderVersion('');
                            setLoaderDropdownOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left text-xs transition-colors',
                            loaderVersion === ''
                              ? 'bg-surface-2 font-medium text-ink'
                              : 'text-muted hover:bg-surface-2/60 hover:text-ink',
                          )}
                        >
                          <span>{tf('Авто (последняя: {version})', { version: loaderVersions[0] })}</span>
                        </button>
                        {loaderVersions.map((lv) => (
                          <button
                            key={lv}
                            type="button"
                            onClick={() => {
                              setLoaderVersion(lv);
                              setLoaderDropdownOpen(false);
                            }}
                            className={cn(
                              'flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left font-mono text-xs transition-colors',
                              loaderVersion === lv
                                ? 'bg-surface-2 font-medium text-ink'
                                : 'text-muted hover:bg-surface-2/60 hover:text-ink',
                            )}
                          >
                            <span>{lv}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {loaderUnavailable && (
                    <p className="mt-1.5 text-[11px] text-danger">
                      {tf(
                        'Для Minecraft {version} нет сборок этого модлоадера. Выберите другой лоадер или версию игры.',
                        { version: selectedVersion },
                      )}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          </div>

          {engine === 'java' && (
            <div className="flex flex-col">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="hl-field-label mb-0">
                  {tf('Версия Minecraft ({count})', { count: filteredByType.length })}
                  {supportedMcLoading && (
                    <span className="ml-2 font-normal text-faint">{t('проверка…')}</span>
                  )}
                </span>
                {selectedVersion && (
                  <span className="font-mono text-[11.5px] font-medium text-accent">
                    {selectedVersion}
                  </span>
                )}
              </div>

              <div className="relative">
                <Search
                  size={13}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
                />
                <input
                  value={versionQuery}
                  onChange={(e) => setVersionQuery(e.target.value)}
                  placeholder={loading ? t('Загрузка версий…') : t('Поиск версии…')}
                  autoComplete="off"
                  spellCheck={false}
                  className="hl-input pl-8"
                  disabled={loading}
                />
              </div>

              {loading ? (
                <div className="mt-3 flex h-[270px] items-center justify-center gap-2 rounded-[9px] border border-line bg-bg-well text-xs text-muted">
                  <Loader2 size={14} className="animate-spin" />
                  {t('Загружаем каталог версий Mojang…')}
                </div>
              ) : visibleVersions.length > 0 ? (
                <div className="mt-2 h-[270px] divide-y divide-line overflow-y-auto rounded-[9px] border border-line bg-bg-well">
                  {visibleVersions.map((v) => {
                    const selected = selectedVersion === v.id;
                    const supported =
                      loader === 'vanilla' || !supportedMcSet || supportedMcSet.has(v.id);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        disabled={!supported}
                        onClick={() => {
                          if (supported) setSelectedVersion(v.id);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors',
                          !supported
                            ? 'cursor-not-allowed text-faint opacity-35'
                            : selected
                              ? 'bg-surface-2 font-medium text-ink'
                              : 'text-muted hover:bg-surface/60 hover:text-ink',
                        )}
                      >
                        <span className="font-mono">{v.id}</span>
                        <span className="text-[11px] text-faint">
                          {supported ? t(TYPE_LABEL[v.type] ?? v.type) : t('Недоступно')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                !error && (
                  <div className="mt-2 flex h-[270px] items-center justify-center rounded-[9px] border border-line bg-bg-well text-xs text-muted">
                    {t('Подходящих версий не найдено.')}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'modpack' && (
        <div className="space-y-3">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
            />
            <input
              value={packQuery}
              onChange={(e) => setPackQuery(e.target.value)}
              placeholder={t('Поиск сборок на Modrinth (например, Fabulously Optimized)…')}
              autoComplete="off"
              spellCheck={false}
              className="hl-input pl-8"
              autoFocus
            />
          </div>

          {packsLoading ? (
            <div className="flex h-[340px] items-center justify-center gap-2 rounded-[9px] border border-line bg-bg-well text-xs text-muted">
              <Loader2 size={14} className="animate-spin" />
              {t('Поиск модпаков Modrinth…')}
            </div>
          ) : packHits.length === 0 ? (
            <div className="flex h-[340px] items-center justify-center rounded-[9px] border border-line bg-bg-well text-xs text-muted">
              {t('Модпаки не найдены')}
            </div>
          ) : (
            <div className="h-[340px] divide-y divide-line overflow-y-auto rounded-[9px] border border-line bg-bg-well">
              {packHits.map((hit) => {
                const busy = installingPackId === hit.projectId;
                return (
                  <div
                    key={hit.projectId}
                    className="flex items-center justify-between gap-4 px-3.5 py-3 transition-colors hover:bg-surface/40"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      {hit.iconUrl ? (
                        <img
                          src={hit.iconUrl}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-[8px] border border-line bg-surface object-cover"
                        />
                      ) : (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-line bg-surface text-xs text-faint">
                          <FileArchive size={16} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <p className="truncate text-[13px] font-semibold text-ink">
                            {hit.title}
                          </p>
                          <span className="shrink-0 text-[11px] text-faint">
                            {hit.author} · {tf('{count} скачиваний', {
                              count: formatCompactNumber(hit.downloads),
                            })}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted">
                          {hit.description}
                        </p>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="accent"
                      className="shrink-0"
                      disabled={Boolean(installingPackId)}
                      onClick={() => void handleInstallModpack(hit)}
                    >
                      {busy ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Download size={12} />
                      )}
                      {busy ? t('Установка…') : t('Установить')}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'import' && (
        <div className="space-y-3">
          <div>
            <label className="hl-field-label" htmlFor="mrpack-path">
              {t('Файл модпака (.mrpack)')}
            </label>
            <div className="flex gap-2">
              <input
                id="mrpack-path"
                value={mrpackPath}
                onChange={(e) => setMrpackPath(e.target.value)}
                placeholder={t('Выберите .mrpack файл…')}
                autoComplete="off"
                spellCheck={false}
                className="hl-input font-mono text-xs"
              />
              <Button variant="secondary" onClick={() => void handlePickMrpack()}>
                <FolderOpen size={13} />
                {t('Обзор…')}
              </Button>
            </div>
          </div>

          <div>
            <label className="hl-field-label" htmlFor="mrpack-name">
              {t('Название сборки (необязательно)')}
            </label>
            <input
              id="mrpack-name"
              value={importName}
              onChange={(e) => setImportName(e.target.value)}
              placeholder={t('По умолчанию из modrinth.index.json')}
              autoComplete="off"
              spellCheck={false}
              className="hl-input"
            />
          </div>

          <p className="text-[11.5px] leading-relaxed text-muted">
            {t(
              'Лаунчер распакует overrides, определит версию Minecraft и модлоадер, и скачает все моды из манифеста сборки.',
            )}
          </p>
        </div>
      )}

      {error && (
        <p className="text-xs break-all text-danger">{localizeError(error, language)}</p>
      )}

      <InstanceIconEditorModal
        open={iconEditorOpen}
        config={iconConfig}
        seed={name || 'new-instance'}
        onClose={() => setIconEditorOpen(false)}
        onApply={setIconConfig}
      />
    </Modal>
  );
}
