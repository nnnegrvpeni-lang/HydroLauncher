import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, Loader2, RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Switch } from './ui/Switch';
import { useInstancesStore } from '../stores/instancesStore';
import { useSettingsStore } from '../stores/settingsStore';
import { cn } from '../utils/cn';
import { formatMemory } from '../utils/format';
import { api, type HorizonReleaseSummary, type HorizonUpdateInfo, type Instance } from '../api';

interface InstanceSettingsModalProps {
  instance: Instance | null;
  onClose: () => void;
}

export function InstanceSettingsModal({ instance, onClose }: InstanceSettingsModalProps) {
  const update = useInstancesStore((s) => s.update);
  const settings = useSettingsStore((s) => s.settings);
  const systemInfo = useSettingsStore((s) => s.systemInfo);

  const [name, setName] = useState('');
  const [customMemory, setCustomMemory] = useState(false);
  const [memoryMb, setMemoryMb] = useState(4096);
  const [javaPath, setJavaPath] = useState('');
  const [jvmArgsText, setJvmArgsText] = useState('');
  const [loaderVersion, setLoaderVersion] = useState('');
  const [loaderVersions, setLoaderVersions] = useState<string[]>([]);
  const [loaderVersionsLoading, setLoaderVersionsLoading] = useState(false);
  const [loaderDropdownOpen, setLoaderDropdownOpen] = useState(false);
  const loaderDropdownRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  const [horizonReleases, setHorizonReleases] = useState<HorizonReleaseSummary[]>([]);
  const [horizonReleasesLoading, setHorizonReleasesLoading] = useState(false);
  const [horizonStatus, setHorizonStatus] = useState<HorizonUpdateInfo | null>(null);
  const [horizonChecking, setHorizonChecking] = useState(false);
  const [horizonUpdating, setHorizonUpdating] = useState(false);
  const [horizonError, setHorizonError] = useState<string | null>(null);

  useEffect(() => {
    if (!instance) return;
    setName(instance.name);
    setCustomMemory(instance.memoryMbOverride !== null);
    setMemoryMb(instance.memoryMbOverride ?? settings?.defaultMemoryMb ?? 4096);
    setJavaPath(instance.javaPathOverride ?? '');
    setJvmArgsText(instance.jvmArgs.join(' '));
    setLoaderVersion(instance.loaderVersion ?? '');
    setLoaderDropdownOpen(false);
    setHorizonStatus(null);
    setHorizonError(null);
  }, [instance, settings?.defaultMemoryMb]);

  useEffect(() => {
    if (!instance) {
      setLoaderVersions([]);
      setHorizonReleases([]);
      return;
    }
    let active = true;
    if (instance.engine === 'horizon') {
      setLoaderVersions([]);
      setHorizonReleasesLoading(true);
      api
        .listHorizonReleases()
        .then((list) => {
          if (active) setHorizonReleases(list);
        })
        .catch(() => {
          if (active) setHorizonReleases([]);
        })
        .finally(() => {
          if (active) setHorizonReleasesLoading(false);
        });
      return () => {
        active = false;
      };
    }

    setHorizonReleases([]);
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
  }, [instance]);

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

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await update(instance.id, {
        name: name.trim(),
        memoryMbOverride: customMemory ? memoryMb : null,
        javaPathOverride: javaPath.trim() ? javaPath.trim() : null,
        jvmArgs: jvmArgsText
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean),
        loaderVersion:
          instance.engine === 'horizon' || instance.loader !== 'vanilla'
            ? loaderVersion.trim() || null
            : null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(instance)}
      title="Параметры сборки"
      subtitle={`${instance.minecraftVersion} · ${instance.engine === 'horizon' ? 'Rust' : instance.loader}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={!name.trim() || saving}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <div>
        <label className="hl-field-label" htmlFor="edit-instance-name">
          Название сборки
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
            Эта сборка работает на нативном движке{' '}
            <span className="font-medium text-ink">Horizon (Rust)</span>. Лимиты памяти JVM,
            путь к Java и JVM-аргументы не используются.
          </div>

          <div>
            <span className="hl-field-label">Версия бинарников Horizon</span>
            <div ref={loaderDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setLoaderDropdownOpen((v) => !v)}
                className="hl-input flex items-center justify-between text-left text-xs"
              >
                <span className="truncate font-mono">
                  {horizonReleasesLoading
                    ? 'Загрузка релизов Horizon…'
                    : loaderVersion
                      ? horizonReleases.find((r) => r.tagName === loaderVersion)?.name ??
                        loaderVersion
                      : 'Авто (последний nightly)'}
                </span>
                <ChevronDown size={13} className="shrink-0 text-muted" />
              </button>
              {loaderDropdownOpen && (
                <div className="absolute right-0 bottom-full left-0 z-20 mb-1 max-h-44 overflow-y-auto rounded-[8px] border border-line-strong bg-surface p-1 shadow-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setLoaderVersion('');
                      setHorizonStatus(null);
                      setLoaderDropdownOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left text-xs transition-colors',
                      loaderVersion === ''
                        ? 'bg-surface-2 font-medium text-ink'
                        : 'text-muted hover:bg-surface-2/60 hover:text-ink',
                    )}
                  >
                    <span>Авто (последний nightly)</span>
                  </button>
                  {horizonReleases.map((rel) => (
                    <button
                      key={rel.tagName}
                      type="button"
                      onClick={() => {
                        setLoaderVersion(rel.tagName);
                        setHorizonStatus(null);
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

          <div className="rounded-[8px] border border-line bg-bg-well/70 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[12.5px] font-medium text-ink">
                  {loaderVersion ? `Бинарники Horizon (${loaderVersion})` : 'Обновление Horizon Nightly'}
                </p>
                <p className="text-[11.5px] text-muted">
                  {horizonStatus
                    ? !horizonStatus.installed
                      ? 'Бинарники ещё не скачаны'
                      : horizonStatus.updateAvailable
                        ? `Доступна сборка ${horizonStatus.tagName}`
                        : `Установлена актуальная сборка (${horizonStatus.tagName})`
                    : 'Проверить свежий бинарник в GitHub Releases'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={horizonChecking || horizonUpdating}
                  onClick={async () => {
                    setHorizonChecking(true);
                    setHorizonError(null);
                    try {
                      const info = await api.checkHorizonUpdate(
                        loaderVersion.trim() || undefined,
                      );
                      setHorizonStatus(info);
                    } catch (err) {
                      setHorizonError(String(err));
                    } finally {
                      setHorizonChecking(false);
                    }
                  }}
                >
                  <RefreshCw
                    size={12}
                    className={horizonChecking ? 'animate-spin' : undefined}
                  />
                  {horizonChecking ? 'Проверка…' : 'Проверить'}
                </Button>
                {horizonStatus?.updateAvailable && (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={horizonUpdating}
                    onClick={async () => {
                      setHorizonUpdating(true);
                      setHorizonError(null);
                      try {
                        const info = await api.updateHorizonBinaries(
                          instance.id,
                          loaderVersion.trim() || undefined,
                        );
                        setHorizonStatus(info);
                      } catch (err) {
                        setHorizonError(String(err));
                      } finally {
                        setHorizonUpdating(false);
                      }
                    }}
                  >
                    {horizonUpdating ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Download size={12} />
                    )}
                    {horizonUpdating ? 'Обновление…' : 'Установить'}
                  </Button>
                )}
              </div>
            </div>
            {horizonError && (
              <p className="mt-2 text-xs break-all text-danger">{horizonError}</p>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-[8px] border border-line bg-bg-well/70 p-3.5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[12.5px] font-medium text-ink">Свой лимит памяти (RAM)</p>
                <p className="text-[11.5px] text-muted">
                  По умолчанию: {formatMemory(settings?.defaultMemoryMb ?? 4096)}
                </p>
              </div>
              <Switch
                checked={customMemory}
                onChange={setCustomMemory}
                label="Свой лимит памяти"
              />
            </div>

            {customMemory && (
              <div className="mt-3.5 border-t border-line pt-3">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted">Выделено</span>
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
              Путь к Java (необязательно)
            </label>
            <input
              id="edit-instance-java"
              value={javaPath}
              onChange={(e) => setJavaPath(e.target.value)}
              placeholder="Автоматический выбор"
              autoComplete="off"
              spellCheck={false}
              className="hl-input font-mono text-xs"
            />
          </div>

          <div>
            <label className="hl-field-label" htmlFor="edit-instance-jvm">
              Аргументы JVM (через пробел)
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
              <span className="hl-field-label">Версия модлоадера ({instance.loader})</span>
              <div ref={loaderDropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setLoaderDropdownOpen((v) => !v)}
                  className="hl-input flex items-center justify-between text-left text-xs"
                >
                  <span className="truncate font-mono">
                    {loaderVersionsLoading
                      ? 'Загрузка версий лоадера…'
                      : loaderVersion || 'Авто (последняя стабильная)'}
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
                      <span>Авто (последняя стабильная)</span>
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
