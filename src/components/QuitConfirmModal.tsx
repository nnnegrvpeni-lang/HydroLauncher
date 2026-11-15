import { useState } from 'react';
import { LogOut, Power } from 'lucide-react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

interface QuitConfirmModalProps {
  open: boolean;
  onClose: () => void;
}

/** Подтверждение выхода, когда игра ещё запущена. */
export function QuitConfirmModal({ open, onClose }: QuitConfirmModalProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  const quit = (stopGames: boolean) => {
    setBusy(true);
    void api.quitApp(stopGames).catch(() => {
      setBusy(false);
      onClose();
    });
  };

  return (
    <Modal
      open={open}
      title={t('Игра ещё запущена')}
      onClose={onClose}
      className="max-w-[560px]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('Отмена')}
          </Button>
          <Button variant="secondary" onClick={() => quit(false)} disabled={busy}>
            <LogOut size={13} />
            {t('Выйти, игра останется')}
          </Button>
          <Button variant="danger" onClick={() => quit(true)} disabled={busy}>
            <Power size={13} />
            {t('Остановить игру и выйти')}
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-muted">
        {t(
          'Если выйти сейчас, Minecraft продолжит работать, но лаунчер про него забудет — остановить игру можно будет только через диспетчер задач.',
        )}
      </p>
    </Modal>
  );
}
