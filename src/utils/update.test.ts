import { describe, expect, it } from 'vitest';
import type { LauncherUpdateInfo } from '../api';
import { visibleUpdate } from './update';

const info: LauncherUpdateInfo = {
  currentVersion: '0.1.1',
  latestVersion: '0.2.0',
  updateAvailable: true,
  releaseUrl: 'https://example.com/release',
  publishedAt: '2026-11-15T00:00:00.000Z',
};

describe('visibleUpdate', () => {
  it('returns the update when nothing is dismissed', () => {
    expect(visibleUpdate(info, null)).toEqual(info);
  });

  it('hides the exact dismissed version', () => {
    expect(visibleUpdate(info, '0.2.0')).toBeNull();
  });

  it('shows the update again for a newer version', () => {
    expect(visibleUpdate({ ...info, latestVersion: '0.3.0' }, '0.2.0')).not.toBeNull();
  });

  it('ignores missing info and updates that are not available', () => {
    expect(visibleUpdate(null, null)).toBeNull();
    expect(visibleUpdate({ ...info, updateAvailable: false }, null)).toBeNull();
  });
});
