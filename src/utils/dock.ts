import type { Instance } from '../api';

/** Сколько карточек сборок помещается в нижний док на главной. */
export const DOCK_LIMIT = 6;

/** Время последней активности сборки: `lastPlayedAt`, иначе `createdAt`. */
export function instanceActivityTime(instance: Instance): number {
  const stamp = instance.lastPlayedAt ?? instance.createdAt;
  const parsed = stamp ? Date.parse(stamp) : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Сортирует сборки по убыванию активности (для дока и выбора активной сборки). */
export function sortByActivity(instances: Instance[]): Instance[] {
  return [...instances].sort((a, b) => instanceActivityTime(b) - instanceActivityTime(a));
}

export function pickRecent(instances: Instance[]): Instance | null {
  return sortByActivity(instances)[0] ?? null;
}

/**
 * Список карточек для дока: не больше `limit` штук, выбранная сборка всегда видна.
 */
export function buildDockInstances(
  instances: Instance[],
  featuredId: string | null,
  limit: number = DOCK_LIMIT,
): Instance[] {
  const ordered = sortByActivity(instances);
  const visible = ordered.slice(0, limit);
  if (!featuredId || visible.some((inst) => inst.id === featuredId)) {
    return visible;
  }
  const featured = ordered.find((inst) => inst.id === featuredId);
  if (!featured) return visible;
  return [featured, ...ordered.filter((inst) => inst.id !== featuredId).slice(0, limit - 1)];
}
