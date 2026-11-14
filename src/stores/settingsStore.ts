import { create } from 'zustand';
import { api, type AppSettings, type SystemInfo, type ThemeMode } from '../api';
import { useEffectSync } from './useEffectSync';

interface SettingsState {
  settings: AppSettings | null;
  systemInfo: SystemInfo | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  save: (settings: AppSettings) => Promise<void>;
  applyTheme: (mode: ThemeMode) => void;
}

function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  systemInfo: null,
  loading: true,
  error: null,

  load: async () => {
    try {
      const [settings, systemInfo] = await Promise.all([
        api.getSettings(),
        api.getSystemInfo(),
      ]);
      set({ settings, systemInfo, loading: false, error: null });
      get().applyTheme(settings.theme);
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  save: async (settings) => {
    const saved = await api.saveSettings(settings);
    set({ settings: saved });
    get().applyTheme(saved.theme);
  },

  applyTheme: (mode) => {
    const theme = resolveTheme(mode);
    document.documentElement.dataset.theme = theme;
  },
}));

export function useInitSettings() {
  useEffectSync(() => {
    void useSettingsStore.getState().load();
  }, []);
}
