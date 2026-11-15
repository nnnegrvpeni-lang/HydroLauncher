import { create } from 'zustand';
import {
  listenLaunchLog,
  listenLaunchProgress,
  listenLaunchState,
  type GameLog,
  type LaunchProgress,
} from '../api';
import type { CrashInfo } from '../utils/crash';
import { useEffectSync } from './useEffectSync';

interface LaunchState {
  progress: LaunchProgress | null;
  logsByInstance: Record<string, GameLog[]>;
  lastCrash: CrashInfo | null;
  setProgress: (p: LaunchProgress) => void;
  clearProgress: (instanceId: string) => void;
  appendLog: (log: GameLog) => void;
  clearLogs: (instanceId: string) => void;
  clearCrash: () => void;
}

const MAX_LOG_LINES = 500;

export const useLaunchStore = create<LaunchState>((set) => ({
  progress: null,
  logsByInstance: {},
  lastCrash: null,

  setProgress: (p) => {
    set({ progress: p });
    if (p.stage === 'done' || p.percent >= 100) {
      window.setTimeout(() => {
        useLaunchStore.setState((state) =>
          state.progress === p ? { progress: null } : state,
        );
      }, 2500);
    }
  },

  clearProgress: (instanceId) =>
    set((state) =>
      state.progress?.instanceId === instanceId ? { progress: null } : state,
    ),

  appendLog: (log) =>
    set((state) => {
      const prev = state.logsByInstance[log.instanceId] ?? [];
      const next = [...prev, log].slice(-MAX_LOG_LINES);
      return {
        logsByInstance: {
          ...state.logsByInstance,
          [log.instanceId]: next,
        },
      };
    }),

  clearLogs: (instanceId) =>
    set((state) => {
      if (!state.logsByInstance[instanceId]) return state;
      const next = { ...state.logsByInstance };
      delete next[instanceId];
      return { logsByInstance: next };
    }),

  clearCrash: () => set({ lastCrash: null }),
}));

export function useInitLaunchListeners() {
  useEffectSync(() => {
    const unlisteners = [
      listenLaunchProgress((p) => useLaunchStore.getState().setProgress(p)),
      listenLaunchLog((log) => useLaunchStore.getState().appendLog(log)),
      listenLaunchState(({ instanceId, state, exitCode }) => {
        if (state === 'running' || state === 'exited' || state === 'crashed') {
          useLaunchStore.getState().clearProgress(instanceId);
        }
        if (state === 'crashed') {
          useLaunchStore.setState({
            lastCrash: { instanceId, exitCode, at: Date.now() },
          });
        }
      }),
    ];
    return () => {
      for (const promise of unlisteners) {
        void promise.then((fn) => fn());
      }
    };
  }, []);
}
