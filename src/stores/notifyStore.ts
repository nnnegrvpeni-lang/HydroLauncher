import { create } from 'zustand';

export type NoticeTone = 'success' | 'error';

export interface Notice {
  id: number;
  message: string;
  tone: NoticeTone;
}

interface NotifyState {
  notices: Notice[];
  push: (message: string, tone?: NoticeTone) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

/** Короткие уведомления о результате действий (копирование, бэкап, экспорт). */
export const useNotifyStore = create<NotifyState>((set, get) => ({
  notices: [],

  push: (message, tone = 'success') => {
    const id = nextId++;
    const notices = [...get().notices, { id, message, tone }].slice(-3);
    set({ notices });
    window.setTimeout(() => get().dismiss(id), 4200);
  },

  dismiss: (id) =>
    set((state) => ({ notices: state.notices.filter((notice) => notice.id !== id) })),
}));
