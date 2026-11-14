import { create } from 'zustand';
import { api, type AccountsStore, type OfflineAccount } from '../api';
import { useEffectSync } from './useEffectSync';
interface AccountsState {
  store: AccountsStore | null;
  activeAccount: OfflineAccount | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  create: (username: string) => Promise<void>;
  setActive: (id: string) => Promise<void>;
  rename: (id: string, username: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refreshActive: () => Promise<void>;
}

export const useAccountsStore = create<AccountsState>((set, get) => ({
  store: null,
  activeAccount: null,
  loading: true,
  error: null,

  load: async () => {
    try {
      const store = await api.getAccounts();
      const activeAccount = store.accounts.find(
        (a) => a.id === (store.activeAccountId ?? store.accounts[0]?.id),
      ) ?? null;
      set({ store, activeAccount, loading: false, error: null });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  create: async (username) => {
    const store = await api.createAccount(username);
    const activeAccount =
      store.accounts.find((a) => a.id === store.activeAccountId) ?? null;
    set({ store, activeAccount });
  },

  setActive: async (id) => {
    const store = await api.setActiveAccount(id);
    const activeAccount = store.accounts.find((a) => a.id === store.activeAccountId) ?? null;
    set({ store, activeAccount });
  },

  rename: async (id, username) => {
    const store = await api.renameAccount(id, username);
    const activeAccount =
      store.accounts.find((a) => a.id === (store.activeAccountId ?? store.accounts[0]?.id)) ?? null;
    set({ store, activeAccount });
  },

  remove: async (id) => {
    const store = await api.deleteAccount(id);
    const activeAccount =
      store.accounts.find((a) => a.id === (store.activeAccountId ?? store.accounts[0]?.id)) ?? null;
    set({ store, activeAccount });
  },

  refreshActive: async () => {
    const active = await api.getActiveAccount();
    set({ activeAccount: active });
    void get().load();
  },
}));

export function useInitAccounts() {
  useEffectSync(() => {
    void useAccountsStore.getState().load();
  }, []);
}
