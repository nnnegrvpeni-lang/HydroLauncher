import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { isMockEnabled, mockInvoke } from './mock';

/**
 * Обёртка над invoke: в браузере (без Tauri) в dev-режиме
 * запросы обслуживает мок, чтобы можно было работать над UI.
 */
export async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (isMockEnabled()) {
    return mockInvoke<T>(command, args);
  }
  return tauriInvoke<T>(command, args);
}
