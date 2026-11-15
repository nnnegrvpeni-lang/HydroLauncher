import { useCallback } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { interpolate, translateIn, type Language, type TranslateParams } from './translate';

export { translateIn, interpolate };
export type { Language, TranslateParams };

export const LANGUAGE_OPTIONS: Array<{ value: Language; label: string }> = [
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
];

function currentLanguage(): Language {
  return useSettingsStore.getState().settings?.language === 'en' ? 'en' : 'ru';
}

/** Перевод без хука — для сторов и обработчиков вне React. */
export function translate(text: string, params?: TranslateParams): string {
  return interpolate(translateIn(currentLanguage(), text), params);
}

export function useI18n() {
  const language: Language = useSettingsStore((s) =>
    s.settings?.language === 'en' ? 'en' : 'ru',
  );

  const t = useCallback((text: string) => translateIn(language, text), [language]);
  const tf = useCallback(
    (text: string, params?: TranslateParams) =>
      interpolate(translateIn(language, text), params),
    [language],
  );

  return { t, tf, language };
}
