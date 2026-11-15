import { describe, expect, it } from 'vitest';
import { localizeProgressMessage } from './progress';

describe('localizeProgressMessage', () => {
  it('uses the dictionary for static phrases', () => {
    expect(localizeProgressMessage('Клиент скачан', 'en')).toBe('Client downloaded');
    expect(localizeProgressMessage('Файлы готовы к запуску', 'en')).toBe(
      'Files are ready to launch',
    );
  });

  it('translates dynamic progress messages', () => {
    expect(localizeProgressMessage('Ассеты: 128 / 1024', 'en')).toBe('Assets: 128 / 1024');
    expect(localizeProgressMessage('Библиотеки: 7 / 40', 'en')).toBe('Libraries: 7 / 40');
    expect(localizeProgressMessage('Скачивание Java 21…', 'en')).toBe(
      'Downloading Java 21…',
    );
    expect(localizeProgressMessage('Java 21 готова', 'en')).toBe('Java 21 is ready');
    expect(localizeProgressMessage('Скачивание Horizon (nightly, 12.5 МБ)…', 'en')).toBe(
      'Downloading Horizon (nightly, 12.5 MB)…',
    );
    expect(localizeProgressMessage('Скачивание установщика Forge…', 'en')).toBe(
      'Downloading the Forge installer…',
    );
    expect(
      localizeProgressMessage('Установка Fabric (это может занять минуту)…', 'en'),
    ).toBe('Installing Fabric (this may take a minute)…');
    expect(localizeProgressMessage('Библиотеки Forge (3/10)…', 'en')).toBe(
      'Forge libraries (3/10)…',
    );
    expect(localizeProgressMessage('Forge готов', 'en')).toBe('Forge is ready');
  });

  it('keeps Russian and unknown messages untouched', () => {
    expect(localizeProgressMessage('Ассеты: 1 / 2', 'ru')).toBe('Ассеты: 1 / 2');
    expect(localizeProgressMessage('External engine message', 'en')).toBe(
      'External engine message',
    );
  });
});
