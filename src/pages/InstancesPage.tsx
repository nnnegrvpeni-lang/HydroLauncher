import { useState } from 'react';
import {
  Copy,
  FileArchive,
  Layers,
  Loader2,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { CreateInstanceModal } from '../components/CreateInstanceModal';
import { InstanceModsModal } from '../components/InstanceModsModal';
import { InstanceSettingsModal } from '../components/InstanceSettingsModal';
import { VoxelEmblem } from '../components/VoxelEmblem';
import { Button, IconButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { ProgressBar } from '../components/ui/ProgressBar';
import { useAccountsStore } from '../stores/accountsStore';
import { useInstancesStore } from '../stores/instancesStore';
import { useLaunchStore } from '../stores/launchStore';
import { useNotifyStore } from '../stores/notifyStore';
import { useSettingsStore } from '../stores/settingsStore';
import { cn } from '../utils/cn';
import { formatMemory, formatPlayTime } from '../utils/format';
import { api, type Instance, type ModLoaderKind } from '../api';

const LOADER_FILTERS: Array<{ value: 'all' | ModLoaderKind; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'vanilla', label: 'Vanilla' },
  { value: 'fabric', label: 'Fabric' },
  { value: 'forge', label: 'Forge' },
  { value: 'neoforge', label: 'NeoForge' },
  { value: 'quilt', label: 'Quilt' },
];

const LOADER_LABEL: Record<string, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
};

const TINT: Record<string, string> = {
  vanilla: '#7a9a6a',
  fabric: '#cfc5aa',
  forge: '#8a929c',
  neoforge: '#6a9f8e',
  quilt: '#8f83c4',
  horizon: '#9b8470',
};

interface InstancesPageProps {
  onSelectInstance: (id: string) => void;
  onOpenModsForInstance: (id: string) => void;
}

export function InstancesPage({
  onSelectInstance,
  onOpenModsForInstance,
}: InstancesPageProps) {
  const instances = useInstancesStore((s) => s.instances);
  const running = useInstancesStore((s) => s.running);
  const launch = useInstancesStore((s) => s.launch);
  const terminate = useInstancesStore((s) => s.terminate);
  const remove = useInstancesStore((s) => s.remove);
  const reload = useInstancesStore((s) => s.load);
  const notify = useNotifyStore((s) => s.push);
  const progress = useLaunchStore((s) => s.progress);
  const settings = useSettingsStore((s) => s.settings);
  const activeAccount = useAccountsStore((s) => s.activeAccount);

  const [query, setQuery] = useState('');
  const [loaderFilter, setLoaderFilter] = useState<'all' | ModLoaderKind>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Instance | null>(null);
  const [detailInstanceId, setDetailInstanceId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Instance | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const duplicate = async (instance: Instance) => {
    setDuplicatingId(instance.id);
    try {
      const copy = await api.duplicateInstance(instance.id);
      await reload();
      notify(`Создана копия «${copy.name}»`);
    } catch (err) {
      notify(String(err), 'error');
    } finally {
      setDuplicatingId(null);
    }
  };

  const exportMrpack = async (instance: Instance) => {
    setExportingId(instance.id);
    try {
      const result = await api.exportInstanceMrpack(instance.id);
      if (result) notify(`Сборка экспортирована: ${result.path}`);
    } catch (err) {
      notify(String(err), 'error');
    } finally {
      setExportingId(null);
    }
  };

  const detailInstance = detailInstanceId
    ? (instances.find((i) => i.id === detailInstanceId) ?? null)
    : null;

  const canLaunch = Boolean(activeAccount);
  const defaultMemoryMb = settings?.defaultMemoryMb ?? 4096;

  const filtered = instances.filter((i) => {
    const matchesLoader = loaderFilter === 'all' || i.loader === loaderFilter;
    const matchesQuery = `${i.name} ${i.minecraftVersion} ${i.loader}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
    return matchesLoader && matchesQuery;
  });

  return (
    <div className="mx-auto max-w-[1160px] px-7 py-7 lg:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Сборки</h1>
          <p className="mt-0.5 text-xs text-muted">
            Изолированные профили игры с отдельными мирами, модами и параметрами
          </p>
        </div>

        <Button variant="accent" size="md" onClick={() => setCreateOpen(true)}>
          <Plus size={14} />
          Создать сборку
        </Button>
      </header>

      {instances.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-[10px] border border-line bg-surface/55 p-1 backdrop-blur-xl">
            {LOADER_FILTERS.map((f) => {
              const active = loaderFilter === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setLoaderFilter(f.value)}
                  className={cn(
                    'flex h-7 items-center rounded-[7px] border px-3 text-xs font-medium transition-colors duration-150',
                    active
                      ? 'keycap-surface text-ink'
                      : 'border-transparent text-muted hover:text-ink',
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <div className="relative w-64">
            <Search
              size={13}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск сборки…"
              autoComplete="off"
              spellCheck={false}
              className="hl-input h-9 rounded-[10px] py-1.5 pl-8 text-xs"
            />
          </div>
        </div>
      )}

      <div className="mt-6">
        {instances.length === 0 ? (
          <EmptyState
            icon={<Layers size={18} />}
            title="Сборок пока нет"
            description="Создайте первую сборку: выберите версию Minecraft и модлоадер."
            action={
              <Button variant="accent" onClick={() => setCreateOpen(true)}>
                <Plus size={14} />
                Создать сборку
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Search size={18} />}
            title="Ничего не найдено"
            description="Попробуйте сбросить фильтр или изменить запрос."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((instance, idx) => {
              const state = running.get(instance.id);
              const isRunning = state === 'running';
              const isBusy = state === 'preparing' || state === 'launching';
              const instProgress =
                progress?.instanceId === instance.id ? progress : null;
              const memoryMb = instance.memoryMbOverride ?? defaultMemoryMb;
              const tint =
                TINT[instance.engine === 'horizon' ? 'horizon' : instance.loader] ?? TINT.vanilla;

              return (
                <article
                  key={instance.id}
                  style={{ animationDelay: `${Math.min(idx * 25, 200)}ms` }}
                  className="deck-surface hl-fade-up group flex flex-col overflow-hidden rounded-[16px] p-2.5 transition-transform duration-200 hover:-translate-y-1"
                >
                  {/* Верхняя мини-сцена картриджа со ступенчатым холмом */}
                  <button
                    onClick={() => setDetailInstanceId(instance.id)}
                    className="flex flex-col items-stretch text-left"
                  >
                    <div className="relative h-[84px] w-full overflow-hidden rounded-[11px] bg-bg-well/55">
                      <div
                        className="absolute inset-x-0 bottom-0 h-14 opacity-35 transition-opacity group-hover:opacity-50"
                        style={{
                          background: tint,
                          clipPath:
                            'polygon(0 60%,12% 60%,12% 35%,28% 35%,28% 55%,45% 55%,45% 20%,62% 20%,62% 48%,80% 48%,80% 30%,100% 30%,100% 100%,0 100%)',
                        }}
                        aria-hidden
                      />
                      <VoxelEmblem
                        engine={instance.engine}
                        loader={instance.loader}
                        size={48}
                        className="absolute top-3.5 left-4"
                      />
                      <span
                        className={cn(
                          'absolute top-3 right-3 font-mono text-[11.5px]',
                          isRunning ? 'font-medium text-accent' : 'text-muted',
                        )}
                      >
                        {isRunning ? 'Запущена' : instance.minecraftVersion}
                      </span>
                    </div>

                    <div className="px-2 pt-3.5 pb-2">
                      <h2 className="truncate text-[16.5px] font-semibold tracking-tight text-ink">
                        {instance.name}
                      </h2>
                      <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-muted">
                        <span>
                          {instance.engine === 'horizon'
                            ? 'Rust'
                            : (LOADER_LABEL[instance.loader] ?? instance.loader)}
                        </span>
                        {instance.engine !== 'horizon' && (
                          <>
                            <span className="text-faint">·</span>
                            <span className="tabular-nums">{formatMemory(memoryMb)}</span>
                          </>
                        )}
                        {instance.playTimeSeconds > 0 && (
                          <>
                            <span className="text-faint">·</span>
                            <span className="tabular-nums">
                              {formatPlayTime(instance.playTimeSeconds)}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </button>

                  {instProgress && (
                    <div className="mx-2 mb-2 rounded-[8px] border border-line bg-bg-well/70 px-3 py-2">
                      <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                        <span className="truncate">{instProgress.message}</span>
                        <span className="font-mono text-ink tabular-nums">
                          {Math.round(instProgress.percent)}%
                        </span>
                      </div>
                      <ProgressBar percent={instProgress.percent} />
                    </div>
                  )}

                  {/* Нижняя панель действий картриджа */}
                  <div className="mt-auto flex items-center justify-between gap-2 px-2 pt-2 pb-1">
                    <div className="flex items-center gap-1">
                      <IconButton
                        onClick={() => setEditing(instance)}
                        title="Параметры сборки"
                      >
                        <SlidersHorizontal size={13.5} />
                      </IconButton>

                      <IconButton
                        onClick={() => void duplicate(instance)}
                        disabled={duplicatingId !== null || state !== undefined}
                        title="Дублировать сборку вместе с модами и мирами"
                      >
                        {duplicatingId === instance.id ? (
                          <Loader2 size={13.5} className="animate-spin" />
                        ) : (
                          <Copy size={13.5} />
                        )}
                      </IconButton>

                      <IconButton
                        onClick={() => void exportMrpack(instance)}
                        disabled={
                          exportingId !== null ||
                          instance.engine === 'horizon' ||
                          state !== undefined
                        }
                        title={
                          instance.engine === 'horizon'
                            ? 'Экспорт .mrpack доступен только для Java Edition'
                            : 'Экспортировать сборку в .mrpack'
                        }
                      >
                        {exportingId === instance.id ? (
                          <Loader2 size={13.5} className="animate-spin" />
                        ) : (
                          <FileArchive size={13.5} />
                        )}
                      </IconButton>

                      <IconButton
                        onClick={() => setPendingDelete(instance)}
                        title="Удалить сборку"
                        className="hover:bg-danger/12 hover:text-danger"
                      >
                        <Trash2 size={13.5} />
                      </IconButton>
                    </div>

                    {isRunning ? (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => void terminate(instance.id)}
                      >
                        Стоп
                      </Button>
                    ) : (
                      <Button
                        variant="accent"
                        size="sm"
                        onClick={() => void launch(instance.id)}
                        disabled={isBusy || !canLaunch}
                        title={canLaunch ? 'Запустить сборку' : 'Сначала добавьте профиль'}
                      >
                        {isBusy ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            Запуск
                          </>
                        ) : (
                          <>
                            <Play size={11} fill="currentColor" />
                            Играть
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <CreateInstanceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={onSelectInstance}
      />
      <InstanceModsModal
        instance={detailInstance}
        onClose={() => setDetailInstanceId(null)}
        onInstallMods={onOpenModsForInstance}
        onOpenSettings={() => {
          if (detailInstance) setEditing(detailInstance);
        }}
      />
      <InstanceSettingsModal instance={editing} onClose={() => setEditing(null)} />

      <Modal
        open={pendingDelete !== null}
        title="Удалить сборку?"
        subtitle={pendingDelete?.name}
        onClose={() => setPendingDelete(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (pendingDelete) void remove(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Удалить навсегда
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted">
          Папка сборки, миры, моды и конфигурации будут удалены без возможности
          восстановления.
        </p>
      </Modal>
    </div>
  );
}
