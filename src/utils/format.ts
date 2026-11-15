import type { Language } from '../i18n/translate';

export function formatPlayTime(seconds: number, language: Language = 'ru'): string {
  if (seconds < 60) {
    return language === 'en' ? `${seconds} s` : `${seconds} с`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return language === 'en' ? `${minutes} min` : `${minutes} мин`;
  }
  const hours = Math.floor(minutes / 60);
  return language === 'en'
    ? `${hours} h ${minutes % 60} min`
    : `${hours} ч ${minutes % 60} мин`;
}

export function formatMemory(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

export function formatDate(iso: string | null, language: Language = 'ru'): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleString(language === 'en' ? 'en-US' : 'ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatLoaderLabel(loader: string): string {
  switch (loader) {
    case 'vanilla':
      return 'Vanilla';
    case 'fabric':
      return 'Fabric';
    case 'forge':
      return 'Forge';
    case 'neoforge':
      return 'NeoForge';
    case 'quilt':
      return 'Quilt';
    default:
      return loader;
  }
}

export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

export function formatBytes(bytes: number, language: Language = 'ru'): string {
  const units =
    language === 'en'
      ? { gb: 'GB', mb: 'MB', kb: 'KB' }
      : { gb: 'ГБ', mb: 'МБ', kb: 'КБ' };

  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} ${units.gb}`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} ${units.mb}`;
  if (bytes <= 0) return `0 ${units.kb}`;
  return `${Math.max(1, Math.round(bytes / 1024))} ${units.kb}`;
}
