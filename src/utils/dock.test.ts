import { describe, expect, it } from 'vitest';
import type { Instance } from '../api';
import { DOCK_LIMIT, buildDockInstances, instanceActivityTime, pickRecent } from './dock';

function makeInstance(id: string, lastPlayedAt: string | null, createdAt: string): Instance {
  return {
    id,
    name: id,
    minecraftVersion: '1.21.4',
    engine: 'java',
    loader: 'vanilla',
    loaderVersion: null,
    autoUpdateHorizon: true,
    memoryMbOverride: null,
    javaPathOverride: null,
    jvmArgs: [],
    gameArgs: [],
    icon: 'grass_block',
    background: 'purple',
    createdAt,
    lastPlayedAt,
    playTimeSeconds: 0,
  };
}

const instances: Instance[] = [
  makeInstance('old', null, '2026-01-01T00:00:00.000Z'),
  makeInstance('recent', '2026-11-10T00:00:00.000Z', '2026-02-01T00:00:00.000Z'),
  makeInstance('middle', '2026-10-05T00:00:00.000Z', '2026-03-01T00:00:00.000Z'),
  makeInstance('fresh', null, '2026-09-01T00:00:00.000Z'),
  makeInstance('a', '2026-08-01T00:00:00.000Z', '2026-01-15T00:00:00.000Z'),
  makeInstance('b', '2026-07-01T00:00:00.000Z', '2026-01-15T00:00:00.000Z'),
  makeInstance('c', '2026-06-01T00:00:00.000Z', '2026-01-15T00:00:00.000Z'),
];

describe('instanceActivityTime', () => {
  it('uses lastPlayedAt when present', () => {
    expect(instanceActivityTime(instances[1])).toBe(Date.parse('2026-11-10T00:00:00.000Z'));
  });

  it('falls back to createdAt', () => {
    expect(instanceActivityTime(instances[0])).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
  });

  it('returns 0 for unparsable dates', () => {
    const broken = { ...instances[0], createdAt: 'not-a-date', lastPlayedAt: null };
    expect(instanceActivityTime(broken)).toBe(0);
  });
});

describe('buildDockInstances', () => {
  it('caps the dock and sorts by activity', () => {
    const dock = buildDockInstances(instances, null);
    expect(dock).toHaveLength(DOCK_LIMIT);
    expect(dock.map((i) => i.id)).toEqual(['recent', 'middle', 'fresh', 'a', 'b', 'c']);
  });

  it('keeps the selected instance visible even if it is outside the top', () => {
    const dock = buildDockInstances(instances, 'old');
    expect(dock).toHaveLength(DOCK_LIMIT);
    expect(dock[0].id).toBe('old');
    expect(dock.some((i) => i.id === 'c')).toBe(false);
  });

  it('does not duplicate the selected instance', () => {
    const dock = buildDockInstances(instances, 'recent');
    expect(dock).toHaveLength(DOCK_LIMIT);
    expect(dock.filter((i) => i.id === 'recent')).toHaveLength(1);
  });

  it('ignores unknown featured ids', () => {
    expect(buildDockInstances(instances, 'missing')).toHaveLength(DOCK_LIMIT);
  });

  it('handles empty and short lists', () => {
    expect(buildDockInstances([], null)).toEqual([]);
    const two = instances.slice(0, 2);
    expect(buildDockInstances(two, null)).toHaveLength(2);
  });
});

describe('pickRecent', () => {
  it('returns the most recently used instance', () => {
    expect(pickRecent(instances)?.id).toBe('recent');
  });

  it('returns null for an empty list', () => {
    expect(pickRecent([])).toBeNull();
  });
});
