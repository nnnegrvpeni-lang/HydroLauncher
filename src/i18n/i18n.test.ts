import { describe, expect, it } from 'vitest';
import { en } from './en';
import { translateIn } from './translate';

describe('i18n', () => {
  it('returns the requested language', () => {
    expect(translateIn('ru', 'Настройки')).toBe('Настройки');
    expect(translateIn('en', 'Настройки')).toBe('Settings');
  });

  it('falls back to Russian for unknown phrases', () => {
    expect(translateIn('en', 'Фраза, которой нет в словаре')).toBe(
      'Фраза, которой нет в словаре',
    );
  });

  it('has no empty translations', () => {
    for (const [phrase, translation] of Object.entries(en)) {
      expect(phrase.trim().length, phrase).toBeGreaterThan(0);
      expect(translation.trim().length, phrase).toBeGreaterThan(0);
    }
  });

  it('keeps placeholders from the source phrase', () => {
    for (const [phrase, translation] of Object.entries(en)) {
      const placeholders = (text: string) =>
        [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      expect(placeholders(translation), phrase).toEqual(placeholders(phrase));
    }
  });

  it('covers the main navigation and language switcher', () => {
    for (const phrase of ['Обзор', 'Сборки', 'Моды', 'Настройки', 'Язык интерфейса']) {
      expect(translateIn('en', phrase), phrase).not.toBe(phrase);
    }
  });
});
