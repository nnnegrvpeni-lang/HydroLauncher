import { describe, expect, it } from 'vitest';
import { formatBytes, formatDate, formatPlayTime } from './format';

describe('formatPlayTime', () => {
  it('formats Russian units', () => {
    expect(formatPlayTime(0, 'ru')).toBe('0 с');
    expect(formatPlayTime(90, 'ru')).toBe('1 мин');
    expect(formatPlayTime(3 * 3600 + 15 * 60, 'ru')).toBe('3 ч 15 мин');
  });

  it('formats English units', () => {
    expect(formatPlayTime(0, 'en')).toBe('0 s');
    expect(formatPlayTime(90, 'en')).toBe('1 min');
    expect(formatPlayTime(3 * 3600 + 15 * 60, 'en')).toBe('3 h 15 min');
  });
});

describe('formatBytes', () => {
  it('uses the requested language for units', () => {
    expect(formatBytes(1536, 'ru')).toBe('2 КБ');
    expect(formatBytes(1536, 'en')).toBe('2 KB');
    expect(formatBytes(5 * 1024 ** 2, 'en')).toBe('5.0 MB');
    expect(formatBytes(2 * 1024 ** 3, 'ru')).toBe('2.0 ГБ');
  });
});

describe('formatDate', () => {
  it('uses the requested locale', () => {
    const iso = '2026-11-15T00:00:00';
    expect(formatDate(iso, 'en')).toContain('11/15/2026');
    expect(formatDate(iso, 'ru')).toContain('15.11.2026');
    expect(formatDate(null)).toBe('—');
  });
});
