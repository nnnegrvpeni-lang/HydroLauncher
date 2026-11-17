import { listen } from '@tauri-apps/api/event';
import { isMockEnabled } from './mock';
import type { DownloadJob, GameLog, GameState, LaunchProgress } from './types';

export const EVENTS = {
  launchProgress: 'launch://progress',
  launchLog: 'launch://log',
  launchState: 'launch://state',
  quitRequested: 'app://quit-requested',
  jobsUpdate: 'jobs://update',
} as const;

function safeListen<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  if (isMockEnabled()) {
    return Promise.resolve(() => {});
  }
  return listen<T>(event, (e) => handler(e.payload));
}

export const listenLaunchProgress = (handler: (payload: LaunchProgress) => void) =>
  safeListen<LaunchProgress>(EVENTS.launchProgress, handler);

export const listenLaunchLog = (handler: (payload: GameLog) => void) =>
  safeListen<GameLog>(EVENTS.launchLog, handler);

export const listenLaunchState = (handler: (payload: GameState) => void) =>
  safeListen<GameState>(EVENTS.launchState, handler);

export const listenQuitRequested = (handler: () => void) =>
  safeListen<null>(EVENTS.quitRequested, () => handler());

export const listenJobsUpdate = (handler: (job: DownloadJob) => void) =>
  safeListen<DownloadJob>(EVENTS.jobsUpdate, handler);

