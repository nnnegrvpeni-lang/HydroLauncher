import { useEffect } from 'react';
import { listenLaunchState } from '../api';
import { translate } from '../i18n';
import { useInstancesStore } from '../stores/instancesStore';
import { notifySystem } from '../utils/systemNotify';

/** Системные уведомления о завершении игры и краше. */
export function useGameNotifications() {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenLaunchState((state) => {
      if (state.state !== 'exited' && state.state !== 'crashed') return;
      const instance = useInstancesStore
        .getState()
        .instances.find((item) => item.id === state.instanceId);
      const name = instance?.name ?? state.instanceId;

      if (state.state === 'crashed') {
        notifySystem(
          translate('Игра завершилась с ошибкой'),
          translate('Сборка «{name}»: код {code}', {
            name,
            code: state.exitCode ?? '—',
          }),
        );
      } else {
        notifySystem(
          translate('Игра завершилась'),
          translate('Сборка «{name}» закрыта', { name }),
        );
      }
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
