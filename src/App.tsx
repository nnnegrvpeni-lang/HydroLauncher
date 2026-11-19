import { useEffect, useState } from 'react';
import { Loader2, Package } from 'lucide-react';
import { Modal } from './components/ui/Modal';
import { SelectMenu } from './components/ui/SelectMenu';
import { Button } from './components/ui/Button';
import type { DropItem } from './api/types';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { api } from './api';
import { isMockEnabled } from './api/mock';
import { CreateInstanceModal } from './components/CreateInstanceModal';
import { CrashReportModal } from './components/CrashReportModal';
import { QuickAccountModal } from './components/QuickAccountModal';
import { QuitConfirmModal } from './components/QuitConfirmModal';
import { TitleBar } from './components/TitleBar';
import { ToastHost } from './components/ToastHost';
import { listenQuitRequested } from './api';
import { useHashRoute } from './hooks/useHashRoute';
import { translate } from './i18n';
import { HomePage } from './pages/HomePage';
import { InstancesPage } from './pages/InstancesPage';
import { ModsPage } from './pages/ModsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SkinsPage } from './pages/SkinsPage';
import { useInitAccounts } from './stores/accountsStore';
import { useInitCatalogPreload } from './stores/catalogStore';
import { useInitInstances, useInstancesStore } from './stores/instancesStore';
import { useInitJobs } from './stores/jobsStore';
import { useInitLinks } from './stores/linksStore';
import { useInitLaunchListeners } from './stores/launchStore';
import { useInitSettings, useSettingsStore } from './stores/settingsStore';
import { useInitLauncherUpdate } from './stores/updateStore';
import { useNotifyStore } from './stores/notifyStore';
import { useGameNotifications } from './hooks/useGameNotifications';

function WorldBackdrop({ showSun }: { showSun: boolean }) {
  return (
    <div className="hl-world" aria-hidden>
      <div className="hl-stars" />
      {showSun && <div className="hl-sun" />}
      <div className="hl-cloud" style={{ left: '18%', top: '27%', width: 180 }} />
      <div
        className="hl-cloud"
        style={{ left: '58%', top: '36%', width: 220, animationDelay: '-14s' }}
      />
      <div className="hl-hill a" />
      <div className="hl-hill b" />
      <div className="hl-hill c" />
    </div>
  );
}

export default function App() {
  const [page, setPage] = useHashRoute();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [modsTargetInstanceId, setModsTargetInstanceId] = useState<string | null>(null);
  const [skinsAccountId, setSkinsAccountId] = useState<string | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickAccountOpen, setQuickAccountOpen] = useState(false);
  const [quitPromptOpen, setQuitPromptOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [dropItems, setDropItems] = useState<DropItem[]>([]);
  const [dropTargetId, setDropTargetId] = useState('');
  const [dropBusy, setDropBusy] = useState(false);
  const loading = useSettingsStore((s) => s.loading);
  const availableInstances = useInstancesStore((s) => s.instances);

  useInitSettings();
  useInitAccounts();
  useInitInstances();
  useInitLaunchListeners();
  useInitCatalogPreload();
  useInitLauncherUpdate();
  useInitLinks();
  useInitJobs();
  useGameNotifications();

  // Отключаем стандартное браузерное контекстное меню на ПКМ
  useEffect(() => {
    const preventContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener('contextmenu', preventContextMenu);
    return () => window.removeEventListener('contextmenu', preventContextMenu);
  }, []);

  // Бэкенд просит подтвердить выход, если игра ещё работает
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenQuitRequested(() => setQuitPromptOpen(true)).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Распознаём перетаскиваемые файлы и просим подтвердить импорт.
  useEffect(() => {
    if (isMockEnabled()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'enter' || event.payload.type === 'over') setDropActive(true);
      else if (event.payload.type === 'leave') setDropActive(false);
      else if (event.payload.type === 'drop') {
        setDropActive(false);
        void api.inspectDropPaths(event.payload.paths).then((items) => {
          setDropItems(items);
          setDropTargetId(useInstancesStore.getState().instances[0]?.id ?? '');
        }).catch((err) => useNotifyStore.getState().push(String(err), 'error'));
      }
    }).then((fn) => { if (disposed) fn(); else unlisten = fn; });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  const confirmDropImport = async () => {
    setDropBusy(true);
    try {
      for (const item of dropItems) {
        if (item.kind === 'modpack') await api.importMrpackFile(item.path);
        else if (item.kind === 'instance' || item.kind === 'prism') await api.importDropInstance(item.path);
        else if (['world', 'resourcepack', 'mod'].includes(item.kind)) {
          if (!dropTargetId) throw new Error(translate('Сначала выберите сборку'));
          await api.importDropContent(dropTargetId, item.path);
        }
      }
      await useInstancesStore.getState().load();
      setDropItems([]);
      setPage('instances');
    } catch (err) { useNotifyStore.getState().push(String(err), 'error'); }
    finally { setDropBusy(false); }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <Loader2 className="animate-spin text-muted" size={20} strokeWidth={1.75} />
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-bg text-ink">
      <WorldBackdrop showSun={page === 'home'} />

      <TitleBar
        page={page}
        onNavigate={setPage}
        onQuickAddAccount={() => setQuickAccountOpen(true)}
      />

      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {page === 'home' && (
          <HomePage
            selectedInstanceId={selectedInstanceId}
            onSelectInstance={setSelectedInstanceId}
            onNavigate={setPage}
            onQuickCreateInstance={() => setQuickCreateOpen(true)}
            onQuickAddAccount={() => setQuickAccountOpen(true)}
            onOpenModsForInstance={(id) => {
              setModsTargetInstanceId(id);
              setPage('mods');
            }}
          />
        )}
        {page === 'instances' && (
          <InstancesPage
            onSelectInstance={(id) => {
              setSelectedInstanceId(id);
              setPage('home');
            }}
            onOpenModsForInstance={(id) => {
              setModsTargetInstanceId(id);
              setPage('mods');
            }}
          />
        )}
        {page === 'mods' && (
          <ModsPage
            targetInstanceId={modsTargetInstanceId}
            onClearTargetInstance={() => setModsTargetInstanceId(null)}
            onQuickCreateInstance={() => setQuickCreateOpen(true)}
          />
        )}
        {page === 'skins' && <SkinsPage initialAccountId={skinsAccountId} />}
        {page === 'settings' && (
          <SettingsPage
            onOpenSkins={(accountId) => {
              setSkinsAccountId(accountId);
              setPage('skins');
            }}
          />
        )}
      </main>

      <CreateInstanceModal
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={(id) => {
          setSelectedInstanceId(id);
          setPage('home');
        }}
      />

      <QuickAccountModal
        open={quickAccountOpen}
        onClose={() => setQuickAccountOpen(false)}
      />

      <Modal open={dropItems.length > 0} title={translate('Подтвердить импорт')} subtitle={dropItems.map((item) => item.fileName).join(', ')} onClose={() => !dropBusy && setDropItems([])} footer={<><Button variant="ghost" onClick={() => setDropItems([])} disabled={dropBusy}>{translate('Отмена')}</Button><Button onClick={() => void confirmDropImport()} disabled={dropBusy || dropItems.some((item) => item.kind === 'unknown') || (dropItems.some((item) => ['world', 'resourcepack', 'mod'].includes(item.kind)) && !dropTargetId)}>{dropBusy ? <Loader2 size={13} className="animate-spin" /> : null}{translate('Импортировать')}</Button></>}>
        <div className="space-y-3 text-[13px] text-muted">
          <ul className="space-y-2">{dropItems.map((item) => <li key={item.path} className="flex justify-between gap-4"><span className="truncate text-ink">{item.fileName}</span><span>{translate(item.kind)}</span></li>)}</ul>
          {dropItems.some((item) => item.kind === 'unknown') && <p className="text-danger">{translate('Тип архива не распознан. Импортировать его нельзя.')}</p>}
          {dropItems.some((item) => ['world', 'resourcepack', 'mod'].includes(item.kind)) && <div className="block"><span className="hl-field-label">{translate('Целевая сборка')}</span><SelectMenu value={dropTargetId} onChange={setDropTargetId} ariaLabel={translate('Целевая сборка')} options={[{ value: '', label: translate('Выберите сборку') }, ...availableInstances.map((instance) => ({ value: instance.id, label: instance.name }))]} /></div>}
        </div>
      </Modal>
      <ToastHost />
      <CrashReportModal />
      <QuitConfirmModal open={quitPromptOpen} onClose={() => setQuitPromptOpen(false)} />

      {dropActive && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-bg/55">
          <div className="deck-surface hl-pop-in rounded-[16px] border border-accent/40 px-8 py-6 text-center">
            <Package size={28} className="mx-auto text-accent" />
            <p className="mt-2 text-sm font-medium text-ink">
              {translate('Отпустите файл, чтобы импортировать')}
            </p>
            <p className="mt-1 text-xs text-muted">
              {translate('.mrpack — модпак, .zip — архив сборки')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
