/**
 * Разбор и сборка строк аргументов JVM и игры.
 *
 * Настройки хранят аргументы по отдельности, а в интерфейсе они вводятся
 * одной строкой. Наивный split по пробелам ломает пути с пробелами и
 * кавычки, поэтому строка разбирается с учётом кавычек.
 */

/** Разбирает строку на аргументы. Кавычки убираются, пробелы внутри них
 *  сохраняются. Обратная косая черта экранирует `"` и `\` только внутри
 *  двойных кавычек: в путях Windows она остаётся разделителем. */
export function splitArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let started = false;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quote === '"') {
      if (char === '\\' && i + 1 < input.length) {
        const next = input[i + 1];
        if (next === '"' || next === '\\') {
          current += next;
          i += 1;
          continue;
        }
      }
      if (char === '"') {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }

    if (quote === "'") {
      if (char === "'") {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (started) {
        args.push(current);
        current = '';
        started = false;
      }
      continue;
    }

    current += char;
    started = true;
  }

  // Незакрытая кавычка не должна терять остаток строки.
  if (started) args.push(current);
  return args;
}

function quoteArg(arg: string): string {
  if (arg !== '' && !/[\s"']/.test(arg)) return arg;
  return `"${arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Собирает аргументы в строку, добавляя кавычки только там, где это нужно. */
export function formatArgs(args: readonly string[]): string {
  return args.map(quoteArg).join(' ');
}
