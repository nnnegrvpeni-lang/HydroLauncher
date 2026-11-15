import type { LauncherUpdateInfo } from '../api';

/**
 * Возвращает информацию об обновлении, если её стоит показывать:
 * обновление есть и пользователь не скрыл именно эту версию.
 */
export function visibleUpdate(
  info: LauncherUpdateInfo | null,
  dismissedVersion: string | null,
): LauncherUpdateInfo | null {
  if (!info || !info.updateAvailable) return null;
  if (dismissedVersion && dismissedVersion === info.latestVersion) return null;
  return info;
}
