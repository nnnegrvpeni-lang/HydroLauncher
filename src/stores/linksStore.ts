import { create } from 'zustand';
import { api, type AppLinks } from '../api';
import { useEffectSync } from './useEffectSync';

interface LinksState {
  links: AppLinks | null;
  load: () => Promise<void>;
}

export const useLinksStore = create<LinksState>((set) => ({
  links: null,
  load: async () => {
    try {
      set({ links: await api.getAppLinks() });
    } catch {
      // ссылки нужны только для кнопки «Открыть на …», без них интерфейс работает
    }
  },
}));

export function useInitLinks() {
  useEffectSync(() => {
    void useLinksStore.getState().load();
  }, []);
}
