import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Check,
  ChevronDown,
  Compass,
  Layers,
  Minus,
  Package,
  Plus,
  Settings,
  Square,
  UserPlus,
  X,
} from 'lucide-react';
import { isMockEnabled } from '../api/mock';
import { useAccountsStore } from '../stores/accountsStore';
import { cn } from '../utils/cn';
import { AccountAvatar } from './AccountAvatar';

export type PageId = 'home' | 'instances' | 'mods' | 'settings';

const NAV_TABS: Array<{ id: PageId; label: string; icon: typeof Compass }> = [
  { id: 'home', label: 'Обзор', icon: Compass },
  { id: 'instances', label: 'Сборки', icon: Layers },
  { id: 'mods', label: 'Моды', icon: Package },
  { id: 'settings', label: 'Настройки', icon: Settings },
];

interface TitleBarProps {
  page: PageId;
  onNavigate: (page: PageId) => void;
  onQuickAddAccount: () => void;
}

/** Верхняя панель управления: навигация, профиль игрока и кнопки окна. */
export function TitleBar({ page, onNavigate, onQuickAddAccount }: TitleBarProps) {
  const store = useAccountsStore((s) => s.store);
  const activeAccount = useAccountsStore((s) => s.activeAccount);
  const setActiveAccount = useAccountsStore((s) => s.setActive);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const controlWindow = async (action: 'minimize' | 'toggle-maximize' | 'close') => {
    if (isMockEnabled()) return;
    const commands = {
      minimize: 'plugin:window|minimize',
      'toggle-maximize': 'plugin:window|toggle_maximize',
      close: 'plugin:window|close',
    } as const;
    await invoke(commands[action]);
  };

  const accounts = store?.accounts ?? [];

  return (
    <header
      data-tauri-drag-region
      className="relative z-30 flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface/45 px-4 backdrop-blur-2xl select-none"
    >
      {/* Левая группа: логотип и режимы */}
      <div className="flex items-center gap-3.5">
        <div data-tauri-drag-region className="flex items-center gap-2.5 pr-1">
          <img src="/icon.png" alt="" className="h-6 w-6 object-contain" />
          <span className="text-[13.5px] font-semibold tracking-tight text-ink">
            Hydro
          </span>
        </div>

        <nav
          aria-label="Разделы"
          className="flex items-center gap-1 rounded-[10px] border border-line bg-bg-well/80 p-1 backdrop-blur-md"
        >
          {NAV_TABS.map((tab) => {
            const active = page === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onNavigate(tab.id)}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-[7px] border px-3 py-1 text-[12px] font-medium transition-colors duration-150',
                  active
                    ? 'keycap-surface text-ink'
                    : 'border-transparent text-muted hover:bg-surface-2/40 hover:text-ink',
                )}
              >
                <Icon
                  size={13}
                  className={cn('transition-colors', active ? 'text-accent' : 'text-faint')}
                />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Правая группа: профиль, управление окном */}
      <div className="flex items-center gap-2.5">
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-8 items-center gap-2 rounded-[9px] border border-line-strong bg-surface-2/75 px-2.5 text-[12px] text-ink backdrop-blur-md shadow-[inset_0_1px_0_var(--rim)] transition-all hover:bg-surface-2"
          >
            {activeAccount ? (
              <>
                <AccountAvatar username={activeAccount.username} active size={18} />
                <span className="max-w-[120px] truncate font-medium">
                  {activeAccount.username}
                </span>
              </>
            ) : (
              <>
                <UserPlus size={12} className="text-warn" />
                <span className="text-muted">Профиль</span>
              </>
            )}
            <ChevronDown size={12} className="text-faint" />
          </button>

          {menuOpen && (
            <div className="deck-surface absolute top-full right-0 mt-1.5 w-60 rounded-[9px] p-1.5">
              <div className="px-2 py-1 text-[10.5px] font-medium tracking-wider text-faint uppercase">
                Офлайн-профили
              </div>
              {accounts.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted">Профилей пока нет</p>
              ) : (
                <div className="max-h-48 space-y-0.5 overflow-y-auto">
                  {accounts.map((account) => {
                    const isCurrent = activeAccount?.id === account.id;
                    return (
                      <button
                        key={account.id}
                        onClick={() => {
                          void setActiveAccount(account.id);
                          setMenuOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left transition-colors',
                          isCurrent
                            ? 'bg-surface-2 text-ink'
                            : 'text-muted hover:bg-surface-2/60 hover:text-ink',
                        )}
                      >
                        <AccountAvatar
                          username={account.username}
                          active={isCurrent}
                          size={20}
                        />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {account.username}
                        </span>
                        {isCurrent && <Check size={12} className="shrink-0 text-led" />}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-1 border-t border-line pt-1">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onQuickAddAccount();
                  }}
                  className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-2"
                >
                  <Plus size={12} className="text-muted" />
                  Добавить профиль
                </button>
              </div>
            </div>
          )}
        </div>

        <span className="h-3.5 w-px bg-line" aria-hidden />

        <div className="flex items-center gap-0.5">
          <WindowButton onClick={() => void controlWindow('minimize')} label="Свернуть">
            <Minus size={12} strokeWidth={1.75} />
          </WindowButton>
          <WindowButton
            onClick={() => void controlWindow('toggle-maximize')}
            label="Развернуть"
          >
            <Square size={9.5} strokeWidth={1.75} />
          </WindowButton>
          <WindowButton onClick={() => void controlWindow('close')} label="Закрыть" danger>
            <X size={12.5} strokeWidth={1.75} />
          </WindowButton>
        </div>
      </div>
    </header>
  );
}

function WindowButton({
  children,
  onClick,
  label,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-[5px] text-muted transition-colors',
        danger
          ? 'hover:bg-danger/15 hover:text-danger'
          : 'hover:bg-surface-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
