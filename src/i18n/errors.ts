import { translateIn, type Language } from './translate';

const PREFIXES: Array<[string, string]> = [
  ['Ошибка ввода-вывода: ', 'I/O error: '],
  ['Сетевая ошибка: ', 'Network error: '],
  ['Ошибка разбора JSON: ', 'JSON parse error: '],
  ['Ошибка архивации: ', 'Archive error: '],
  ['Ошибка валидации: ', 'Validation error: '],
  ['Не найдено: ', 'Not found: '],
  ['Ошибка процесса: ', 'Process error: '],
  ['Несовместимость или отсутствие Java: ', 'Java is missing or incompatible: '],
];

/** Переводит типовые ошибки бэкенда; неизвестные оставляет на русском. */
export function localizeError(message: string, language: Language): string {
  if (language === 'ru') return message;

  const direct = translateIn(language, message);
  if (direct !== message) return direct;

  for (const [prefix, translated] of PREFIXES) {
    if (message.startsWith(prefix)) {
      return translated + translateIn(language, message.slice(prefix.length));
    }
  }
  return message;
}
