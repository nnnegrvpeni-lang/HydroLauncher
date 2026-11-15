import { describe, expect, it } from 'vitest';
import { localizeError } from './errors';

describe('localizeError', () => {
  it('translates exact backend messages', () => {
    expect(localizeError('Сборка не найдена', 'en')).toBe('Instance not found');
    expect(localizeError('Остановите игру перед этим действием', 'en')).toBe(
      'Stop the game before doing this',
    );
  });

  it('translates known Rust error prefixes', () => {
    expect(localizeError('Не найдено: Сборка не найдена', 'en')).toBe(
      'Not found: Instance not found',
    );
    expect(localizeError('Сетевая ошибка: timed out', 'en')).toBe(
      'Network error: timed out',
    );
    expect(localizeError('Ошибка процесса: exit code 1', 'en')).toBe(
      'Process error: exit code 1',
    );
  });

  it('keeps Russian and unknown errors', () => {
    expect(localizeError('Сборка не найдена', 'ru')).toBe('Сборка не найдена');
    expect(localizeError('Какая-то новая ошибка', 'en')).toBe('Какая-то новая ошибка');
  });
});
