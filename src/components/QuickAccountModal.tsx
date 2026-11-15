import { useState } from 'react';
import { useI18n } from '../i18n';
import { useAccountsStore } from '../stores/accountsStore';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

interface QuickAccountModalProps {
  open: boolean;
  onClose: () => void;
}

export function QuickAccountModal({ open, onClose }: QuickAccountModalProps) {
  const create = useAccountsStore((s) => s.create);
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    try {
      await create(username);
      setUsername('');
      setError(null);
      onClose();
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <Modal
      open={open}
      title={t('Новый офлайн-профиль')}
      subtitle={t('Никнейм от 3 до 16 символов: латиница, цифры или _')}
      onClose={() => {
        setError(null);
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
          autoFocus
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </Modal>
  );
}
