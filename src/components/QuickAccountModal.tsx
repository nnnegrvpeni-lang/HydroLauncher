import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { useI18n } from '../i18n';
import { localizeError } from '../i18n/errors';
import { useAccountsStore } from '../stores/accountsStore';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

interface QuickAccountModalProps {
  open: boolean;
  onClose: () => void;
}

export function QuickAccountModal({ open, onClose }: QuickAccountModalProps) {
  const create = useAccountsStore((s) => s.create);
  const loginMicrosoft = useAccountsStore((s) => s.loginMicrosoft);
  const { t, language } = useI18n();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [microsoftBusy, setMicrosoftBusy] = useState(false);

  const reset = () => {
    setUsername('');
    setError(null);
    setMicrosoftBusy(false);
  };

  const submit = async () => {
    try {
      await create(username);
      reset();
      onClose();
    } catch (err) {
      setError(String(err));
    }
  };

  const signIn = async () => {
    setMicrosoftBusy(true);
    setError(null);
    try {
      await loginMicrosoft();
      reset();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setMicrosoftBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('Новый профиль')}
      subtitle={t('Официальный аккаунт Microsoft или локальный профиль')}
      onClose={() => {
        reset();
        onClose();
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Отмена')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={!username.trim()}
          >
            {t('Создать')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-[10px] border border-line bg-bg-well/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">
                {t('Вход через Microsoft')}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {t('Скины, плащи и доступ к официальным серверам')}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void signIn()}
              disabled={microsoftBusy}
            >
              <LogIn size={13} />
              {microsoftBusy ? t('Ожидание входа…') : t('Войти')}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-faint">
          <span className="h-px flex-1 bg-line" aria-hidden />
          {t('или офлайн-профиль')}
          <span className="h-px flex-1 bg-line" aria-hidden />
        </div>

        <div>
          <label className="hl-field-label" htmlFor="quick-account-name">
            {t('Никнейм игрока')}
          </label>
          <input
            id="quick-account-name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && username.trim()) void submit();
            }}
            placeholder={t('Например, Steve')}
            maxLength={16}
            autoComplete="off"
            spellCheck={false}
            className="hl-input"
          />
          <p className="mt-1.5 text-xs text-muted">
            {t('Никнейм от 3 до 16 символов: латиница, цифры или _')}
          </p>
        </div>

        {error && <p className="text-xs text-danger">{localizeError(error, language)}</p>}
      </div>
    </Modal>
  );
}
