import { translateIn, type Language } from './translate';

/**
 * Динамические сообщения прогресса приходят с бэкенда уже собранными.
 * Для английского переводим их по шаблонам, статические фразы берём из словаря.
 */
const RULES: Array<{ pattern: RegExp; render: (match: RegExpMatchArray) => string }> = [
  {
    pattern: /^Ассеты: (\d+) \/ (\d+)$/,
    render: (m) => `Assets: ${m[1]} / ${m[2]}`,
  },
  {
    pattern: /^Библиотеки: (\d+) \/ (\d+)$/,
    render: (m) => `Libraries: ${m[1]} / ${m[2]}`,
  },
  {
    pattern: /^Скачивание Java (\d+)…$/,
    render: (m) => `Downloading Java ${m[1]}…`,
  },
  {
    pattern: /^Java (\d+) готова$/,
    render: (m) => `Java ${m[1]} is ready`,
  },
  {
    pattern: /^Скачивание Horizon \((.+), ([\d.]+) МБ\)…$/,
    render: (m) => `Downloading Horizon (${m[1]}, ${m[2]} MB)…`,
  },
  {
    pattern: /^Скачивание установщика (.+)…$/,
    render: (m) => `Downloading the ${m[1]} installer…`,
  },
  {
    pattern: /^Установка (.+) \(это может занять минуту\)…$/,
    render: (m) => `Installing ${m[1]} (this may take a minute)…`,
  },
  {
    pattern: /^Библиотеки (.+) \((\d+)\/(\d+)\)…$/,
    render: (m) => `${m[1]} libraries (${m[2]}/${m[3]})…`,
  },
  {
    pattern: /^(.+) готов$/,
    render: (m) => `${m[1]} is ready`,
  },
  {
    pattern: /^Резервная копия мира «(.+)»…$/,
    render: (m) => `Backing up world “${m[1]}”…`,
  },
  {
    pattern: /^Экспорт сборки: (.+)$/,
    render: (m) => `Exporting instance: ${m[1]}`,
  },
  {
    pattern: /^Подготовка «(.+)»$/,
    render: (m) => `Preparing “${m[1]}”`,
  },
  {
    pattern: /^Мод для «(.+)»$/,
    render: (m) => `Mod for “${m[1]}”`,
  },
  {
    pattern: /^Мод Horizon для «(.+)»$/,
    render: (m) => `Horizon mod for “${m[1]}”`,
  },
  {
    pattern: /^Импорт (.+)$/,
    render: (m) => `Import ${m[1]}`,
  },
  {
    pattern: /^Скачивание (.+)…$/,
    render: (m) => `Downloading ${m[1]}…`,
  },
];

export function localizeProgressMessage(message: string, language: Language): string {
  if (language === 'ru') return message;

  const direct = translateIn(language, message);
  if (direct !== message) return direct;

  for (const rule of RULES) {
    const match = message.match(rule.pattern);
    if (match) return rule.render(match);
  }

  return message;
}
