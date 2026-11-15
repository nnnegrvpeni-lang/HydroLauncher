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
import { LANGUAGE_OPTIONS, useI18n, type Language } from '../i18n';
import { useAccountsStore } from '../stores/accountsStore';
import { useInstancesStore } from '../stores/instancesStore';
import { useNotifyStore } from '../stores/notifyStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useUpdateStore } from '../stores/updateStore';
import { api, type JavaRuntime, type OfflineAccount, type ThemeMode } from '../api';
import { cn } from '../utils/cn';
import { formatBytes, formatMemory } from '../utils/format';

type TabId = 'profiles' | 'launch' | 'java' | 'storage';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'profiles', label: 'Профили и вид' },
  { id: 'launch', label: 'Память и запуск' },
  { id: 'java', label: 'Java' },
  { id: 'storage', label: 'Хранилище' },
];

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>('profiles');
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-[780px] px-8 py-7">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">
            {t('Настройки')}
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            {t('Профили игроков, тема оформления, память и файлы лаунчера')}
          </p>
        </div>

        <div className="inline-flex gap-1 rounded-[10px] border border-line bg-surface/55 p-1 backdrop-blur-xl">
          {TABS.map((tabItem) => {
            const active = tab === tabItem.id;
            return (
              <button
                key={tabItem.id}
                onClick={() => setTab(tabItem.id)}
                className={cn(
                  'rounded-[7px] border px-3 py-1 text-xs font-medium transition-colors duration-150',
                  active
                    ? 'keycap-surface text-ink'
                    : 'border-transparent text-muted hover:text-ink',
                )}
              >
                {t(tabItem.label)}
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
            <AboutGroup />
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
  const { t } = useI18n();
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<OfflineAccount | null>(null);

  const accounts = store?.accounts ?? [];

  return (
    <Group
      title={t('Офлайн-профили')}
      description={t('Локальные профили без внешней авторизации')}
      action={
        <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
          <Plus size={13} />
          {t('Добавить')}
        </Button>
      }
    >
      {accounts.length === 0 ? (
        <p className="px-5 py-6 text-center text-xs text-muted">
          {t('Нет созданных профилей.')}
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
                      {t('· текущий')}
                    </span>
                  )}
                </div>
                <p className="truncate font-mono text-[11px] text-faint">{account.uuid}</p>
              </div>

              {!isActive && (
                <Button size="sm" variant="ghost" onClick={() => void setActive(account.id)}>
                  <Check size={12} />
                  {t('Выбрать')}
                </Button>
              )}

              <IconButton
                onClick={() => setPendingDelete(account)}
                title={t('Удалить профиль')}
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
        title={t('Удалить профиль?')}
        subtitle={pendingDelete?.username}
        onClose={() => setPendingDelete(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              {t('Отмена')}
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
              {t('Удалить')}
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted">
          {t(
            'Профиль будет удалён из списка лаунчера. Миры и файлы сборок останутся на месте.',
          )}
        </p>
      </Modal>
    </Group>
  );
}

function AppearanceGroup() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const { t } = useI18n();

  const options: Array<{ value: ThemeMode; label: string }> = [
    { value: 'dark', label: 'Сумерки' },
    { value: 'night', label: 'Ночь' },
    { value: 'light', label: 'День' },
  ];

  const currentTheme = settings?.theme === 'system' ? 'dark' : settings?.theme;

  return (
    <Group
      title={t('Оформление')}
      description={t('Тема поверхности окна и мира на фоне')}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5">
        <span className="text-[13px] text-ink">{t('Цветовая тема')}</span>
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
                {t(option.label)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5">
        <div>
          <p className="text-[13px] text-ink">{t('Язык интерфейса')}</p>
          <p className="mt-0.5 text-xs text-muted">
            {t('Переключается сразу, без перезапуска')}
          </p>
        </div>
        <div className="inline-flex rounded-[7px] border border-line bg-bg-well p-0.5">
          {LANGUAGE_OPTIONS.map((option) => {
            const active = (settings?.language ?? 'ru') === option.value;
            return (
              <button
                key={option.value}
                onClick={() => {
                  if (settings) {
                    void save({ ...settings, language: option.value as Language });
                  }
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
  const { t } = useI18n();

  if (!settings) return null;

  const maxMb = systemInfo?.totalMemoryMb ?? 8192;
  const step = 512;
  const sliderMax = Math.max(step, Math.floor(maxMb / step) * step);

  return (
    <Group
      title={t('Память и запуск')}
      description={t('Параметры по умолчанию для сборок без собственного лимита')}
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
          aria-label={t('Память по умолчанию')}
        />
        <div className="mt-1 flex justify-between font-mono text-[11px] text-faint">
          <span>{formatMemory(step)}</span>
          <span>{formatMemory(sliderMax)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 px-5 py-3.5">
        <div>
          <p className="text-[13px] font-medium text-ink">
            {t('Сворачивать лаунчер при запуске игры')}
          </p>
          <p className="text-xs text-muted">
            {t('Окно свернётся в панель задач и вернётся после выхода из игры')}
          </p>
        </div>
        <Switch
          checked={settings.closeOnLaunch}
          onChange={(checked) => void save({ ...settings, closeOnLaunch: checked })}
          label={t('Сворачивать лаунчер при запуске игры')}
        />
      </div>

      <div className="flex items-center justify-between gap-4 px-5 py-3.5">
        <div>
          <p className="text-[13px] font-medium text-ink">
            {t('Сворачивать в трей при закрытии')}
          </p>
          <p className="text-xs text-muted">
            {t(
              'Крестик скрывает окно, лаунчер остаётся в трее. Выход — через меню трея',
            )}
          </p>
        </div>
        <Switch
          checked={settings.closeToTray}
          onChange={(checked) => void save({ ...settings, closeToTray: checked })}
          label={t('Сворачивать в трей при закрытии')}
        />
      </div>

      <div className="flex items-center justify-between gap-4 px-5 py-3.5">
        <div>
          <p className="text-[13px] font-medium text-ink">
            {t('Показывать снапшоты при создании сборки')}
          </p>
          <p className="text-xs text-muted">
            {t('Включает тестовые версии в каталог выбора')}
          </p>
        </div>
        <Switch
          checked={settings.showSnapshots}
          onChange={(checked) => void save({ ...settings, showSnapshots: checked })}
          label={t('Показывать снапшоты')}
        />
      </div>
    </Group>
  );
}

function JavaGroup() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const { t } = useI18n();
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
      title={t('Java')}
      description={t('Поиск установленных JVM и загрузка Eclipse Temurin')}
      action={
        <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? (
            <Loader2 size={12.5} className="animate-spin" />
          ) : (
            <RefreshCw size={12.5} />
          )}
          {t('Найти на ПК')}
        </Button>
      }
    >
      {loaded && runtimes.length === 0 && (
        <p className="px-5 py-4 text-xs text-muted">
          {t('Системная Java не найдена — можно установить ниже.')}
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
                    <span className="font-sans text-muted">{t('управляемая')}</span>
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
        <span className="text-[13px] text-ink">{t('Быстрая установка Temurin')}</span>
        <div className="flex gap-2">
          {[17, 21, 25].map((major) => (
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
          {t('Дополнительные пути к java.exe (по одному в строке)')}
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
  const notify = useNotifyStore((s) => s.push);
  const running = useInstancesStore((s) => s.running);
  const { t, tf, language } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);

  if (!settings) return null;

  const cleanupHorizon = async () => {
    setCleaning(true);
    try {
      const result = await api.cleanupHorizonCache();
      if (result.freedBytes > 0) {
        notify(tf('Очищено {size} кэша Horizon', { size: formatBytes(result.freedBytes, language) }));
      } else {
        notify(t('Нечего удалять: все версии Horizon используются сборками'));
      }
    } catch (err) {
      notify(String(err), 'error');
    } finally {
      setCleaning(false);
    }
  };

  const pick = async () => {
    if (running.size > 0) {
      setError(t('Остановите игру перед сменой папки данных'));
      return;
    }
    const dir = await api.pickDirectory();
    if (!dir) return;
    try {
      await api.validateDataDir(dir);
      await save({ ...settings, dataDir: dir });
      setError(null);
      // Папка данных сменилась — перечитываем сборки и профили, иначе UI покажет старое.
      await Promise.all([
        useInstancesStore.getState().load(),
        useAccountsStore.getState().load(),
      ]);
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <Group
      title={t('Хранилище')}
      description={t('Корневая папка со сборками, ассетами и профилями')}
    >
      <div className="px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate rounded-[8px] border border-line-strong bg-bg-well px-3 py-2 font-mono text-xs text-ink">
            {settings.dataDir || systemInfo?.defaultDataDir}
          </div>
          <Button size="md" variant="secondary" onClick={() => void api.openDataDir()}>
            <FolderOpen size={13.5} />
            {t('Открыть папку')}
          </Button>
          <Button
            size="md"
            variant="secondary"
            onClick={() => void pick()}
            disabled={running.size > 0}
            title={
              running.size > 0 ? t('Остановите игру перед сменой папки данных') : undefined
            }
          >
            {t('Изменить')}
          </Button>
        </div>
        {error && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-danger">
            <AlertCircle size={13} />
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 px-5 py-3.5">
        <div>
          <p className="text-[13px] font-medium text-ink">
            {t('Авто-бэкап миров перед запуском')}
          </p>
          <p className="text-xs text-muted">
            {t('Копии изменившихся миров создаются до старта игры')}
          </p>
        </div>
        <Switch
          checked={settings.autoBackupWorlds}
          onChange={(checked) => void save({ ...settings, autoBackupWorlds: checked })}
          label={t('Авто-бэкап миров перед запуском')}
        />
      </div>

      {settings.autoBackupWorlds && (
        <div className="flex items-center justify-between gap-4 px-5 py-3.5">
          <div>
            <p className="text-[13px] font-medium text-ink">{t('Хранить копий на мир')}</p>
            <p className="text-xs text-muted">
              {t('Старые копии удаляются автоматически')}
            </p>
          </div>
          <select
            value={settings.backupRetention}
            onChange={(e) =>
              void save({ ...settings, backupRetention: Number(e.target.value) })
            }
            className="hl-input h-8 w-20 px-2 text-xs"
            aria-label={t('Хранить копий на мир')}
          >
            {[3, 5, 10, 20].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 px-5 py-3.5">
        <div>
          <p className="text-[13px] font-medium text-ink">{t('Кэш движка Horizon')}</p>
          <p className="text-xs text-muted">
            {t(
              'Удаляет бинарники и подготовленные ресурсы версий, которые не использует ни одна сборка',
            )}
          </p>
        </div>
        <Button
          size="md"
          variant="secondary"
          onClick={() => void cleanupHorizon()}
          disabled={cleaning}
        >
          {cleaning ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          {t('Очистить')}
        </Button>
      </div>
    </Group>
  );
}

function AboutGroup() {
  const info = useUpdateStore((s) => s.info);
  const loading = useUpdateStore((s) => s.loading);
  const dismissed = useUpdateStore((s) => s.dismissedVersion);
  const dismiss = useUpdateStore((s) => s.dismiss);
  const resetDismiss = useUpdateStore((s) => s.resetDismiss);
  const { t, tf } = useI18n();

  const hidden = Boolean(info?.updateAvailable && dismissed === info.latestVersion);

  return (
    <Group title={t('О программе')} description={t('Версия лаунчера и доступные обновления')}>
      <div className="flex items-center justify-between gap-4 px-5 py-3.5">
        <span className="text-[12.5px] text-ink">HydroLauncher</span>
        <span className="font-mono text-[11.5px] text-muted">
          {info?.currentVersion ?? (loading ? t('проверка обновлений…') : '—')}
        </span>
      </div>

      {info?.updateAvailable && !hidden && (
        <div className="flex items-center justify-between gap-4 px-5 py-3.5">
          <button
            onClick={() => {
              void api.openExternalUrl(info.releaseUrl).catch(() => undefined);
            }}
            className="text-left text-[12.5px] text-muted transition-colors hover:text-ink"
            title={t('Открыть страницу релиза')}
          >
            {tf('Доступна версия {version}', {
              version: info.latestVersion,
            })}
          </button>
          <button
            onClick={() => dismiss(info.latestVersion)}
            className="text-[11.5px] text-faint transition-colors hover:text-ink"
          >
            {t('Скрыть')}
          </button>
        </div>
      )}

      {hidden && (
        <div className="flex items-center justify-between gap-4 px-5 py-3.5">
          <span className="text-[12.5px] text-muted">
            {tf('Обновление {version} скрыто', { version: info?.latestVersion ?? '' })}
          </span>
          <button
            onClick={resetDismiss}
            className="text-[11.5px] text-faint transition-colors hover:text-ink"
          >
            {t('Показать')}
          </button>
        </div>
      )}
    </Group>
  );
}
