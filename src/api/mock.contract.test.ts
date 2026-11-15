import { describe, expect, it } from 'vitest';
import typesSource from '../api/types.ts?raw';
import mockSource from '../api/mock.ts?raw';

/**
 * Контракт между фронтендом и мок-API: каждая команда, которую вызывает
 * `src/api/types.ts`, обязана иметь обработчик в `src/api/mock.ts`.
 * Иначе в браузерном dev-режиме соответствующее место падает.
 */
function readCommands(source: string): string[] {
  return [...source.matchAll(/invoke<[^>]*>\('([a-z_]+)'/g)].map((match) => match[1]);
}

function readMockCases(source: string): Set<string> {
  return new Set([...source.matchAll(/case '([a-z_]+)'/g)].map((match) => match[1]));
}

describe('mock API contract', () => {
  it('finds api commands in types.ts', () => {
    expect(readCommands(typesSource).length).toBeGreaterThan(50);
  });

  it('handles every api command in the mock', () => {
    const cases = readMockCases(mockSource);
    const missing = readCommands(typesSource).filter((command) => !cases.has(command));
    expect(missing).toEqual([]);
  });
});
