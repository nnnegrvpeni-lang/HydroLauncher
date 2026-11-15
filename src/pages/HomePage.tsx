import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Compass,
  Copy,
  Globe,
  Layers,
  Loader2,
  Minus,
  Package,
  Play,
  Plus,
  SlidersHorizontal,
  Terminal,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { InstanceModsModal } from '../components/InstanceModsModal';
import { InstanceSettingsModal } from '../components/InstanceSettingsModal';
import { VoxelEmblem } from '../components/VoxelEmblem';
import { VoxelStageCanvas } from '../components/VoxelStageCanvas';
import { Button } from '../components/ui/Button';
import { useAccountsStore } from '../stores/accountsStore';
import { useInstancesStore } from '../stores/instancesStore';
import { useLaunchStore } from '../stores/launchStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useI18n } from '../i18n';
import { cn } from '../utils/cn';
import { buildDockInstances, pickRecent } from '../utils/dock';
import { formatMemory, formatPlayTime } from '../utils/format';
import type { PageId } from '../components/TitleBar';
import { api, type GameLog, type InstanceQuickPlay } from '../api';

const EMPTY_LOGS: GameLog[] = [];

const LOADER_LABEL: Record<string, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
};

const RAM_PRESETS = [2048, 4096, 6144, 8192];

interface HomePageProps {
  selectedInstanceId: string | null;
  onSelectInstance: (id: string) => void;
  onNavigate: (page: PageId) => void;
  onQuickCreateInstance: () => void;
  onQuickAddAccount: () => void;
  onOpenModsForInstance: (instanceId: string) => void;
}

export function HomePage({
  selectedInstanceId,
  onSelectInstance,
  onNavigate,
  onQuickCreateInstance,
  onQuickAddAccount,
  onOpenModsForInstance,
}: HomePageProps) {
  const instances = useInstancesStore((s) => s.instances);
  const running = useInstancesStore((s) => s.running);
  const launch = useInstancesStore((s) => s.launch);
  const terminate = useInstancesStore((s) => s.terminate);
  const update = useInstancesStore((s) => s.update);

  const activeAccount = useAccountsStore((s) => s.activeAccount);

  const settings = useSettingsStore((s) => s.settings);
  const systemInfo = useSettingsStore((s) => s.systemInfo);
  const { t, tf, language } = useI18n();

  const logsByInstance = useLaunchStore((s) => s.logsByInstance);
  const clearLogs = useLaunchStore((s) => s.clearLogs);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modsOpen, setModsOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [quickPlay, setQuickPlay] = useState<InstanceQuickPlay>({ worlds: [], servers: [] });
  const [addingServer, setAddingServer] = useState(false);
  const [serverName, setServerName] = useState('');
  const [serverAddress, setServerAddress] = useState('');

  const featured =
    instances.find((i) => i.id === selectedInstanceId) ?? pickRecent(instances);

  const featuredId = featured?.id ?? null;

  const dockInstances = buildDockInstances(instances, featuredId);
  const dockHiddenCount = Math.max(0, instances.length - dockInstances.length);
  const qpFeaturedState = featured ? running.get(featured.id) ?? 'idle' : 'idle';
  const featuredBusyOrRunning = qpFeaturedState !== 'idle';

  useEffect(() => {
    if (!featuredId) return;
    let cancelled = false;
    api
      .getInstanceQuickPlay(featuredId)
      .then((qp) => {
        if (!cancelled) setQuickPlay(qp);
      })
      .catch(() => {
        if (!cancelled) setQuickPlay({ worlds: [], servers: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [featuredId, featuredBusyOrRunning]);

  const handleAddQuickServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!featuredId || !serverAddress.trim()) return;
    try {
      const servers = await api.addQuickServer(featuredId, serverName, serverAddress);
      setQuickPlay((prev) => ({ ...prev, servers }));
      setServerName('');
      setServerAddress('');
      setAddingServer(false);
    } catch {
      // Ошибка отобразится при необходимости
    }
  };

  const handleRemoveQuickServer = async (serverId: string) => {
    if (!featuredId) return;
    const servers = await api.removeQuickServer(featuredId, serverId);
    setQuickPlay((prev) => ({ ...prev, servers }));
  };

  if (!featured) {
    return (
      <div className="flex min-h-full items-center justify-center p-7">
        <div className="deck-surface hl-fade-up w-full max-w-[680px] rounded-[18px] p-7">
          <div className="flex items-start gap-4">
            <img
              src="/icon.png"
              alt="HydroLauncher"
              className="h-12 w-12 shrink-0 rounded-[12px] border border-line-strong bg-bg-well object-contain p-1.5"
            />
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold tracking-tight text-ink">
                {t('Добро пожаловать в HydroLauncher')}
              </h1>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                {t(
                  'Чистый лаунчер для Java Edition и нативного движка Horizon (Rust) с офлайн-профилями и встроенным каталогом модов.',
                )}
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="rounded-[12px] border border-line bg-bg-well/70 p-4">
              <div className="flex items-center justify-between text-xs font-medium text-ink">
                <span className="flex items-center gap-1.5">
                  <UserPlus size={13.5} className="text-accent" />
                  {t('1. Профиль')}
                </span>
                {activeAccount && <Check size={13} className="text-led" />}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                {activeAccount ? (
                  <>
                    {t('Активный ник:')}{' '}
                    <span className="font-medium text-ink">{activeAccount.username}</span>.{' '}
                    {t('Можно добавить ещё в меню сверху.')}
                  </>
                ) : (
                  t('Укажите офлайн-никнейм — он нужен для запуска игры и сохранений.')
                )}
              </p>
            </div>

            <div className="rounded-[12px] border border-line bg-bg-well/70 p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-ink">
                <Layers size={13.5} className="text-accent" />
                {t('2. Сборка')}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                {t(
                  'Создайте сборку с Vanilla, Fabric, Forge, NeoForge, Quilt, Horizon или импортируйте',
                )}{' '}
                <span className="font-mono text-ink">.mrpack</span>.
              </p>
            </div>

            <div className="rounded-[12px] border border-line bg-bg-well/70 p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-ink">
                <Play size={13.5} className="text-accent" />
                {t('3. Запуск')}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                {t(
                  'Лаунчер сам найдёт или скачает нужную Java, загрузит библиотеки, ассеты и запустит клиент.',
                )}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-line pt-5">
            <Button variant="accent" size="lg" onClick={onQuickCreateInstance}>
              <Plus size={15} />
              {t('Создать сборку')}
            </Button>
            {!activeAccount && (
              <Button variant="secondary" size="lg" onClick={onQuickAddAccount}>
                <UserPlus size={15} />
                {t('Создать профиль')}
              </Button>
            )}
            <Button variant="ghost" size="lg" onClick={() => onNavigate('mods')}>
              <Package size={15} />
              {t('Каталог модов')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const featuredState = running.get(featured.id);
  const isRunning = featuredState === 'running';
  const isBusy = featuredState === 'preparing' || featuredState === 'launching';
  const logs = logsByInstance[featured.id] ?? EMPTY_LOGS;

  const canLaunch = Boolean(activeAccount);
  const defaultMemoryMb = settings?.defaultMemoryMb ?? 4096;
  const maxMemoryMb = systemInfo?.totalMemoryMb ?? 16384;
  const featuredMem = featured.memoryMbOverride ?? defaultMemoryMb;

  const adjustMemory = (deltaMb: number) => {
    const next = Math.max(512, Math.min(maxMemoryMb, featuredMem + deltaMb));
    if (next !== featuredMem) {
      void update(featured.id, { memoryMbOverride: next });
    }
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Полноэкранная живая воксельная сцена */}
      <div className="relative flex min-h-0 flex-1 flex-col justify-between overflow-hidden">
        <VoxelStageCanvas
          engine={featured.engine}
          loader={featured.loader}
          isRunning={isRunning || isBusy}
        />

        {/* Мягкая виньетка слева и снизу для кристальной читаемости текста */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, color-mix(in srgb, var(--bg) 62%, transparent) 0%, color-mix(in srgb, var(--bg) 32%, transparent) 40%, transparent 72%), linear-gradient(0deg, color-mix(in srgb, var(--bg) 45%, transparent) 0%, transparent 32%)',
          }}
          aria-hidden
        />

        {/* Верхний плавающий HUD: слева миры/серверы без рамки (только если есть), справа RAM */}
        <div className="relative z-10 flex items-start justify-between gap-4 px-7 pt-5 lg:px-10">
          {quickPlay.servers.length > 0 || quickPlay.worlds.length > 0 ? (
            <div className="w-[300px] space-y-1 rounded-[13px] border border-line bg-surface/45 p-1.5 backdrop-blur-xl shadow-[inset_0_1px_0_var(--rim)]">
              {quickPlay.servers.map((srv) => (
                <div
                  key={srv.id}
                  className="group flex items-center justify-between gap-2 rounded-[9px] px-2 py-1.5 transition-all hover:bg-surface-2/75"
                >
                  <button
                    type="button"
                    disabled={isRunning || isBusy || !activeAccount}
                    onClick={() =>
                      void launch(featured.id, { kind: 'server', value: srv.address })
                    }
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:opacity-50"
                    title={tf('Войти на {address}', { address: srv.address })}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-line bg-bg-well/75 text-muted transition-colors group-hover:border-line-strong group-hover:text-ink">
                      <Globe size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-ink">{srv.name}</p>
                      <p className="truncate font-mono text-[10.5px] text-faint">{srv.address}</p>
                    </div>
                    <Play
                      size={11}
                      className="shrink-0 text-accent opacity-0 transition-opacity group-hover:opacity-100"
                      fill="currentColor"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRemoveQuickServer(srv.id)}
                    title={t('Удалить сервер')}
                    className="rounded p-1 text-faint opacity-0 transition-all hover:bg-bg-well hover:text-ink group-hover:opacity-100"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}

              {quickPlay.worlds.slice(0, 4).map((w) => (
                <button
                  key={w.folderName}
                  type="button"
                  disabled={isRunning || isBusy || !activeAccount}
                  onClick={() =>
                    void launch(featured.id, { kind: 'world', value: w.folderName })
                  }
                  className="group flex w-full items-center gap-2.5 rounded-[9px] px-2 py-1.5 text-left transition-all hover:bg-surface-2/75 disabled:opacity-50"
                  title={tf('Войти в мир «{name}»', { name: w.folderName })}
                >
                  {w.iconDataUrl ? (
                    <img
                      src={w.iconDataUrl}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-[8px] border border-line object-cover shadow-sm"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-line bg-bg-well/75 text-muted transition-colors group-hover:border-line-strong group-hover:text-ink">
                      <Compass size={14} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-ink">{w.folderName}</p>
                    <p className="truncate font-mono text-[10.5px] text-faint">
                      {w.modifiedMs
                        ? new Date(w.modifiedMs).toLocaleDateString(
                            language === 'en' ? 'en-US' : 'ru-RU',
                            {
                              day: '2-digit',
                              month: '2-digit',
                            },
                          )
                        : t('Мир')}
                    </p>
                  </div>
                  <Play
                    size={11}
                    className="shrink-0 text-accent opacity-0 transition-opacity group-hover:opacity-100"
                    fill="currentColor"
                  />
                </button>
              ))}

              <div className="px-2 pt-0.5">
                {addingServer ? (
                  <form onSubmit={(e) => void handleAddQuickServer(e)} className="mt-1 space-y-1.5">
                    <input
                      value={serverName}
                      onChange={(e) => setServerName(e.target.value)}
                      placeholder={t('Название (необязательно)')}
                      autoComplete="off"
                      spellCheck={false}
                      className="hl-input h-7 text-xs"
                    />
                    <div className="flex items-center gap-1.5">
                      <input
                        value={serverAddress}
                        onChange={(e) => setServerAddress(e.target.value)}
                        placeholder="play.example.com"
                        autoComplete="off"
                        spellCheck={false}
                        className="hl-input h-7 min-w-0 flex-1 font-mono text-xs"
                      />
                      <button
                        type="submit"
                        disabled={!serverAddress.trim()}
                        className="h-7 shrink-0 rounded-[7px] bg-ink px-2.5 text-[11px] font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        {t('Ок')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddingServer(false)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-muted hover:bg-surface/70 hover:text-ink"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingServer(true)}
                    className="inline-flex items-center gap-1 text-[11px] text-faint transition-colors hover:text-muted"
                  >
                    <Plus size={11} />
                    {t('Добавить сервер')}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div />
          )}

          {featured.engine !== 'horizon' && (
            <div className="flex items-center gap-1 rounded-[11px] border border-line-strong bg-surface/60 p-1 backdrop-blur-xl shadow-[inset_0_1px_0_var(--rim)]">
              <span className="px-2.5 font-mono text-[11px] font-medium text-muted tabular-nums">
                RAM {formatMemory(featuredMem)}
              </span>
              <span className="h-3.5 w-px bg-line" aria-hidden />
              {RAM_PRESETS.filter((p) => p <= maxMemoryMb).map((preset) => {
                const active = featuredMem === preset;
                return (
                  <button
                    key={preset}
                    onClick={() => void update(featured.id, { memoryMbOverride: preset })}
                    className={cn(
                      'flex h-6.5 items-center justify-center rounded-[7px] px-2.5 font-mono text-[11px] font-medium transition-all',
                      active
                        ? 'keycap-surface text-ink'
                        : 'text-muted hover:bg-surface-2/60 hover:text-ink',
                    )}
                  >
                    {preset / 1024}G
                  </button>
                );
              })}
              <button
                onClick={() => adjustMemory(-512)}
                disabled={featuredMem <= 512}
                title={t('Уменьшить на 512 MB')}
                className="flex h-6.5 w-6.5 items-center justify-center rounded-[7px] text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-35"
              >
                <Minus size={11} />
              </button>
              <button
                onClick={() => adjustMemory(512)}
                disabled={featuredMem >= maxMemoryMb}
                title={t('Увеличить на 512 MB')}
                className="flex h-6.5 w-6.5 items-center justify-center rounded-[7px] text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-35"
              >
                <Plus size={11} />
              </button>
            </div>
          )}
        </div>

        {/* Главный герой-блок сборки (левая нижняя зона сцены) */}
        <div className="relative z-10 mt-auto max-w-[680px] px-7 pb-8 lg:px-10 lg:pb-10">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[13px] border border-line-strong bg-surface/75 backdrop-blur-xl shadow-[inset_0_1px_0_var(--rim),0_12px_28px_-12px_rgba(0,0,0,0.65)]">
              <VoxelEmblem engine={featured.engine} loader={featured.loader} size={32} />
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-[9px] border border-line bg-surface/55 px-3 py-1.5 font-mono text-[12px] text-muted backdrop-blur-md">
              <span className="font-semibold text-ink">
                {featured.minecraftVersion}
              </span>
              <span className="text-faint">·</span>
              <span>
                {featured.engine === 'horizon'
                  ? 'Rust'
                  : (LOADER_LABEL[featured.loader] ?? featured.loader)}
                {featured.engine !== 'horizon' && featured.loaderVersion
                  ? ` ${featured.loaderVersion}`
                  : ''}
              </span>
              {featured.playTimeSeconds > 0 && (
                <>
                  <span className="text-faint">·</span>
                  <span>{formatPlayTime(featured.playTimeSeconds, language)}</span>
                </>
              )}
            </div>
          </div>

          <h1 className="mt-4 text-[42px] leading-[1.04] font-semibold tracking-[-0.035em] text-ink lg:text-[48px]">
            {featured.name}
          </h1>

          {/* Главная панель действий */}
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            {isRunning ? (
              <Button
                variant="danger"
                onClick={() => void terminate(featured.id)}
                className="h-11 min-w-[172px] rounded-[11px] px-6 text-[13.5px] font-semibold"
              >
                {t('Остановить')}
              </Button>
            ) : (
              <Button
                variant="accent"
                onClick={() => void launch(featured.id)}
                disabled={isBusy || !canLaunch}
                title={
                  canLaunch ? t('Запустить сборку') : t('Сначала создайте профиль')
                }
                className="h-11 min-w-[172px] rounded-[11px] px-6 text-[14px]"
              >
                {isBusy ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    {featuredState === 'preparing' ? t('Загрузка…') : t('Запуск…')}
                  </>
                ) : (
                  <>
                    <Play size={15} fill="currentColor" />
                    {t('Играть')}
                  </>
                )}
              </Button>
            )}

            <button
              onClick={() => setSettingsOpen(true)}
              className="inline-flex h-11 items-center gap-2 rounded-[11px] border border-line-strong bg-surface/65 px-4 text-[13px] font-medium text-ink backdrop-blur-xl shadow-[inset_0_1px_0_var(--rim)] transition-all hover:bg-surface-2/85"
            >
              <SlidersHorizontal size={14} className="text-muted" />
              {t('Параметры')}
            </button>

            <button
              onClick={() => setModsOpen(true)}
              className="inline-flex h-11 items-center gap-2 rounded-[11px] border border-line-strong bg-surface/65 px-4 text-[13px] font-medium text-ink backdrop-blur-xl shadow-[inset_0_1px_0_var(--rim)] transition-all hover:bg-surface-2/85"
            >
              <Package size={14} className="text-muted" />
              {t('Моды')}
            </button>

            <button
              onClick={() => setConsoleOpen((v) => !v)}
              className={cn(
                'inline-flex h-11 items-center gap-2 rounded-[11px] border px-4 text-[13px] font-medium backdrop-blur-xl transition-all',
                consoleOpen
                  ? 'keycap-surface text-ink'
                  : 'border-line-strong bg-surface/65 text-ink shadow-[inset_0_1px_0_var(--rim)] hover:bg-surface-2/85',
              )}
            >
              <Terminal size={14} className="text-muted" />
              {t('Консоль')}
              {logs.length > 0 && (
                <span className="rounded-[5px] border border-line-strong bg-bg-well px-1.5 py-px font-mono text-[10px] text-ink tabular-nums">
                  {logs.length}
                </span>
              )}
            </button>

            {!activeAccount && (
              <button
                onClick={onQuickAddAccount}
                className="inline-flex h-11 items-center gap-2 rounded-[11px] border border-warn/40 bg-warn/12 px-4 text-[12.5px] font-medium text-warn backdrop-blur-xl transition-colors hover:bg-warn/20"
              >
                <UserPlus size={14} />
                {t('Создать профиль')}
              </button>
            )}
          </div>
        </div>

        {/* Выдвижная консоль п��верх нижней части сцены */}
        {consoleOpen && (
          <FloatingConsole
            logs={logs}
            onClear={() => clearLogs(featured.id)}
            onClose={() => setConsoleOpen(false)}
          />
        )}
      </div>

      {/* Нижний матовый док картриджей-сборок */}
      <section
        aria-label={t('Док сборок')}
        className="relative z-20 shrink-0 border-t border-line bg-surface/45 px-6 py-3.5 backdrop-blur-2xl lg:px-10"
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          {dockInstances.map((inst) => {
            const selected = inst.id === featured.id;
            const instRunning = running.get(inst.id) === 'running';
            return (
              <button
                key={inst.id}
                onClick={() => onSelectInstance(inst.id)}
                className={cn(
                  'relative flex h-[56px] min-w-0 max-w-[240px] flex-1 items-center gap-3 rounded-[12px] border px-3.5 text-left transition-all duration-150',
                  selected
                    ? 'keycap-surface text-ink'
                    : 'border-line bg-surface/45 text-muted hover:border-line-strong hover:bg-surface/80 hover:text-ink',
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border border-line bg-bg-well/70">
                  <VoxelEmblem engine={inst.engine} loader={inst.loader} size={26} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">
                    {inst.name}
                  </p>
                  <p className="truncate font-mono text-[10.5px] text-muted">
                    {inst.minecraftVersion} ·{' '}
                    {inst.engine === 'horizon' ? 'Rust' : (LOADER_LABEL[inst.loader] ?? inst.loader)}
                    {instRunning && <span className="text-accent"> {t('· запущена')}</span>}
                  </p>
                </div>
                {selected && (
                  <span className="absolute right-4 bottom-0 left-4 h-[2px] rounded-t-full bg-accent" />
                )}
              </button>
            );
          })}

          {dockHiddenCount > 0 && (
            <button
              onClick={() => onNavigate('instances')}
              title={tf('Показать все сборки (ещё {count})', { count: dockHiddenCount })}
              className="flex h-[56px] shrink-0 items-center gap-1.5 rounded-[12px] border border-line bg-surface/45 px-3 text-[12.5px] font-medium text-muted transition-colors hover:border-line-strong hover:bg-surface/80 hover:text-ink"
            >
              <Layers size={13} />
              +{dockHiddenCount}
            </button>
          )}

          <button
            onClick={onQuickCreateInstance}
            className="flex h-[56px] shrink-0 items-center gap-2 rounded-[12px] border border-dashed border-line-strong bg-surface/25 px-4 text-[12.5px] font-medium text-muted transition-all hover:border-accent/50 hover:bg-surface/65 hover:text-ink"
          >
            <Plus size={14} />
            {t('Новая сборка')}
          </button>
        </div>
      </section>

      <InstanceSettingsModal
        instance={settingsOpen ? featured : null}
        onClose={() => setSettingsOpen(false)}
      />

      <InstanceModsModal
        instance={modsOpen ? featured : null}
        onClose={() => setModsOpen(false)}
        onInstallMods={onOpenModsForInstance}
        onOpenSettings={() => setSettingsOpen(true)}
      />
    </div>
  );
}

function FloatingConsole({
  logs,
  onClear,
  onClose,
}: {
  logs: Array<{ line: string; stream: string; timestamp: string }>;
  onClear: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [logs.length]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(logs.map((l) => l.line).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="deck-surface absolute right-7 bottom-4 left-7 z-30 flex h-[240px] flex-col overflow-hidden rounded-[13px] bg-bg-well/90 backdrop-blur-2xl shadow-[0_24px_48px_-16px_rgba(0,0,0,0.75)] lg:right-10 lg:left-10">
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2">
        <div className="flex items-center gap-2">
          <Terminal size={13} className="text-muted" />
          <span className="text-xs font-medium text-ink">{t('Консоль процесса')}</span>
          <span className="font-mono text-[11px] text-faint">
            ({logs.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {logs.length > 0 && (
            <>
              <button
                onClick={() => void copyAll()}
                className="inline-flex h-6 items-center gap-1 rounded-[5px] px-2 text-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {copied ? <Check size={11} className="text-led" /> : <Copy size={11} />}
                {copied ? t('Скопировано') : t('Копировать')}
              </button>
              <button
                onClick={onClear}
                className="inline-flex h-6 items-center gap-1 rounded-[5px] px-2 text-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <Trash2 size={11} />
                {t('Очистить')}
              </button>
            </>
          )}
          <button
            onClick={onClose}
            aria-label={t('Закрыть консоль')}
            className="flex h-6 w-6 items-center justify-center rounded-[5px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <div
        ref={ref}
        className="min-h-0 flex-1 cursor-text overflow-y-auto px-4 py-2.5 font-mono text-[11px] leading-[1.6] select-text"
      >
        {logs.length === 0 ? (
          <p className="text-muted">
            {t('Консоль пуста — после запуска здесь появится вывод Minecraft.')}
          </p>
        ) : (
          logs.map((log, i) => (
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
  );
}

