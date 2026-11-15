import { create } from 'zustand';
import { api, type LauncherUpdateInfo } from '../api';
import { useEffectSync } from './useEffectSync';

const DISMISSED_KEY = 'hydro.update.dismissedVersion';

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

interface UpdateState {
  info: LauncherUpdateInfo | null;
  loading: boolean;
  dismissedVersion: string | null;
  check: () => Promise<void>;
  dismiss: (version: string) => void;
  resetDismiss: () => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  info: null,
  loading: false,
  dismissedVersion: readDismissed(),

  check: async () => {
    set({ loading: true });
    try {
      const info = await api.checkLauncherUpdate();
      set({ info, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  dismiss: (version) => {
    try {
      localStorage.setItem(DISMISSED_KEY, version);
    } catch {
      // localStorage может быть недоступен — уведомление просто не запомнится
    }
    set({ dismissedVersion: version });
  },

  resetDismiss: () => {
    try {
      localStorage.removeItem(DISMISSED_KEY);
    } catch {
      // ignore
    }
    set({ dismissedVersion: null });
  },
}));

export function useInitLauncherUpdate() {
  useEffectSync(() => {
    void useUpdateStore.getState().check();
  }, []);
}

/** Возвращает информацию об обновлении, если её стоит показывать. */
export function useLauncherUpdate(): LauncherUpdateInfo | null {
  const info = useUpdateStore((s) => s.info);
  const dismissed = useUpdateStore((s) => s.dismissedVersion);
  if (!info?.updateAvailable) return null;
  if (dismissed === info.latestVersion) return null;
  return info;
}
