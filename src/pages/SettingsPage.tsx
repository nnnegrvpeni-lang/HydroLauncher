import { useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { AccountAvatar } from '../components/AccountAvatar';
import { QuickAccountModal } from '../components/QuickAccountModal';
import { Button, IconButton } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Switch } from '../components/ui/Switch';
import { useAccountsStore } from '../stores/accountsStore';
import { useSettingsStore } from '../stores/settingsStore';
import { api, type JavaRuntime, type OfflineAccount, type ThemeMode } from '../api';
import { cn } from '../utils/cn';
import { formatMemory } from '../utils/format';

type TabId = 'profiles' | 'launch' | 'java' | 'storage';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'profiles', label: 'Профили и вид' },
  { id: 'launch', label: 'Память и запуск' },
  { id: 'java', label: 'Java' },
  { id: 'storage', label: 'Хранилище' },
];

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>('profiles');

  return (
    <div className="mx-auto max-w-[780px] px-8 py-7">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">
            Настройки
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            Профили игроков, тема оформления, память и файлы лаунчера
          </p>
        </div>

        <div className="inline-flex gap-1 rounded-[10px] border border-line bg-surface/55 p-1 backdrop-blur-xl">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'rounded-[7px] border px-3 py-1 text-xs font-medium transition-colors duration-150',
                  active
                    ? 'keycap-surface text-ink'
                    : 'border-transparent text-muted hover:text-ink',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="mt-6 space-y-5">
        {tab === 'profiles' && (
          <>
            <AccountsGroup />
            <AppearanceGroup />
          </>
        )}
        {tab === 'launch' && <PerformanceGroup />}
        {tab === 'java' && <JavaGroup />}
        {tab === 'storage' && <StorageGroup />}
      </div>
    </div>
  );
}

function Group({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="deck-surface overflow-hidden rounded-[14px]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-3.5">
        <div>
          <h2 className="text-[13.5px] font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        {action}
      </div>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function AccountsGroup() {
  const store = useAccountsStore((s) => s.store);
  const setActive = useAccountsStore((s) => s.setActive);
  const remove = useAccountsStore((s) => s.remove);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<OfflineAccount | null>(null);

  const accounts = store?.accounts ?? [];

  return (
    <Group
      title="Офлайн-профили"
      description="Локальные профили без внешней авторизации"
      action={
        <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
          <Plus size={13} />
          Добавить
        </Button>
      }
    >
      {accounts.length === 0 ? (
        <p className="px-5 py-6 text-center text-xs text-muted">
          Нет созданных профилей.
        </p>
      ) : (
        accounts.map((account) => {
          const isActive = account.id === (store?.activeAccountId ?? accounts[0]?.id);
          return (
            <div
              key={account.id}
              className={cn(
                'flex items-center gap-3 px-5 py-3 transition-colors',
                isActive ? 'bg-surface-2/50' : 'hover:bg-surface-2/30',
              )}
            >
              <AccountAvatar
                username={account.username}
                active={isActive}
                size={30}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-ink">
                    {account.username}
                  </span>
                  {isActive && (
                    <span className="text-[11px] font-medium text-muted">
                      · текущий
                    </span>
                  )}
                </div>
                <p className="truncate font-mono text-[11px] text-faint">{account.uuid}</p>
              </div>

              {!isActive && (
                <Button size="sm" variant="ghost" onClick={() => void setActive(account.id)}>
                  <Check size={12} />
                  Выбрать
                </Button>
              )}

              <IconButton
                onClick={() => setPendingDelete(account)}
                title="Удалить профиль"
                className="text-muted hover:bg-danger/12 hover:text-danger"
              >
                <Trash2 size={13.5} />
              </IconButton>
            </div>
          );
        })
      )}

      <QuickAccountModal open={addOpen} onClose={() => setAddOpen(false)} />

      <Modal
        open={pendingDelete !== null}
        title="Удалить профиль?"
        subtitle={pendingDelete?.username}
        onClose={() => setPendingDelete(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (pendingDelete) {
                  void remove(pendingDelete.id);
                  setPendingDelete(null);
                }
              }}
            >
              Удалить
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted">
          Профиль будет удалён из списка лаунчера. Миры и файлы сборок останутся на месте.
        </p>
      </Modal>
    </Group>
  );
}

function AppearanceGroup() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);

  const options: Array<{ value: ThemeMode; label: string }> = [
    { value: 'dark', label: 'Сумерки' },
    { value: 'night', label: 'Ночь' },
    { value: 'light', label: 'День' },
  ];

  const currentTheme = settings?.theme === 'system' ? 'dark' : settings?.theme;

  return (
    <Group title="Оформление" description="Тема поверхности окна и мира на фоне">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5">
        <span className="text-[13px] text-ink">Цветовая тема</span>
        <div className="inline-flex rounded-[7px] border border-line bg-bg-well p-0.5">
          {options.map((option) => {
            const active = currentTheme === option.value;
            return (
              <button
                key={option.value}
                onClick={() => {
                  if (settings) void save({ ...settings, theme: option.value });
                }}
                className={cn(
                  'rounded-[5px] border px-3 py-1 text-xs font-medium transition-colors duration-150',
                  active
                    ? 'keycap-surface text-ink'
                    : 'border-transparent text-muted hover:text-ink',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </Group>
  );
}

function PerformanceGroup() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const systemInfo = useSettingsStore((s) => s.systemInfo);

  if (!settings) return null;

  const maxMb = systemInfo?.totalMemoryMb ?? 8192;
  const step = 512;
  const sliderMax = Math.max(step, Math.floor(maxMb / step) * step);

  return (
    <Group
      title="Память и запуск"
      description="Параметры по умолчанию для сборок без собственного лимита"
      action={
        <span className="rounded-[5px] border border-line-strong bg-bg-well px-2.5 py-1 font-mono text-xs font-medium text-ink tabular-nums">
          {formatMemory(settings.defaultMemoryMb)}
        </span>
      }
    >
      <div className="px-5 py-4">
        <input
          type="range"
          min={step}
          max={sliderMax}
          step={step}
          value={Math.min(settings.defaultMemoryMb, sliderMax)}
          onChange={(e) =>
            void save({ ...settings, defaultMemoryMb: Number(e.target.value) })
          }
          className="hl-range"
          aria-label="Память по умолчанию"
        />
        <div className="mt-1 flex justify-between font-mono text-[11px] text-faint">
          <span>{formatMemory(step)}</span>
          <span>{formatMemory(sliderMax)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 px-5 py-3.5">
        <div>
          <p className="text-[13px] font-medium text-ink">
            Скрывать лаунчер после запуска игры
          </p>
          <p className="text-xs text-muted">
            Окно вернётся автоматически после выхода из Minecraft
          </p>
        </div>
        <Switch
          checked={settings.closeOnLaunch}
          onChange={(checked) => void save({ ...settings, closeOnLaunch: checked })}
          label="Скрывать лаунчер после запуска игры"
        />
      </div>

      <div className="flex items-center justify-between gap-4 px-5 py-3.5">
        <div>
          <p className="text-[13px] font-medium text-ink">
            Показывать снапшоты при создании сборки
          </p>
          <p className="text-xs text-muted">
            Включает тестовые версии в каталог выбора
          </p>
        </div>
        <Switch
          checked={settings.showSnapshots}
          onChange={(checked) => void save({ ...settings, showSnapshots: checked })}
          label="Показывать снапшоты"
        />
      </div>
    </Group>
  );
}

function JavaGroup() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const [runtimes, setRuntimes] = useState<JavaRuntime[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRuntimes(await api.getJavaRuntimes());
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  const download = async (major: number) => {
    setDownloading(major);
    try {
      await api.downloadJavaRuntime(major);
      await load();
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Group
      title="Java"
      description="Поиск установленных JVM и загрузка Eclipse Temurin"
      action={
        <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? (
            <Loader2 size={12.5} className="animate-spin" />
          ) : (
            <RefreshCw size={12.5} />
          )}
          Найти на ПК
        </Button>
      }
    >
      {loaded && runtimes.length === 0 && (
        <p className="px-5 py-4 text-xs text-muted">
          Системная Java не найдена — можно установить ниже.
        </p>
      )}

      {runtimes.length > 0 && (
        <div className="divide-y divide-line">
          {runtimes.map((runtime) => (
            <div
              key={runtime.path}
              className="flex items-center justify-between gap-3 px-5 py-3"
            >
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="font-medium text-ink">
                  Java {runtime.majorVersion}
                </span>
                <span className="text-faint">·</span>
                <span className="font-sans text-muted">{runtime.vendor}</span>
                {runtime.isManaged && (
                  <>
                    <span className="text-faint">·</span>
                    <span className="font-sans text-muted">управляемая</span>
                  </>
                )}
              </div>
              <span
                className="max-w-[280px] truncate font-mono text-[11px] text-faint"
                title={runtime.path}
              >
                {runtime.path}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <span className="text-[13px] text-ink">Быстрая установка Temurin</span>
        <div className="flex gap-2">
          {[17, 21].map((major) => (
            <Button
              key={major}
              size="sm"
              variant="secondary"
              onClick={() => void download(major)}
              disabled={downloading !== null}
            >
              {downloading === major ? (
                <Loader2 size={12.5} className="animate-spin" />
              ) : (
                <Download size={12.5} />
              )}
              Java {major}
            </Button>
          ))}
        </div>
      </div>

      <div className="px-5 py-4">
        <label className="hl-field-label" htmlFor="java-paths">
          Дополнительные пути к java.exe (по одному в строке)
        </label>
        <textarea
          id="java-paths"
          rows={2}
          value={(settings?.customJavaPaths ?? []).join('\n')}
          onChange={(e) => {
            if (settings) {
              void save({
                ...settings,
                customJavaPaths: e.target.value.split('\n').filter((line) => line.trim()),
              });
            }
          }}
          placeholder="C:\Program Files\Java\jdk-21\bin\java.exe"
          className="hl-textarea"
        />
      </div>
    </Group>
  );
}

function StorageGroup() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const systemInfo = useSettingsStore((s) => s.systemInfo);
  const [error, setError] = useState<string | null>(null);

  if (!settings) return null;

  const pick = async () => {
    const dir = await api.pickDirectory();
    if (!dir) return;
    try {
      await api.validateDataDir(dir);
      await save({ ...settings, dataDir: dir });
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <Group
      title="Хранилище"
      description="Корневая папка со сборками, ассетами и профилями"
    >
      <div className="px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="min-w-0 flex-1 truncate rounded-[8px] border border-line-strong bg-bg-well px-3 py-2 font-mono text-xs text-ink">
            {settings.dataDir || systemInfo?.defaultDataDir}
          </div>
          <Button size="md" variant="secondary" onClick={() => void pick()}>
            <FolderOpen size={13.5} />
            Изменить
          </Button>
        </div>
        {error && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-danger">
            <AlertCircle size={13} />
            {error}
          </p>
        )}
      </div>
    </Group>
  );
}
