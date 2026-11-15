import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Switch } from './ui/Switch';
import { useCatalogStore } from '../stores/catalogStore';
import { useInstancesStore } from '../stores/instancesStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useI18n } from '../i18n';
import { cn } from '../utils/cn';
import { formatMemory } from '../utils/format';
import { api, type InstalledHorizonBinary, type Instance } from '../api';

interface InstanceSettingsModalProps {
  instance: Instance | null;
  onClose: () => void;
}

export function InstanceSettingsModal({ instance, onClose }: InstanceSettingsModalProps) {
  const update = useInstancesStore((s) => s.update);
  const settings = useSettingsStore((s) => s.settings);
  const systemInfo = useSettingsStore((s) => s.systemInfo);
  const { t, tf, language } = useI18n();

  const [name, setName] = useState('');
  const [customMemory, setCustomMemory] = useState(false);
  const [memoryMb, setMemoryMb] = useState(4096);
  const [javaPath, setJavaPath] = useState('');
  const [jvmArgsText, setJvmArgsText] = useState('');
  const [loaderVersion, setLoaderVersion] = useState('');
  const [autoUpdateHorizon, setAutoUpdateHorizon] = useState(true);
  const [loaderVersions, setLoaderVersions] = useState<string[]>([]);
  const [loaderVersionsLoading, setLoaderVersionsLoading] = useState(false);
  const [loaderDropdownOpen, setLoaderDropdownOpen] = useState(false);
  const loaderDropdownRef = useRef<HTMLDivElement>(null);
  const [installedHorizon, setInstalledHorizon] = useState<InstalledHorizonBinary[]>([]);
  const [saving, setSaving] = useState(false);

  const horizonReleases = useCatalogStore((s) => s.horizonReleases);
  const horizonReleasesLoading = useCatalogStore((s) => s.horizonReleasesLoading);
  const ensureHorizonReleases = useCatalogStore((s) => s.ensureHorizonReleases);

  useEffect(() => {
    if (!instance) return;
    setName(instance.name);
    setCustomMemory(instance.memoryMbOverride !== null);
    setMemoryMb(instance.memoryMbOverride ?? settings?.defaultMemoryMb ?? 4096);
    setJavaPath(instance.javaPathOverride ?? '');
    setJvmArgsText(instance.jvmArgs.join(' '));
    setLoaderVersion(instance.loaderVersion ?? '');
    setAutoUpdateHorizon(instance.autoUpdateHorizon ?? true);
    setLoaderDropdownOpen(false);
  }, [instance, settings?.defaultMemoryMb]);

  useEffect(() => {
    if (!instance || instance.engine !== 'horizon') {
      setInstalledHorizon([]);
      return;
    }
    let active = true;
    api
      .listInstalledHorizonBinaries()
      .then((list) => {
        if (active) setInstalledHorizon(list);
      })
      .catch(() => {
        if (active) setInstalledHorizon([]);
      });
    return () => {
      active = false;
    };
  }, [instance]);

  useEffect(() => {
    if (!instance) {
      setLoaderVersions([]);
      return;
    }
    let active = true;
    if (instance.engine === 'horizon') {
      setLoaderVersions([]);
      void ensureHorizonReleases();
      return;
    }

    if (instance.loader === 'vanilla') {
      setLoaderVersions([]);
      return;
    }
    setLoaderVersionsLoading(true);
    api
      .getLoaderVersions(instance.loader, instance.minecraftVersion)
      .then((list) => {
        if (active) setLoaderVersions(list);
      })
      .catch(() => {
        if (active) setLoaderVersions([]);
      })
      .finally(() => {
        if (active) setLoaderVersionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [instance, ensureHorizonReleases]);

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

  if (!instance) return null;

  const maxMb = systemInfo?.totalMemoryMb ?? 8192;
  const step = 512;
  const sliderMax = Math.max(step, Math.floor(maxMb / step) * step);

  const horizonTag = loaderVersion.trim() || 'nightly';
  const installedForTag = installedHorizon.find((bin) => bin.tagName === horizonTag);
  const installedLabel = installedForTag
    ? tf('Установлено: {tag}', {
        tag: `${installedForTag.tagName}${
          installedForTag.updatedAt
            ? ` · ${new Date(installedForTag.updatedAt).toLocaleDateString(
                language === 'en' ? 'en-US' : 'ru-RU',
              )}`
            : ''
        }`,
      })
    : t('Не установлено — бинарники скачаются при первом запуске');

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const nextLoaderVersion =
      instance.engine === 'horizon' || instance.loader !== 'vanilla'
        ? loaderVersion.trim() || null
        : null;
    const prevLoaderVersion = instance.loaderVersion ?? null;
    try {
      await update(instance.id, {
        name: name.trim(),
        memoryMbOverride: customMemory ? memoryMb : null,
        javaPathOverride: javaPath.trim() ? javaPath.trim() : null,
        jvmArgs: jvmArgsText
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean),
        loaderVersion: nextLoaderVersion,
        autoUpdateHorizon,
      });
      onClose();
      if (instance.engine === 'horizon' && nextLoaderVersion !== prevLoaderVersion) {
        void api.updateHorizonBinaries(instance.id, nextLoaderVersion ?? undefined);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(instance)}
      title={t('Параметры сборки')}
      subtitle={`${instance.minecraftVersion} · ${instance.engine === 'horizon' ? 'Rust' : instance.loader}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Отмена')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={!name.trim() || saving}
          >
            {t('Сохранить')}
          </Button>
        </>
      }
    >
      <div>
        <label className="hl-field-label" htmlFor="edit-instance-name">
          {t('Название сборки')}
        </label>
        <input
          id="edit-instance-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="hl-input"
        />
      </div>

      {instance.engine === 'horizon' ? (
        <div className="space-y-3">
          <div className="rounded-[8px] border border-line bg-bg-well/70 p-3.5 text-xs leading-relaxed text-muted">
            {t('Эта сборка работает на нативном движке')}{' '}
            <span className="font-medium text-ink">Horizon (Rust)</span>
            {t('. Лимиты памяти JVM, путь к Java и JVM-аргументы не используются.')}
          </div>

          <div>
            <span className="hl-field-label">{t('Версия бинарников Horizon')}</span>
            <div ref={loaderDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setLoaderDropdownOpen((v) => !v)}
                className="hl-input flex items-center justify-between text-left text-xs"
              >
                <span className="truncate font-mono">
                  {horizonReleasesLoading
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
            <p className="mt-1.5 font-mono text-[11px] text-faint">{installedLabel}</p>
          </div>

          <div className="rounded-[8px] border border-line bg-bg-well/70 p-3.5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[12.5px] font-medium text-ink">
                  {t('Автообновление Horizon (Rust)')}
                </p>
                <p className="text-[11.5px] text-muted">
                  {loaderVersion
                    ? t('Фиксированная версия — автообновление отключено')
                    : t('Скачивать свежий nightly-билд при запуске сборки')}
                </p>
              </div>
              <Switch
                checked={loaderVersion ? false : autoUpdateHorizon}
                disabled={Boolean(loaderVersion)}
                onChange={setAutoUpdateHorizon}
                label={t('Автообновление Horizon (Rust)')}
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-[8px] border border-line bg-bg-well/70 p-3.5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[12.5px] font-medium text-ink">{t('Свой лимит памяти (RAM)')}</p>
                <p className="text-[11.5px] text-muted">
                  {tf('По умолчанию: {memory}', {
                    memory: formatMemory(settings?.defaultMemoryMb ?? 4096),
                  })}
                </p>
              </div>
              <Switch
                checked={customMemory}
                onChange={setCustomMemory}
                label={t('Свой лимит памяти')}
              />
            </div>

            {customMemory && (
              <div className="mt-3.5 border-t border-line pt-3">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted">{t('Выделено')}</span>
                  <span className="font-mono font-medium text-ink tabular-nums">
                    {formatMemory(memoryMb)}
                  </span>
                </div>
                <input
                  type="range"
                  min={step}
                  max={sliderMax}
                  step={step}
                  value={Math.min(memoryMb, sliderMax)}
                  onChange={(e) => setMemoryMb(Number(e.target.value))}
                  className="hl-range"
                />
              </div>
            )}
          </div>

          <div>
            <label className="hl-field-label" htmlFor="edit-instance-java">
              {t('Путь к Java (необязательно)')}
            </label>
            <input
              id="edit-instance-java"
              value={javaPath}
              onChange={(e) => setJavaPath(e.target.value)}
              placeholder={t('Автоматический выбор')}
              autoComplete="off"
              spellCheck={false}
              className="hl-input font-mono text-xs"
            />
          </div>

          <div>
            <label className="hl-field-label" htmlFor="edit-instance-jvm">
              {t('Аргументы JVM (через пробел)')}
            </label>
            <input
              id="edit-instance-jvm"
              value={jvmArgsText}
              onChange={(e) => setJvmArgsText(e.target.value)}
              placeholder="-XX:+UseG1GC"
              autoComplete="off"
              spellCheck={false}
              className="hl-input font-mono text-xs"
            />
          </div>

          {instance.loader !== 'vanilla' && (
            <div>
              <span className="hl-field-label">
                {tf('Версия модлоадера ({loader})', { loader: instance.loader })}
              </span>
              <div ref={loaderDropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setLoaderDropdownOpen((v) => !v)}
                  className="hl-input flex items-center justify-between text-left text-xs"
                >
                  <span className="truncate font-mono">
                    {loaderVersionsLoading
                      ? t('Загрузка версий лоадера…')
                      : loaderVersion || t('Авто (последняя стабильная)')}
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
                      <span>{t('Авто (последняя стабильная)')}</span>
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
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
