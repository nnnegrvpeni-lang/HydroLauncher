import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  ArrowUpCircle,
  Camera,
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  Globe,
  History,
  Layers,
  Loader2,
  Package,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  api,
  type GameLog,
  type InstalledModFile,
  type Instance,
  type InstanceScreenshot,
  type InstanceWorld,
  type ModUpdateInfo,
  type ModrinthVersionInfo,
  type WorldBackupEntry,
} from '../api';
import { useAccountsStore } from '../stores/accountsStore';
import { useInstancesStore } from '../stores/instancesStore';
import { useLaunchStore } from '../stores/launchStore';
import { useNotifyStore } from '../stores/notifyStore';
import { useI18n } from '../i18n';
import { isJobCanceled, localizeError } from '../i18n/errors';
import { cn } from '../utils/cn';
import { formatBytes, formatLoaderLabel } from '../utils/format';
import { InstanceIcon } from './InstanceIcon';
import { Button, IconButton } from './ui/Button';
import { Modal } from './ui/Modal';
import { Switch } from './ui/Switch';

type ModalTab = 'mods' | 'shaders' | 'resourcepacks' | 'worlds' | 'screenshots' | 'logs';

const EMPTY_LOGS: GameLog[] = [];

interface InstanceModsModalProps {
  instance: Instance | null;
  onClose: () => void;
  onInstallMods: (instanceId: string) => void;
  onOpenSettings?: () => void;
}



function formatWorldDate(ms: number, language: 'ru' | 'en' = 'ru'): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString(language === 'en' ? 'en-US' : 'ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatBackupDate(ms: number, language: 'ru' | 'en'): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(language === 'en' ? 'en-US' : 'ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Запасной парсер чистого имени, если мод локальный и н�� найден на Modrinth. */
function fallbackModTitle(fileName: string): string {
  const base = fileName.replace(/\.jar(\.disabled)?$/i, '');
  const clean = base.replace(/[-_](fabric|forge|neoforge|quilt|mc)?[-_]?\d+.*$/i, '');
  return (clean || base).replace(/[-_]+/g, ' ');
}

export function InstanceModsModal({
  instance,
  onClose,
  onInstallMods,
  onOpenSettings,
}: InstanceModsModalProps) {
  const [tab, setTab] = useState<ModalTab>('mods');
  const running = useInstancesStore((s) => s.running);
  const launch = useInstancesStore((s) => s.launch);
  const terminate = useInstancesStore((s) => s.terminate);
  const updateInstance = useInstancesStore((s) => s.update);
  const activeAccount = useAccountsStore((s) => s.activeAccount);
  const logsByInstance = useLaunchStore((s) => s.logsByInstance);
  const clearLogs = useLaunchStore((s) => s.clearLogs);
  const { t, tf, language } = useI18n();

  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [logsCopied, setLogsCopied] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [mods, setMods] = useState<InstalledModFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [updates, setUpdates] = useState<Record<string, ModUpdateInfo>>({});
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updatingFile, setUpdatingFile] = useState<string | null>(null);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [installingLocal, setInstallingLocal] = useState(false);
  const [updatesCheckedOnce, setUpdatesCheckedOnce] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState<ModUpdateInfo[] | null>(null);

  const [versionPickerMod, setVersionPickerMod] = useState<InstalledModFile | null>(null);
  const [versions, setVersions] = useState<ModrinthVersionInfo[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [switchingVersionId, setSwitchingVersionId] = useState<string | null>(null);

  const [screenshots, setScreenshots] = useState<InstanceScreenshot[]>([]);
  const [screenshotsLoading, setScreenshotsLoading] = useState(false);

  const [worlds, setWorlds] = useState<InstanceWorld[]>([]);
  const [worldsLoading, setWorldsLoading] = useState(false);
  const [busyWorld, setBusyWorld] = useState<string | null>(null);
  const [pendingWorldDelete, setPendingWorldDelete] = useState<string | null>(null);
  const [backups, setBackups] = useState<WorldBackupEntry[]>([]);
  const [expandedWorld, setExpandedWorld] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<{
    world: string;
    file: string;
  } | null>(null);
  const [pendingBackupDelete, setPendingBackupDelete] = useState<{
    world: string;
    file: string;
  } | null>(null);

  const loadMods = useCallback(async (instanceId: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.getInstalledMods(instanceId);
      setMods(list);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadScreenshots = useCallback(async (instanceId: string) => {
    setScreenshotsLoading(true);
    setError(null);
    try {
      const list = await api.getInstanceScreenshots(instanceId);
      setScreenshots(list);
    } catch (err) {
      setError(String(err));
    } finally {
      setScreenshotsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (instance) {
      setTab('mods');
      setVersionPickerMod(null);
      setUpdates({});
      setUpdatesCheckedOnce(false);
      setRenaming(false);
      setDraftName(instance.name);
      void loadMods(instance.id);
    }
  }, [instance?.id, loadMods]);

  useEffect(() => {
    if (instance && tab === 'screenshots') {
      void loadScreenshots(instance.id);
    }
  }, [instance, tab, loadScreenshots]);

  const loadWorlds = useCallback(async (instanceId: string) => {
    setWorldsLoading(true);
    setError(null);
    try {
      const [list, backupList] = await Promise.all([
        api.listInstanceWorlds(instanceId),
        api.listWorldBackups(instanceId),
      ]);
      setWorlds(list);
      setBackups(backupList);
    } catch (err) {
      setError(String(err));
    } finally {
      setWorldsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (instance && tab === 'worlds') {
      void loadWorlds(instance.id);
    }
  }, [instance, tab, loadWorlds]);

  const handleBackupWorld = async (folderName: string) => {
    if (!instance) return;
    setBusyWorld(folderName);
    setError(null);
    try {
      const backup = await api.backupInstanceWorld(instance.id, folderName);
      setBackups(await api.listWorldBackups(instance.id));
      setExpandedWorld(folderName);
      useNotifyStore
        .getState()
        .push(tf('Резервная копия мира создана: {file}', { file: backup.fileName }));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusyWorld(null);
    }
  };

  const handleRestoreBackup = async (world: string, fileName: string) => {
    if (!instance) return;
    setBackupBusy(fileName);
    setError(null);
    try {
      await api.restoreWorldBackup(instance.id, world, fileName);
      await loadWorlds(instance.id);
      setPendingRestore(null);
      useNotifyStore
        .getState()
        .push(tf('Мир восстановлен из копии {file}', { file: fileName }));
    } catch (err) {
      setError(String(err));
    } finally {
      setBackupBusy(null);
    }
  };

  const handleDeleteBackup = async (world: string, fileName: string) => {
    if (!instance) return;
    setBackupBusy(fileName);
    setError(null);
    try {
      await api.deleteWorldBackup(instance.id, world, fileName);
      setBackups((prev) =>
        prev.filter(
          (backup) => !(backup.worldFolder === world && backup.fileName === fileName),
        ),
      );
      setPendingBackupDelete(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setBackupBusy(null);
    }
  };

  const handleDeleteWorld = async (folderName: string) => {
    if (!instance) return;
    setBusyWorld(folderName);
    setError(null);
    try {
      await api.deleteInstanceWorld(instance.id, folderName);
      setWorlds((prev) => prev.filter((world) => world.folderName !== folderName));
      setPendingWorldDelete(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusyWorld(null);
    }
  };

  useEffect(() => {
    if (!instance) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (versionPickerMod) {
          setVersionPickerMod(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [instance, versionPickerMod, onClose]);

  const handleToggleMod = async (fileName: string) => {
    if (!instance) return;
    setError(null);
    try {
      const newName = await api.toggleInstalledMod(instance.id, fileName);
      setMods((prev) =>
        prev.map((m) => (m.fileName === fileName ? { ...m, fileName: newName } : m)),
      );
    } catch (err) {
      setError(String(err));
    }
  };

  const handleCheckUpdates = async () => {
    if (!instance) return;
    setCheckingUpdates(true);
    setError(null);
    try {
      const list = await api.checkModUpdates(instance.id);
      const map: Record<string, ModUpdateInfo> = {};
      for (const item of list) {
        map[item.fileName] = item;
      }
      setUpdates(map);
      setUpdatesCheckedOnce(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setCheckingUpdates(false);
    }
  };

  const applyUpdates = async (list: ModUpdateInfo[]) => {
    if (!instance || list.length === 0) return;
    const single = list.length === 1;
    if (single) setUpdatingFile(list[0].fileName);
    else setUpdatingAll(true);
    setError(null);
    let done = 0;
    for (const upd of list) {
      try {
        await api.installModrinthMod(instance.id, upd.projectId, upd.latestVersionId);
        done += 1;
        setUpdates((prev) => {
          const next = { ...prev };
          delete next[upd.fileName];
          return next;
        });
      } catch (err) {
        if (!isJobCanceled(String(err))) setError(String(err));
        else break;
      }
    }
    await loadMods(instance.id);
    if (single) setUpdatingFile(null);
    else {
      setUpdatingAll(false);
      if (done > 0) {
        useNotifyStore.getState().push(tf('Обновлено модов: {count}', { count: done }));
      }
    }
  };

  const confirmUpdates = async () => {
    const list = pendingUpdates;
    setPendingUpdates(null);
    if (list) await applyUpdates(list);
  };

  const handleInstallLocalMod = async () => {
    if (!instance) return;
    try {
      const path = await api.pickLocalMod();
      if (!path) return;
      setInstallingLocal(true);
      setError(null);
      await api.installLocalMod(instance.id, path);
      await loadMods(instance.id);
      useNotifyStore.getState().push(t('Мод добавлен в сборку'));
    } catch (err) {
      setError(String(err));
    } finally {
      setInstallingLocal(false);
    }
  };

  const handleRemove = async (fileName: string) => {
    if (!instance) return;
    setError(null);
    try {
      await api.removeInstalledMod(instance.id, fileName);
      setMods((prev) => prev.filter((m) => m.fileName !== fileName));
    } catch (err) {
      setError(String(err));
    }
  };

  const handleOpenFolder = async (subfolder?: 'mods' | 'game') => {
    if (!instance) return;
    try {
      await api.openInstanceFolder(instance.id, subfolder);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDeleteScreenshot = async (fileName: string) => {
    if (!instance) return;
    setError(null);
    try {
      await api.deleteInstanceScreenshot(instance.id, fileName);
      setScreenshots((prev) => prev.filter((s) => s.fileName !== fileName));
    } catch (err) {
      setError(String(err));
    }
  };

  const openVersionPicker = async (mod: InstalledModFile) => {
    if (!instance || !mod.projectId) return;
    setVersionPickerMod(mod);
    setVersions([]);
    setVersionsLoading(true);
    setError(null);
    try {
      if (instance.engine === 'horizon') {
        const details = await api.getHorizonModDetails(mod.projectId);
        setVersions(
          details.versions.map((v) => ({
            id: v.version,
            name: `${details.name} ${v.version}`,
            versionNumber: v.version,
            versionType: 'release',
            gameVersions: [v.game],
            loaders: ['horizon'],
            datePublished: v.published,
            downloads: details.downloads,
          })),
        );
      } else {
        const list = await api.getModrinthVersions(
          mod.projectId,
          instance.loader === 'vanilla' ? undefined : instance.loader,
          instance.minecraftVersion,
        );
        setVersions(list);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleSwitchVersion = async (ver: ModrinthVersionInfo) => {
    if (!instance || !versionPickerMod?.projectId) return;
    setSwitchingVersionId(ver.id);
    setError(null);
    try {
      if (instance.engine === 'horizon') {
        await api.installHorizonMod(instance.id, versionPickerMod.projectId, ver.versionNumber);
      } else {
        await api.installModrinthMod(instance.id, versionPickerMod.projectId, ver.id);
      }
      setVersionPickerMod(null);
      await loadMods(instance.id);
    } catch (err) {
      if (!isJobCanceled(String(err))) setError(String(err));
    } finally {
      setSwitchingVersionId(null);
    }
  };

  const instanceLogs = instance ? (logsByInstance[instance.id] ?? EMPTY_LOGS) : EMPTY_LOGS;

  useEffect(() => {
    if (tab === 'logs' && logsEndRef.current) {
      logsEndRef.current.scrollTop = logsEndRef.current.scrollHeight;
    }
  }, [tab, instanceLogs.length]);

  const handleSaveName = async () => {
    if (!instance) return;
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === instance.name) {
      setRenaming(false);
      setDraftName(instance.name);
      return;
    }
    setSavingName(true);
    try {
      await updateInstance(instance.id, { name: trimmed });
      setRenaming(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingName(false);
    }
  };

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(instanceLogs.map((l) => l.line).join('\n'));
      setLogsCopied(true);
      setTimeout(() => setLogsCopied(false), 1400);
    } catch {
      // ignore clipboard errors
    }
  };

  if (!instance) return null;

  const runtimeState = running.get(instance.id);
  const runtimeLocked = Boolean(runtimeState);
  const isRunning = runtimeState === 'running';
  const isBusy = runtimeState === 'preparing' || runtimeState === 'launching';
  const canLaunch = Boolean(activeAccount);

  const supportsMods = instance.engine === 'horizon' || instance.loader !== 'vanilla';
  const engineOrLoaderLabel =
    instance.engine === 'horizon' ? 'Horizon (Rust)' : formatLoaderLabel(instance.loader);
  const updatesCount = Object.keys(updates).length;

  const modItems = mods.filter((m) => m.kind === 'mod' || !m.kind);
  const shaderItems = mods.filter((m) => m.kind === 'shader');
  const resourcepackItems = mods.filter((m) => m.kind === 'resourcepack');

  const visibleItems =
    tab === 'shaders'
      ? shaderItems
      : tab === 'resourcepacks'
        ? resourcepackItems
        : modItems;

  const emptyLabel =
    tab === 'shaders'
      ? 'шейдеров'
      : tab === 'resourcepacks'
        ? 'ресурспаков'
        : 'модов';

  return (
    <div className="hl-fade-up fixed inset-0 top-[48px] z-30 overflow-y-auto bg-bg/75 backdrop-blur-2xl [scrollbar-gutter:stable]">
      <div className="mx-auto max-w-[1080px] px-7 py-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-line-strong bg-surface/65 px-3 text-xs font-medium text-muted backdrop-blur-md transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <ArrowLeft size={13} />
              {t('Назад')}
            </button>

            <div className="flex items-center gap-3">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-[11px] border border-line-strong shadow-[0_10px_22px_-14px_rgba(0,0,0,0.75)]">
                <InstanceIcon
                  icon={instance.icon}
                  background={instance.background}
                  seed={instance.id}
                  className="h-full w-full"
                />
              </div>
              <div>
                {renaming ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleSaveName();
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setRenaming(false);
                          setDraftName(instance.name);
                        }
                      }}
                      autoFocus
                      disabled={savingName}
                      className="hl-input h-7.5 w-52 px-2.5 text-[15px] font-semibold"
                    />
                    <button
                      type="submit"
                      disabled={savingName || !draftName.trim()}
                      title={t('Сохранить название')}
                      className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-accent text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRenaming(false);
                        setDraftName(instance.name);
                      }}
                      title={t('Отмена')}
                      className="flex h-7 w-7 items-center justify-center rounded-[7px] text-muted hover:bg-surface-2 hover:text-ink"
                    >
                      <X size={13} />
                    </button>
                  </form>
                ) : (
                  <div className="group flex items-center gap-2">
                    <h1 className="text-[19px] font-semibold tracking-tight text-ink">
                      {instance.name}
                    </h1>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftName(instance.name);
                        setRenaming(true);
                      }}
                      title={t('Переименовать сборку')}
                      className="flex h-6 w-6 items-center justify-center rounded-[6px] text-faint opacity-0 transition-all hover:bg-surface-2 hover:text-ink group-hover:opacity-100"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                )}
                <p className="font-mono text-[11.5px] text-muted">
                  {instance.minecraftVersion} · {engineOrLoaderLabel} ·{' '}
                  {tf('{count} модов', { count: mods.length })}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {isRunning ? (
              <Button
                size="sm"
                variant="danger"
                onClick={() => void terminate(instance.id)}
              >
                <Square size={11} fill="currentColor" />
                {t('Остановить')}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="accent"
                disabled={isBusy || !canLaunch}
                title={canLaunch ? t('Запустить сборку') : t('Сначала создайте профиль')}
                onClick={() => void launch(instance.id)}
              >
                {isBusy ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    {runtimeState === 'preparing' ? t('Загрузка…') : t('Запуск…')}
                  </>
                ) : (
                  <>
                    <Play size={11} fill="currentColor" />
                    {t('Играть')}
                  </>
                )}
              </Button>
            )}

            {supportsMods && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onClose();
                  onInstallMods(instance.id);
                }}
              >
                <Plus size={13} />
                {t('Установить моды')}
              </Button>
            )}

            {tab === 'mods' && updatesCount > 0 && (
              <Button
                size="sm"
                variant="primary"
                disabled={updatingAll || runtimeLocked}
                onClick={() => setPendingUpdates(Object.values(updates))}
              >
                {updatingAll ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <ArrowUpCircle size={13} />
                )}
                {t('Обновить все')} ({updatesCount})
              </Button>
            )}

            {/* Второстепенные действия — иконками: строка не должна разрастаться. */}
            <div className="ml-1 flex items-center gap-1 border-l border-line pl-1.5">
              {tab === 'mods' && instance.engine === 'java' && mods.length > 0 && (
                <IconButton
                  disabled={checkingUpdates || updatingAll}
                  title={t('Проверить обновления модов')}
                  aria-label={t('Проверить обновления модов')}
                  onClick={() => void handleCheckUpdates()}
                >
                  <RefreshCw size={13} className={checkingUpdates ? 'animate-spin' : undefined} />
                </IconButton>
              )}

              {tab === 'mods' && supportsMods && (
                <IconButton
                  disabled={runtimeLocked || installingLocal}
                  title={t('Установить мод из файла')}
                  aria-label={t('Установить мод из файла')}
                  onClick={() => void handleInstallLocalMod()}
                >
                  {installingLocal ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Upload size={13} />
                  )}
                </IconButton>
              )}

              <IconButton
                title={t('Открыть папку сборки')}
                aria-label={t('Открыть папку сборки')}
                onClick={() => void handleOpenFolder('game')}
              >
                <FolderOpen size={13} />
              </IconButton>

              {onOpenSettings && (
                <IconButton
                  title={t('Параметры сборки')}
                  aria-label={t('Параметры сборки')}
                  onClick={onOpenSettings}
                >
                  <SlidersHorizontal size={13} />
                </IconButton>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 inline-flex flex-wrap gap-1 rounded-[10px] border border-line bg-surface/55 p-1 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => {
              setVersionPickerMod(null);
              setTab('mods');
            }}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-[7px] border px-3 text-xs font-medium transition-colors duration-150',
              tab === 'mods' ? 'keycap-surface text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            <Package size={13} />
            {t('Моды')} ({modItems.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setVersionPickerMod(null);
              setTab('shaders');
            }}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-[7px] border px-3 text-xs font-medium transition-colors duration-150',
              tab === 'shaders' ? 'keycap-surface text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            <Sparkles size={13} />
            {t('Шейдеры')} ({shaderItems.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setVersionPickerMod(null);
              setTab('resourcepacks');
            }}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-[7px] border px-3 text-xs font-medium transition-colors duration-150',
              tab === 'resourcepacks' ? 'keycap-surface text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            <Layers size={13} />
            {t('Ресурспаки')} ({resourcepackItems.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setVersionPickerMod(null);
              setTab('worlds');
            }}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-[7px] border px-3 text-xs font-medium transition-colors duration-150',
              tab === 'worlds' ? 'keycap-surface text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            <Globe size={13} />
            {t('Миры')}{worlds.length > 0 && tab === 'worlds' ? ` (${worlds.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => {
              setVersionPickerMod(null);
              setTab('screenshots');
            }}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-[7px] border px-3 text-xs font-medium transition-colors duration-150',
              tab === 'screenshots' ? 'keycap-surface text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            <Camera size={13} />
            {t('Скриншоты')}
          </button>
          <button
            type="button"
            onClick={() => {
              setVersionPickerMod(null);
              setTab('logs');
            }}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-[7px] border px-3 text-xs font-medium transition-colors duration-150',
              tab === 'logs' ? 'keycap-surface text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            <Terminal size={13} />
            {t('Логи')}{instanceLogs.length > 0 ? ` (${instanceLogs.length})` : ''}
          </button>
        </div>

        {tab === 'mods' && !supportsMods && (
          <div className="mt-5 rounded-[9px] border border-line bg-surface px-4 py-3 text-xs text-muted">
            {t(
              'Эта сборка использует Vanilla и не загружает моды. Для установки модов создайте сборку с Fabric, Forge, NeoForge или Quilt.',
            )}
          </div>
        )}

        {tab === 'mods' && updatesCheckedOnce && !checkingUpdates && (
          <div className="mt-4 rounded-[9px] border border-line bg-surface px-4 py-2.5 text-xs text-muted">
            {updatesCount > 0
              ? tf('Найдено обновлений: {count}. Нажмите «Обновить» рядом с модом.', {
                  count: updatesCount,
                })
              : t('Все распознанные моды Modrinth актуальны.')}
          </div>
        )}

        {error && (
          <div className="mt-5 flex items-start gap-2 rounded-[8px] border border-danger/35 bg-danger/10 px-4 py-3">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-danger" />
            <p className="text-xs break-all text-danger">{localizeError(error, language)}</p>
          </div>
        )}

        {tab === 'logs' ? (
          <div className="deck-surface mt-5 flex h-[440px] flex-col overflow-hidden rounded-[14px]">
            <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Terminal size={13} className="text-muted" />
                <span className="text-xs font-medium text-ink">{t('Консоль сборки')}</span>
                <span className="font-mono text-[11px] text-faint">
                  ({instanceLogs.length})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void api.openInstanceLog(instance.id).catch(() => undefined)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[11.5px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <FolderOpen size={12} />
                  {t('Открыть лог')}
                </button>
                {instanceLogs.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleCopyLogs()}
                      className="inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[11.5px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                      {logsCopied ? (
                        <Check size={12} className="text-led" />
                      ) : (
                        <Copy size={12} />
                      )}
                      {logsCopied ? t('Скопировано') : t('Копировать')}
                    </button>
                    <button
                      type="button"
                      onClick={() => clearLogs(instance.id)}
                      className="inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[11.5px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                      <Trash2 size={12} />
                      {t('Очистить')}
                    </button>
                  </>
                )}
              </div>
            </div>
            <div
              ref={logsEndRef}
              className="min-h-0 flex-1 cursor-text overflow-y-auto bg-bg-well/65 px-4 py-3 font-mono text-[11.5px] leading-[1.65] select-text"
            >
              {instanceLogs.length === 0 ? (
                <p className="text-muted">
                  {t('Логов пока нет — запустите сборку, чтобы увидеть вывод процесса.')}
                </p>
              ) : (
                instanceLogs.map((log, i) => (
                  <p
                    key={`${log.timestamp}-${i}`}
                    className={cn(
                      'break-all whitespace-pre-wrap',
                      log.stream === 'stderr' ? 'text-danger/90' : 'text-muted',
                    )}
                  >
                    {log.line}
                  </p>
                ))
              )}
            </div>
          </div>
        ) : tab === 'screenshots' ? (
          <div className="mt-5">
            {screenshotsLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-[10px] border border-line bg-surface py-16 text-xs text-muted">
                <Loader2 size={15} className="animate-spin" />
                {t('Загрузка скриншотов…')}
              </div>
            ) : screenshots.length === 0 ? (
              <div className="rounded-[10px] border border-line bg-surface px-6 py-14 text-center">
                <Camera size={22} className="mx-auto text-faint" strokeWidth={1.6} />
                <p className="mt-2.5 text-sm font-medium text-ink">{t('Скриншотов пока нет')}</p>
                <p className="mt-1 text-xs text-muted">
                  {t('Нажмите F2 в игре — снимки появятся здесь из папки')}{' '}
                  <code className="font-mono text-ink">screenshots/</code>
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {screenshots.map((shot) => (
                  <div
                    key={shot.fileName}
                    className="overflow-hidden rounded-[10px] border border-line bg-surface"
                  >
                    <div className="aspect-video w-full bg-bg-well">
                      {shot.dataUrl ? (
                        <img
                          src={shot.dataUrl}
                          alt={shot.fileName}
                          className="h-full w-full cursor-pointer object-cover transition-opacity hover:opacity-90"
                          onClick={() => void api.openScreenshotFile(instance.id, shot.fileName)}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-faint">
                          {t('Предпросмотр недоступен')}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[11.5px] text-ink">
                          {shot.fileName}
                        </p>
                        <p className="font-mono text-[10.5px] text-muted">
                          {formatBytes(shot.sizeBytes, language)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void api.openScreenshotFile(instance.id, shot.fileName)}
                          title={t('Открыть')}
                          className="rounded-[6px] p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                        >
                          <ExternalLink size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteScreenshot(shot.fileName)}
                          title={t('Удалить')}
                          className="rounded-[6px] p-1.5 text-muted transition-colors hover:bg-danger/15 hover:text-danger"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : tab === 'worlds' ? (
          <div className="mt-5">
            {worldsLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-[10px] border border-line bg-surface py-16 text-xs text-muted">
                <Loader2 size={15} className="animate-spin" />
                {t('Загрузка миров…')}
              </div>
            ) : worlds.length === 0 ? (
              <div className="rounded-[10px] border border-line bg-surface px-6 py-14 text-center">
                <Globe size={22} className="mx-auto text-faint" strokeWidth={1.6} />
                <p className="mt-2.5 text-sm font-medium text-ink">{t('Миров пока нет')}</p>
                <p className="mt-1 text-xs text-muted">
                  {t('Создайте мир в игре — он появится здесь. Резервные копии сохраняются в')}{' '}
                  <code className="font-mono text-ink"> backups/</code>
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {worlds.map((world) => {
                  const worldBackups = backups.filter(
                    (backup) => backup.worldFolder === world.folderName,
                  );
                  const isExpanded = expandedWorld === world.folderName;
                  return (
                    <div
                      key={world.folderName}
                      className="overflow-hidden rounded-[10px] border border-line bg-surface"
                    >
                      <div className="flex items-center gap-3 px-3.5 py-3">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-line bg-bg-well">
                          {world.iconDataUrl ? (
                            <img
                              src={world.iconDataUrl}
                              alt={world.folderName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Globe size={20} className="text-faint" strokeWidth={1.6} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-ink">
                            {world.folderName}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-muted">
                            {formatBytes(world.sizeBytes, language)} ·{' '}
                            {formatWorldDate(world.modifiedMs, language)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {pendingWorldDelete === world.folderName ? (
                            <>
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={busyWorld !== null || runtimeLocked}
                                onClick={() => void handleDeleteWorld(world.folderName)}
                              >
                                {t('Удалить')}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setPendingWorldDelete(null)}
                              >
                                {t('Отмена')}
                              </Button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleBackupWorld(world.folderName)}
                                disabled={busyWorld !== null || runtimeLocked}
                                title={t('Создать резервную копию')}
                                className="rounded-[6px] p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                              >
                                {busyWorld === world.folderName ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Archive size={13} />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedWorld(isExpanded ? null : world.folderName)
                                }
                                title={t('Резервные копии')}
                                className={cn(
                                  'inline-flex h-7 items-center gap-1 rounded-[6px] px-1.5 text-[11px] transition-colors hover:bg-surface-2 hover:text-ink',
                                  isExpanded ? 'text-ink' : 'text-muted',
                                )}
                              >
                                <History size={13} />
                                {worldBackups.length}
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingWorldDelete(world.folderName)}
                                disabled={busyWorld !== null || runtimeLocked}
                                title={t('Удалить мир')}
                                className="rounded-[6px] p-1.5 text-muted transition-colors hover:bg-danger/15 hover:text-danger disabled:opacity-40"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-line bg-bg-well/40 px-3.5 py-2">
                          <div className="flex items-center justify-between py-1">
                            <span className="text-[11.5px] font-medium text-ink">
                              {t('Резервные копии')}
                            </span>
                            <span className="font-mono text-[11px] text-faint">
                              {worldBackups.length}
                            </span>
                          </div>
                          {worldBackups.length === 0 ? (
                            <p className="py-2 text-[11.5px] text-muted">
                              {t('Резервных копий пока нет')}
                            </p>
                          ) : (
                            <div className="divide-y divide-line/70">
                              {worldBackups.map((backup) => {
                                const restoring =
                                  pendingRestore?.world === world.folderName &&
                                  pendingRestore.file === backup.fileName;
                                const deleting =
                                  pendingBackupDelete?.world === world.folderName &&
                                  pendingBackupDelete.file === backup.fileName;

                                if (restoring || deleting) {
                                  return (
                                    <div
                                      key={backup.fileName}
                                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                                    >
                                      <p className="text-[11.5px] leading-relaxed text-muted">
                                        {restoring
                                          ? t(
                                              'Восстановить мир из этой копии? Текущий мир будет сохранён рядом как .before-restore.',
                                            )
                                          : t('Удалить эту резервную копию?')}
                                      </p>
                                      <div className="flex items-center gap-1.5">
                                        <Button
                                          size="sm"
                                          variant="danger"
                                          disabled={backupBusy !== null || runtimeLocked}
                                          onClick={() =>
                                            restoring
                                              ? void handleRestoreBackup(
                                                  world.folderName,
                                                  backup.fileName,
                                                )
                                              : void handleDeleteBackup(
                                                  world.folderName,
                                                  backup.fileName,
                                                )
                                          }
                                        >
                                          {restoring ? t('Восстановить') : t('Удалить')}
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => {
                                            setPendingRestore(null);
                                            setPendingBackupDelete(null);
                                          }}
                                        >
                                          {t('Отмена')}
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div
                                    key={backup.fileName}
                                    className="flex items-center justify-between gap-3 py-2"
                                  >
                                    <div className="min-w-0">
                                      <p className="font-mono text-[11.5px] text-ink">
                                        {formatBackupDate(backup.createdMs, language)}
                                      </p>
                                      <p className="font-mono text-[10.5px] text-muted">
                                        {formatBytes(backup.sizeBytes, language)}
                                      </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        disabled={backupBusy !== null || runtimeLocked}
                                        onClick={() =>
                                          setPendingRestore({
                                            world: world.folderName,
                                            file: backup.fileName,
                                          })
                                        }
                                      >
                                        {t('Восстановить')}
                                      </Button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPendingBackupDelete({
                                            world: world.folderName,
                                            file: backup.fileName,
                                          })
                                        }
                                        disabled={backupBusy !== null || runtimeLocked}
                                        title={t('Удалить резервную копию')}
                                        className="rounded-[6px] p-1.5 text-muted transition-colors hover:bg-danger/15 hover:text-danger disabled:opacity-40"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : versionPickerMod ? (
          <div className="mt-6 rounded-[10px] border border-line-strong bg-surface p-5">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-3.5">
              <div className="flex items-center gap-3">
                {versionPickerMod.iconUrl ? (
                  <img
                    src={versionPickerMod.iconUrl}
                    alt=""
                    className="h-9 w-9 rounded-[7px] border border-line bg-bg-well object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-[7px] border border-line bg-bg-well font-mono text-xs font-semibold text-muted">
                    {(versionPickerMod.title ?? versionPickerMod.fileName)
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="text-sm font-semibold text-ink">
                    {t('Смена версии')} ·{' '}
                    {versionPickerMod.title ?? fallbackModTitle(versionPickerMod.fileName)}
                  </h2>
                  <p className="text-xs text-muted">
                    {tf('Совместимые релизы для {version} · {loader}', {
                      version: instance.minecraftVersion,
                      loader: formatLoaderLabel(instance.loader),
                    })}
                  </p>
                </div>
              </div>

              <Button
                size="sm"
                variant="secondary"
                onClick={() => setVersionPickerMod(null)}
              >
                <ArrowLeft size={13} />
                {t('К списку модов')}
              </Button>
            </div>

            {versionsLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted">
                <Loader2 size={15} className="animate-spin" />
                {t('Загрузка версий с Modrinth…')}
              </div>
            ) : versions.length === 0 ? (
              <p className="py-10 text-center text-xs text-muted">
                {t('Нет доступных версий для этой конфигурации')}
              </p>
            ) : (
              <div className="mt-3 divide-y divide-line rounded-[8px] border border-line bg-bg-well/40">
                {versions.map((ver) => {
                  const isCurrent = versionPickerMod.versionId === ver.id;
                  const busy = switchingVersionId === ver.id;
                  return (
                    <div
                      key={ver.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink">
                          {ver.name}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-faint">
                          {ver.versionNumber} · {ver.versionType}
                        </p>
                      </div>

                      <Button
                        size="sm"
                        variant={isCurrent ? 'secondary' : 'primary'}
                        disabled={isCurrent || busy}
                        onClick={() => void handleSwitchVersion(ver)}
                      >
                        {busy ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : isCurrent ? (
                          <Check size={12} className="text-led" />
                        ) : null}
                        {isCurrent ? t('Текущая') : busy ? t('Установка…') : t('Выбрать')}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6">
            {loading ? (
              <div className="flex items-center justify-center gap-2 rounded-[10px] border border-line bg-surface py-16 text-xs text-muted">
                <Loader2 size={15} className="animate-spin" />
                {t('Загрузка и распознавание…')}
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="rounded-[10px] border border-line bg-surface px-6 py-14 text-center">
                <Package size={22} className="mx-auto text-faint" strokeWidth={1.6} />
                <p className="mt-2.5 text-sm font-medium text-ink">
                  {tf('В сборке «{name}» пока нет {label}', {
                    name: instance.name,
                    label: t(emptyLabel),
                  })}
                </p>
                {(supportsMods || tab === 'shaders' || tab === 'resourcepacks') && (
                  <>
                    <p className="mt-1 text-xs text-muted">
                      {tf(
                        'Нажмите «Открыть каталог», чтобы скачать их из {source} в один клик',
                        {
                          source: instance.engine === 'horizon' ? 'Horizon' : 'Modrinth',
                        },
                      )}
                    </p>
                    <Button
                      className="mt-4"
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        onClose();
                        onInstallMods(instance.id);
                      }}
                    >
                      <Plus size={13} />
                      {t('Открыть каталог')}
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <>
                {tab === 'mods' &&
                  instance.engine === 'horizon' &&
                  visibleItems.some((m) => m.fileName.toLowerCase().endsWith('.hnmod')) && (
                    <div className="mb-3 rounded-[9px] border border-warn/30 bg-warn/8 px-4 py-2.5 text-xs leading-relaxed text-muted">
                      <span className="font-medium text-warn">{t('Внимание по .hnmod:')}</span>{' '}
                      {t('нативные моды сохранены в')}{' '}
                      <code className="font-mono text-ink">horizon-native-mods/</code>
                      {t(
                        ', но наш лаунчер запускает готовый клиент и не собирает их. Официальный Horizon Launcher собирает нативные моды кнопкой Build на основе готового SDK, без пересборки всего движка. Контент-моды (',
                      )}
                      <code className="font-mono text-ink">.hmod</code>
                      {t('), шейдеры и ресурспаки работают сразу.')}
                    </div>
                  )}
                <div className="divide-y divide-line rounded-[10px] border border-line bg-surface">
                  {visibleItems.map((mod) => {
                    const displayTitle = mod.title ?? fallbackModTitle(mod.fileName);
                    const isNativeHorizonMod = mod.fileName.toLowerCase().endsWith('.hnmod');
                    const isDisabled = mod.fileName.toLowerCase().endsWith('.disabled');
                    const upd = updates[mod.fileName];
                    const isUpdating = updatingFile === mod.fileName;

                    return (
                      <div
                        key={mod.fileName}
                        className={cn(
                          'flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-surface-2/30',
                          isDisabled && 'opacity-55',
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-3.5">
                          <Switch
                            checked={!isDisabled}
                            disabled={runtimeLocked}
                            onChange={() => void handleToggleMod(mod.fileName)}
                            label={isDisabled ? t('Включить мод') : t('Отключить мод')}
                          />

                          {mod.iconUrl ? (
                            <img
                              src={mod.iconUrl}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded-[7px] border border-line bg-bg-well object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[7px] border border-line bg-bg-well font-mono text-xs font-semibold text-muted">
                              {displayTitle.slice(0, 2).toUpperCase()}
                            </div>
                          )}

                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-semibold text-ink">
                              {displayTitle}
                              {isDisabled && (
                                <span className="ml-2 font-mono text-[11px] font-normal text-faint">
                                  {t('выкл.')}
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                              {mod.versionNumber ?? mod.fileName} · {formatBytes(mod.sizeBytes, language)}
                              {isNativeHorizonMod && (
                                <span className="text-warn"> · {t('нужна сборка официальным лаунчером')}</span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {upd && (
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={isUpdating || updatingAll || runtimeLocked}
                              onClick={() => setPendingUpdates([upd])}
                            >
                              {isUpdating ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <ArrowUpCircle size={13} />
                              )}
                              {tf('Обновить до {version}', {
                                version: upd.latestVersionNumber,
                              })}
                            </Button>
                          )}
                          {mod.projectId && supportsMods && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={runtimeLocked || updatingAll}
                              onClick={() => void openVersionPicker(mod)}
                            >
                              <History size={13} />
                              {t('Версия')}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={runtimeLocked}
                            onClick={() => void handleRemove(mod.fileName)}
                            title={t('Удалить мод')}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <Modal
        open={Boolean(pendingUpdates && pendingUpdates.length > 0)}
        title={
          pendingUpdates && pendingUpdates.length > 1
            ? t('Обновить все моды?')
            : t('Обновить мод?')
        }
        subtitle={t('Файлы будут заменены новыми версиями с Modrinth')}
        onClose={() => setPendingUpdates(null)}
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setPendingUpdates(null)}>
              {t('Отмена')}
            </Button>
            <Button size="sm" variant="primary" onClick={() => void confirmUpdates()}>
              <ArrowUpCircle size={13} />
              {tf('Обновить ({count})', { count: pendingUpdates?.length ?? 0 })}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          {(pendingUpdates ?? []).map((upd) => {
            const title =
              mods.find((m) => m.fileName === upd.fileName)?.title ?? upd.fileName;
            const channelLabel =
              upd.latestChannel === 'release' ? t('стабильная') : upd.latestChannel;
            const published = upd.latestPublished
              ? new Date(upd.latestPublished).toLocaleDateString(
                  language === 'en' ? 'en-US' : 'ru-RU',
                )
              : null;

            return (
              <div
                key={upd.fileName}
                className="rounded-[9px] border border-line bg-bg-well/60 px-3 py-2.5"
              >
                <p className="truncate text-[13px] font-medium text-ink">{title}</p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                  {upd.currentVersionNumber} →{' '}
                  <span className="text-ink">{upd.latestVersionNumber}</span>
                  {' · '}
                  {channelLabel}
                  {upd.latestFileSize > 0
                    ? ` · ${formatBytes(upd.latestFileSize, language)}`
                    : ''}
                  {published ? ` · ${published}` : ''}
                </p>
                {upd.localModified && (
                  <p className="mt-1 text-[11px] leading-snug text-warn">
                    {t('Файл изменён вручную — обновление заменит его')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
