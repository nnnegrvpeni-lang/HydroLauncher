/**
 * Чистые функции локализации без зависимости от React и сторов:
 * русский вариант — это сам текст, английский берётся из словаря.
 */
import { en } from './en';

export type Language = 'ru' | 'en';
export type TranslateParams = Record<string, string | number>;

export function translateIn(language: Language, text: string): string {
  if (language === 'ru') return text;
  return en[text] ?? text;
}

export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}
