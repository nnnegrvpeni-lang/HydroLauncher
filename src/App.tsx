import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CreateInstanceModal } from './components/CreateInstanceModal';
import { CrashReportModal } from './components/CrashReportModal';
import { QuickAccountModal } from './components/QuickAccountModal';
import { QuitConfirmModal } from './components/QuitConfirmModal';
import { TitleBar } from './components/TitleBar';
import { ToastHost } from './components/ToastHost';
import { listenQuitRequested } from './api';
import { useHashRoute } from './hooks/useHashRoute';
import { HomePage } from './pages/HomePage';
import { InstancesPage } from './pages/InstancesPage';
import { ModsPage } from './pages/ModsPage';
import { SettingsPage } from './pages/SettingsPage';
import { useInitAccounts } from './stores/accountsStore';
import { useInitCatalogPreload } from './stores/catalogStore';
import { useInitInstances } from './stores/instancesStore';
import { useInitLinks } from './stores/linksStore';
import { useInitLaunchListeners } from './stores/launchStore';
import { useInitSettings, useSettingsStore } from './stores/settingsStore';
import { useInitLauncherUpdate } from './stores/updateStore';

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
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickAccountOpen, setQuickAccountOpen] = useState(false);
  const [quitPromptOpen, setQuitPromptOpen] = useState(false);
  const loading = useSettingsStore((s) => s.loading);

  useInitSettings();
  useInitAccounts();
  useInitInstances();
  useInitLaunchListeners();
  useInitCatalogPreload();
  useInitLauncherUpdate();
  useInitLinks();

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
        {page === 'settings' && <SettingsPage />}
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

      <ToastHost />
      <CrashReportModal />
      <QuitConfirmModal open={quitPromptOpen} onClose={() => setQuitPromptOpen(false)} />
    </div>
  );
}
