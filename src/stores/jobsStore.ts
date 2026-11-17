import { create } from 'zustand';
import { api, listenJobsUpdate, type DownloadJob, type JobStatus } from '../api';
import { useEffectSync } from './useEffectSync';
import { useNotifyStore } from './notifyStore';

export const ACTIVE_JOB_STATUSES: JobStatus[] = [
  'queued',
  'running',
  'paused',
  'canceling',
];

export function isJobActive(status: JobStatus): boolean {
  return ACTIVE_JOB_STATUSES.includes(status);
}

interface JobsState {
  jobs: DownloadJob[];
  loaded: boolean;
  load: () => Promise<void>;
  upsert: (job: DownloadJob) => void;
  pause: (jobId: string) => Promise<void>;
  resume: (jobId: string) => Promise<void>;
  cancel: (jobId: string) => Promise<void>;
  dismiss: (jobId: string) => Promise<void>;
  retry: (job: DownloadJob) => Promise<void>;
}

function sortJobs(jobs: DownloadJob[]): DownloadJob[] {
  return [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const useJobsStore = create<JobsState>((set, get) => ({
  jobs: [],
  loaded: false,

  load: async () => {
    try {
      const jobs = await api.listJobs();
      set({ jobs: sortJobs(jobs), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  upsert: (job) =>
    set((state) => {
      const index = state.jobs.findIndex((item) => item.id === job.id);
      if (index === -1) return { jobs: sortJobs([job, ...state.jobs]) };
      const jobs = [...state.jobs];
      jobs[index] = job;
      return { jobs };
    }),

  pause: async (jobId) => {
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === jobId
          ? { ...job, status: 'paused', message: 'На паузе', updatedAt: new Date().toISOString() }
          : job,
      ),
    }));
    try {
      await api.pauseJob(jobId);
    } catch (err) {
      useNotifyStore.getState().push(String(err), 'error');
      void get().load();
    }
  },

  resume: async (jobId) => {
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              status: 'running',
              message: 'Продолжение…',
              updatedAt: new Date().toISOString(),
            }
          : job,
      ),
    }));
    try {
      await api.resumeJob(jobId);
    } catch (err) {
      useNotifyStore.getState().push(String(err), 'error');
      void get().load();
    }
  },

  cancel: async (jobId) => {
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === jobId
          ? { ...job, status: 'canceling', message: 'Отмена…', updatedAt: new Date().toISOString() }
          : job,
      ),
    }));
    try {
      await api.cancelJob(jobId);
    } catch (err) {
      useNotifyStore.getState().push(String(err), 'error');
      void get().load();
    }
  },

  dismiss: async (jobId) => {
    set((state) => ({ jobs: state.jobs.filter((job) => job.id !== jobId) }));
    try {
      await api.dismissJob(jobId);
    } catch {
      // Задача останется на диске, но из интерфейса уже убрана.
    }
  },

  retry: async (job) => {
    if (!job.retry) return;
    // Старая запись больше не нужна: новая появится по событию из бэкенда.
    void get().dismiss(job.id);
    try {
      await api.retryJob(job);
    } catch (err) {
      const text = String(err);
      if (!text.includes('отменена')) {
        useNotifyStore.getState().push(text, 'error');
      }
    }
  },
}));

export function useInitJobs() {
  useEffectSync(() => {
    void useJobsStore.getState().load();
    const unlisten = listenJobsUpdate((job) => useJobsStore.getState().upsert(job));
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);
}
