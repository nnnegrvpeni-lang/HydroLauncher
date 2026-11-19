import { useEffect, useState } from 'react';
import {
  Check,
  ImagePlus,
  Loader2,
  LogIn,
  RotateCcw,
  Shirt,
  TriangleAlert,
} from 'lucide-react';
import { api, type SkinProfile, type SkinVariant } from '../api';
import { AccountAvatar } from '../components/AccountAvatar';
import { SkinModel3D } from '../components/SkinModel3D';
import { Button } from '../components/ui/Button';
import { useI18n } from '../i18n';
import { localizeError } from '../i18n/errors';
import { useAccountsStore } from '../stores/accountsStore';
import { useNotifyStore } from '../stores/notifyStore';
import { cn } from '../utils/cn';

export function SkinsPage({ initialAccountId }: { initialAccountId?: string | null }) {
  const store = useAccountsStore((s) => s.store);
  const setActive = useAccountsStore((s) => s.setActive);
  const loginMicrosoft = useAccountsStore((s) => s.loginMicrosoft);
  const notify = useNotifyStore((s) => s.push);
  const { t, language } = useI18n();

  const accounts = store?.accounts ?? [];
  const microsoftAccounts = accounts.filter((account) => account.kind === 'microsoft');

  const [selectedId, setSelectedId] = useState<string | null>(initialAccountId ?? null);
  const [signingIn, setSigningIn] = useState(false);
  const [profile, setProfile] = useState<SkinProfile | null>(null);
  const [variant, setVariant] = useState<SkinVariant>('classic');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected =
    microsoftAccounts.find((account) => account.id === selectedId) ??
    microsoftAccounts[0] ??
    null;

  // Выбранный аккаунт мог исчезнуть (выход, удаление) — переключаемся на первый.
  useEffect(() => {
    if (selectedId && microsoftAccounts.some((account) => account.id === selectedId)) return;
    setSelectedId(microsoftAccounts[0]?.id ?? null);
  }, [microsoftAccounts, selectedId]);

  useEffect(() => {
    if (!selected) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setProfile(null);
    setFilePath(null);
    setError(null);
    setLoading(true);
    api
      .getSkin(selected.id)
      .then((value) => {
        if (cancelled) return;
        setProfile(value);
        setVariant(value.variant);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const signIn = async () => {
    setSigningIn(true);
    try {
      await loginMicrosoft();
      notify(t('Аккаунт Microsoft подключён'));
    } catch (err) {
      notify(localizeError(String(err), language), 'error');
    } finally {
      setSigningIn(false);
    }
  };

  const run = async (action: () => Promise<SkinProfile>) => {
    setBusy(true);
    setError(null);
    try {
      const value = await action();
      setProfile(value);
      setVariant(value.variant);
      return value;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async () => {
    setError(null);
    try {
      const path = await api.pickSkinFile();
      if (path) setFilePath(path);
    } catch (err) {
      setError(String(err));
    }
  };

  const fileName = filePath?.split(/[\\/]/).pop() ?? null;

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">{t('Скины')}</h1>
          <p className="mt-0.5 text-xs text-muted">
            {t('Скин и плащи аккаунта Microsoft — так их видят другие игроки')}
          </p>
        </div>

        {microsoftAccounts.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => void signIn()} disabled={signingIn}>
            <LogIn size={13} />
            {signingIn ? t('Ожидание входа…') : t('Добавить аккаунт Microsoft')}
          </Button>
        )}
      </header>

      {microsoftAccounts.length === 0 ? (
        <MicrosoftRequired signingIn={signingIn} onSignIn={() => void signIn()} />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[264px_minmax(0,1fr)]">
          {/* Список аккаунтов */}
          <aside className="deck-surface self-start overflow-hidden rounded-[14px]">
            <div className="border-b border-line px-4 py-2.5 text-[11px] font-medium text-faint">
              {t('Аккаунты Microsoft')}
            </div>
            <div className="divide-y divide-line">
              {microsoftAccounts.map((account) => {
                const isSelected = selected?.id === account.id;
                const isCurrent = account.id === (store?.activeAccountId ?? accounts[0]?.id);
                return (
                  <div
                    key={account.id}
                    className={cn(
                      'flex items-center gap-1 pr-2 transition-colors',
                      isSelected ? 'bg-surface-2/55' : 'hover:bg-surface-2/30',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(account.id)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left"
                    >
                      <AccountAvatar username={account.username} active={isSelected} size={26} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-ink">
                          {account.username}
                        </span>
                        <span className="block truncate text-[10.5px] text-faint">
                          {isCurrent ? t('· текущий профиль') : 'Microsoft'}
                        </span>
                      </span>
                    </button>
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => void setActive(account.id)}
                        title={t('Сделать текущим профилем')}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-faint transition-colors hover:bg-surface-2 hover:text-ink"
                      >
                        <Check size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-line px-3.5 py-2.5">
              <p className="text-[11px] leading-relaxed text-faint">
                {t('Офлайн-профили не поддерживают скины: игра берёт текстуру с серверов Mojang.')}
              </p>
            </div>
          </aside>

          {/* Редактор */}
          <section className="deck-surface min-w-0 overflow-hidden rounded-[14px]">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-24 text-xs text-muted">
                <Loader2 size={15} className="animate-spin" />
                {t('Загрузка скина…')}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0">
                  <SkinModel3D
                    texture={profile?.textureDataUrl ?? null}
                    variant={variant}
                    scale={9}
                    className="h-full min-h-[360px]"
                  />
                </div>

                <div className="flex min-w-0 flex-col gap-4">
                  <div>
                    <p className="text-[13px] font-medium text-ink">{selected?.username}</p>
                    <p className="truncate font-mono text-[11px] text-faint">
                      {profile?.id ?? selected?.uuid}
                    </p>
                  </div>

                  <div>
                    <span className="hl-field-label">{t('Модель скина')}</span>
                    <div className="inline-flex w-full rounded-[8px] border border-line bg-bg-well p-0.5">
                      {(['classic', 'slim'] as const).map((model) => (
                        <button
                          key={model}
                          type="button"
                          onClick={() => setVariant(model)}
                          className={cn(
                            'flex-1 rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                            variant === model
                              ? 'keycap-surface text-ink'
                              : 'text-muted hover:text-ink',
                          )}
                        >
                          {model === 'classic' ? t('Классическая') : t('Тонкая')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="hl-field-label">{t('Текстура')}</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      disabled={busy}
                      onClick={() => void pickFile()}
                    >
                      <ImagePlus size={13} />
                      {t('Выбрать PNG')}
                    </Button>
                    <p className="truncate text-[11px] text-faint">
                      {fileName ?? t('Файл 64×64 или 64×32 пикселя')}
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full"
                      disabled={busy || !filePath || !selected}
                      onClick={() => {
                        if (!selected || !filePath) return;
                        void run(() => api.uploadSkin(selected.id, filePath, variant)).then(
                          (value) => {
                            if (value) {
                              setFilePath(null);
                              notify(t('Скин обновлён'));
                            }
                          },
                        );
                      }}
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : null}
                      {t('Загрузить скин')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      disabled={busy || !selected}
                      onClick={() => {
                        if (!selected) return;
                        void run(() => api.resetSkin(selected.id));
                      }}
                    >
                      <RotateCcw size={13} />
                      {t('Сбросить скин')}
                    </Button>
                  </div>

                  <div className="border-t border-line pt-3.5">
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-faint">
                      <Shirt size={12} />
                      {t('Плащи')}
                    </div>
                    {profile && profile.capes.length > 0 ? (
                      <div className="space-y-1">
                        {profile.capes.map((cape) => (
                          <div
                            key={cape.id}
                            className="flex items-center justify-between gap-2 rounded-[8px] border border-line bg-surface-2/40 px-2.5 py-1.5"
                          >
                            <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-ink">
                              {cape.active && <Check size={11} className="shrink-0 text-led" />}
                              <span className="truncate">{cape.name}</span>
                            </span>
                            <Button
                              variant={cape.active ? 'ghost' : 'secondary'}
                              size="sm"
                              disabled={busy || !selected}
                              onClick={() => {
                                if (!selected) return;
                                void run(() =>
                                  cape.active
                                    ? api.removeCape(selected.id)
                                    : api.equipCape(selected.id, cape.id),
                                );
                              }}
                            >
                              {cape.active ? t('Снять') : t('Надеть')}
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11.5px] text-muted">
                        {t('У этого аккаунта нет доступных плащей')}
                      </p>
                    )}
                  </div>

                  {error && (
                    <p className="text-xs break-words text-danger">
                      {localizeError(error, language)}
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function MicrosoftRequired({
  signingIn,
  onSignIn,
}: {
  signingIn: boolean;
  onSignIn: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="deck-surface mt-6 rounded-[14px] px-8 py-14 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[12px] border border-line bg-bg-well/70 text-muted">
        <Shirt size={22} strokeWidth={1.6} />
      </div>
      <h2 className="mt-4 text-[15px] font-semibold text-ink">
        {t('Требуется аккаунт Microsoft')}
      </h2>
      <p className="mx-auto mt-1.5 max-w-[440px] text-xs leading-relaxed text-muted">
        {t(
          'Скины и плащи хранятся на серверах Mojang, поэтому менять их можно только у официального аккаунта. Офлайн-профили игра показывает со стандартным скином.',
        )}
      </p>
      <Button
        variant="accent"
        size="lg"
        className="mt-5"
        disabled={signingIn}
        onClick={onSignIn}
      >
        {signingIn ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <LogIn size={14} />
        )}
        {signingIn ? t('Ожидание входа…') : t('Войти через Microsoft')}
      </Button>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-faint">
        <TriangleAlert size={11} />
        {t('Вход выполняется в отдельном окне Microsoft')}
      </p>
    </div>
  );
}
