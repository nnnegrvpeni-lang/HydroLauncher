import { create } from 'zustand';
import { api, listenLaunchState, type GameState, type Instance, type QuickPlayTarget } from '../api';
import { useLaunchStore } from './launchStore';
import { useEffectSync } from './useEffectSync';

type RuntimeState = GameState['state'] | 'idle';

interface InstancesState {
  instances: Instance[];
  running: Map<string, RuntimeState>;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  create: (req: {
    name: string;
    minecraftVersion: string;
    engine: 'java' | 'horizon';
    loader: 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt';
    loaderVersion?: string | null;
  }) => Promise<Instance>;
  remove: (id: string) => Promise<void>;
  update: (id: string, patch: Partial<Instance>) => Promise<void>;
  launch: (id: string, quickPlay?: QuickPlayTarget) => Promise<void>;
  terminate: (id: string) => Promise<void>;
  clearError: () => void;
  handleState: (state: GameState) => void;
}

export const useInstancesStore = create<InstancesState>((set, get) => ({
  instances: [],
  running: new Map(),
  loading: true,
  error: null,

  clearError: () => set({ error: null }),

  load: async () => {
    try {
      const [instances, runningIds] = await Promise.all([
        api.getInstances(),
        api.getRunningInstances(),
      ]);
      const running = new Map<string, RuntimeState>();
      for (const id of runningIds) running.set(id, 'running');
      set({ instances, running, loading: false, error: null });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  create: async (req) => {
    const created = await api.createInstance(req);
    const running = new Map(get().running);
    running.set(created.id, 'preparing');
    set({ instances: [...get().instances, created], running });

    // Сразу после создания скачиваем клиент, библиотеки, ассеты и Java в фоне
    void api.prepareInstance(created.id).catch((err) => {
      const next = new Map(get().running);
      next.delete(created.id);
      set({ running: next, error: String(err) });
    });

    return created;
  },

  remove: async (id) => {
    await api.deleteInstance(id);
    const running = new Map(get().running);
    running.delete(id);
    set({ instances: get().instances.filter((i) => i.id !== id), running });
  },

  update: async (id, patch) => {
    const current = get().instances.find((i) => i.id === id);
    if (!current) return;
    const updated = await api.updateInstance({
      id,
      name: patch.name ?? current.name,
      memoryMbOverride: patch.memoryMbOverride ?? current.memoryMbOverride,
      javaPathOverride: patch.javaPathOverride ?? current.javaPathOverride,
      jvmArgs: patch.jvmArgs ?? current.jvmArgs,
      loaderVersion:
        patch.loaderVersion !== undefined ? patch.loaderVersion : current.loaderVersion,
    });
    set({
      instances: get().instances.map((i) => (i.id === id ? updated : i)),
    });
  },

  launch: async (id, quickPlay) => {
    useLaunchStore.getState().clearLogs(id);
    const running = new Map(get().running);
    running.set(id, 'preparing');
    set({ running });
    try {
      await api.launchInstance(id, quickPlay);
    } catch (err) {
      running.set(id, 'idle');
      set({ running, error: String(err) });
      throw err;
    }
  },

  terminate: async (id) => {
    await api.terminateInstance(id);
  },

  handleState: (state) => {
    const running = new Map(get().running);
    if (state.state === 'exited' || state.state === 'crashed') {
      running.delete(state.instanceId);
    } else {
      running.set(state.instanceId, state.state);
    }
    set({ running });
  },
}));

export function useInitInstances() {
  useEffectSync(() => {
    void useInstancesStore.getState().load();
    const unlisten = listenLaunchState((state) =>
      useInstancesStore.getState().handleState(state),
    );
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);
}
