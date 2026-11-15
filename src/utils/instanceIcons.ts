/**
 * Каталог оформления сборок: фон + предмет.
 *
 * Картинки предметов — иллюстрации Modrinth из `public/instance-icons`
 * (GPL-3.0, см. THIRD_PARTY_NOTICES.md). Фоны — обычные CSS-градиенты,
 * поэтому в сборке хранятся только строковые ID, без файлов.
 */

import type { CSSProperties } from 'react';

export type InstanceSymbolCategory = 'loader' | 'modded' | 'vanilla';

export interface InstanceBackgroundOption {
  id: string;
  label: string;
  top: string;
  bottom: string;
}

export interface InstanceSymbolOption {
  id: string;
  label: string;
  category: InstanceSymbolCategory;
}

export const INSTANCE_ICON_BASE = '/instance-icons';

export const INSTANCE_BACKGROUNDS: readonly InstanceBackgroundOption[] = [
  { id: 'rose', label: 'Алый', top: '#D62E63', bottom: '#F95C62' },
  { id: 'orange', label: 'Оранжевый', top: '#FF8D29', bottom: '#FFB452' },
  { id: 'yellow', label: 'Жёлтый', top: '#FFC629', bottom: '#FFEE53' },
  { id: 'lime', label: 'Лаймовый', top: '#6FDA1D', bottom: '#CBFF50' },
  { id: 'green', label: 'Зелёный', top: '#0B9F21', bottom: '#4FD24B' },
  { id: 'purple', label: 'Фиолетовый', top: '#4739FF', bottom: '#6670FF' },
  { id: 'blue', label: 'Синий', top: '#227EFF', bottom: '#5EC1FF' },
  { id: 'lavender', label: 'Лавандовый', top: '#C056FD', bottom: '#B889FF' },
  { id: 'pink', label: 'Розовый', top: '#F640C0', bottom: '#FF7BF1' },
  { id: 'light_gray', label: 'Светло-серый', top: '#AEAEAE', bottom: '#D9D9D9' },
  { id: 'gray', label: 'Серый', top: '#373C4C', bottom: '#4C4F58' },
  { id: 'dark_gray', label: 'Тёмно-серый', top: '#1B1D29', bottom: '#252731' },
];

export const INSTANCE_SYMBOLS: readonly InstanceSymbolOption[] = [
  // Модлоадеры
  { id: 'fabric', label: 'Fabric', category: 'loader' },
  { id: 'forge', label: 'Forge', category: 'loader' },
  { id: 'neoforge', label: 'NeoForge', category: 'loader' },
  { id: 'quilt', label: 'Quilt', category: 'loader' },

  // Предметы из модов
  { id: 'poke_ball', label: 'Покебол', category: 'modded' },
  { id: 'orb', label: 'Сфера', category: 'modded' },
  { id: 'cooking_pot', label: 'Котелок', category: 'modded' },
  { id: 'skillet', label: 'Сковорода', category: 'modded' },
  { id: 'globe', label: 'Глобус', category: 'modded' },
  { id: 'pancakes', label: 'Блины', category: 'modded' },
  { id: 'backpack', label: 'Рюкзак', category: 'modded' },
  { id: 'couch', label: 'Диван', category: 'modded' },
  { id: 'tiny_potato', label: 'Картофелина', category: 'modded' },
  { id: 'blue_shark', label: 'Акула', category: 'modded' },
  { id: 'brown_bear', label: 'Медведь', category: 'modded' },
  { id: 'moobloom', label: 'Муу-цветок', category: 'modded' },
  { id: 'create_wrench', label: 'Гаечный ключ', category: 'modded' },
  { id: 'cogwheel', label: 'Шестерёнка', category: 'modded' },
  { id: 'engine', label: 'Двигатель', category: 'modded' },
  { id: 'tire', label: 'Шина', category: 'modded' },
  { id: 'oxygen_distributor', label: 'Кислородный модуль', category: 'modded' },
  { id: 'space_helmet', label: 'Шлем', category: 'modded' },
  { id: 'gizmo', label: 'Прибор', category: 'modded' },
  { id: 'terminal', label: 'Терминал', category: 'modded' },
  { id: 'mr_pack', label: 'Модпак', category: 'modded' },

  // Базовый мир
  { id: 'grass_block', label: 'Блок травы', category: 'vanilla' },
  { id: 'crafting_table', label: 'Верстак', category: 'vanilla' },
  { id: 'furnace', label: 'Печь', category: 'vanilla' },
  { id: 'chest', label: 'Сундук', category: 'vanilla' },
  { id: 'bookshelf', label: 'Книжная полка', category: 'vanilla' },
  { id: 'redstone_block', label: 'Блок редстоуна', category: 'vanilla' },
  { id: 'sticky_piston', label: 'Липкий поршень', category: 'vanilla' },
  { id: 'slime_block', label: 'Блок слизи', category: 'vanilla' },
  { id: 'cake', label: 'Торт', category: 'vanilla' },
  { id: 'campfire', label: 'Костёр', category: 'vanilla' },
  { id: 'pickaxe', label: 'Кирка', category: 'vanilla' },
  { id: 'sword', label: 'Меч', category: 'vanilla' },
  { id: 'zombie', label: 'Зомби', category: 'vanilla' },
  { id: 'creeper', label: 'Крипер', category: 'vanilla' },
  { id: 'skeleton', label: 'Скелет', category: 'vanilla' },
  { id: 'ender_dragon', label: 'Дракон Края', category: 'vanilla' },
  { id: 'ender_chest', label: 'Эндер-сундук', category: 'vanilla' },
  { id: 'sculk_sensor', label: 'Скалк-сенсор', category: 'vanilla' },
  { id: 'beacon', label: 'Маяк', category: 'vanilla' },
  { id: 'enchanting_table', label: 'Стол зачарований', category: 'vanilla' },
  { id: 'lantern', label: 'Фонарь', category: 'vanilla' },
  { id: 'tnt', label: 'ТНТ', category: 'vanilla' },
  { id: 'command_block', label: 'Командный блок', category: 'vanilla' },
];

export const DEFAULT_INSTANCE_ICON = 'grass_block';
export const DEFAULT_INSTANCE_BACKGROUND = 'purple';

const BACKGROUND_BY_ID = new Map(INSTANCE_BACKGROUNDS.map((item) => [item.id, item]));
const SYMBOL_BY_ID = new Map(INSTANCE_SYMBOLS.map((item) => [item.id, item]));

/** Сочетания, которые Modrinth исключает из случайного выбора (сливаются по цвету). */
const RANDOM_BLACKLIST = new Set([
  'purple|globe',
  'blue|globe',
  'gray|cogwheel',
  'dark_gray|cogwheel',
  'rose|poke_ball',
  'lime|slime_block',
  'green|slime_block',
  'rose|redstone_block',
  'rose|couch',
  'orange|space_helmet',
  'rose|tnt',
  'yellow|moobloom',
  'green|mr_pack',
  'lime|mr_pack',
  'light_gray|skillet',
  'light_gray|cooking_pot',
]);

const RANDOM_SYMBOLS = INSTANCE_SYMBOLS.filter((item) => item.category !== 'loader');

export interface InstanceIconConfig {
  icon: string;
  background: string;
}

export function instanceIconAsset(icon: string): string {
  return `${INSTANCE_ICON_BASE}/${symbolFileName(icon)}.png`;
}

/**
 * Имена файлов в `public/instance-icons` пришли из Modrinth: там дефисы,
 * а в id символов — подчёркивания. Исключение — `wrench.png`
 * (гаечный ключ Create), он не совпадает с id `create_wrench`.
 */
function symbolFileName(icon: string): string {
  if (icon === 'create_wrench') return 'wrench';
  return icon.replaceAll('_', '-');
}

export function backgroundStyle(background: string): CSSProperties {
  const option = BACKGROUND_BY_ID.get(background) ?? BACKGROUND_BY_ID.get(DEFAULT_INSTANCE_BACKGROUND)!;
  return { backgroundImage: `linear-gradient(to bottom, ${option.top}, ${option.bottom})` };
}

export function backgroundLabel(background: string): string {
  return BACKGROUND_BY_ID.get(background)?.label ?? background;
}

export function symbolLabel(icon: string): string {
  return SYMBOL_BY_ID.get(icon)?.label ?? icon;
}

export function isKnownBackground(background: string | null | undefined): boolean {
  return Boolean(background && BACKGROUND_BY_ID.has(background));
}

export function isKnownSymbol(icon: string | null | undefined): boolean {
  return Boolean(icon && SYMBOL_BY_ID.has(icon));
}

function hash(input: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/**
 * Возвращает сохранённое оформление или детерминированную пару по seed.
 * Нужно для сборок, созданных до появления иконок: у каждой сразу есть
 * свой фон и предмет, но JSON остаётся без лишних полей.
 */
export function resolveInstanceIcon(
  config: { icon?: string | null; background?: string | null } | null | undefined,
  seed: string,
): InstanceIconConfig {
  const icon = config?.icon && isKnownSymbol(config.icon) ? config.icon : '';
  const background =
    config?.background && isKnownBackground(config.background) ? config.background : '';

  const base = seed || 'HydroLauncher';
  return {
    icon: icon || RANDOM_SYMBOLS[hash(`${base}:icon`) % RANDOM_SYMBOLS.length].id,
    background:
      background || INSTANCE_BACKGROUNDS[hash(`${base}:background`) % INSTANCE_BACKGROUNDS.length].id,
  };
}

/** Случайная пара, как кнопка «Случайно» в Modrinth. */
export function randomInstanceIcon(exclude?: Partial<InstanceIconConfig>): InstanceIconConfig {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const background =
      INSTANCE_BACKGROUNDS[Math.floor(Math.random() * INSTANCE_BACKGROUNDS.length)].id;
    const icon = RANDOM_SYMBOLS[Math.floor(Math.random() * RANDOM_SYMBOLS.length)].id;
    if (RANDOM_BLACKLIST.has(`${background}|${icon}`)) continue;
    if (exclude && exclude.background === background && exclude.icon === icon) continue;
    return { icon, background };
  }
  return { icon: DEFAULT_INSTANCE_ICON, background: DEFAULT_INSTANCE_BACKGROUND };
}
