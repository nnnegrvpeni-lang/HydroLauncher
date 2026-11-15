import { describe, expect, it } from 'vitest';
import {
  INSTANCE_BACKGROUNDS,
  INSTANCE_SYMBOLS,
  backgroundStyle,
  instanceIconAsset,
  randomInstanceIcon,
  resolveInstanceIcon,
} from './instanceIcons';

const backgroundIds = new Set(INSTANCE_BACKGROUNDS.map((item) => item.id));
const symbolIds = new Set(INSTANCE_SYMBOLS.map((item) => item.id));

describe('instanceIcons', () => {
  it('maps symbol ids to the shipped file names', () => {
    expect(instanceIconAsset('grass_block')).toBe('/instance-icons/grass-block.png');
    expect(instanceIconAsset('poke_ball')).toBe('/instance-icons/poke-ball.png');
    expect(instanceIconAsset('create_wrench')).toBe('/instance-icons/wrench.png');
    expect(instanceIconAsset('beacon')).toBe('/instance-icons/beacon.png');
  });

  it('keeps an explicitly selected appearance', () => {
    expect(resolveInstanceIcon({ icon: 'beacon', background: 'blue' }, 'any-seed')).toEqual({
      icon: 'beacon',
      background: 'blue',
    });
  });

  it('derives the same appearance from the same seed', () => {
    const first = resolveInstanceIcon(null, 'inst-42');
    expect(resolveInstanceIcon(undefined, 'inst-42')).toEqual(first);
    expect(symbolIds.has(first.icon)).toBe(true);
    expect(backgroundIds.has(first.background)).toBe(true);
  });

  it('replaces unknown ids with a derived appearance', () => {
    const config = resolveInstanceIcon({ icon: '../etc/passwd', background: '' }, 'inst-7');
    expect(symbolIds.has(config.icon)).toBe(true);
    expect(backgroundIds.has(config.background)).toBe(true);
  });

  it('never randomizes a loader symbol or a blacklisted color pair', () => {
    const blacklist = new Set([
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

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const config = randomInstanceIcon();
      const symbol = INSTANCE_SYMBOLS.find((item) => item.id === config.icon);
      expect(symbol?.category).not.toBe('loader');
      expect(blacklist.has(`${config.background}|${config.icon}`)).toBe(false);
    }
  });

  it('draws the background as a top-down gradient', () => {
    expect(backgroundStyle('blue')).toEqual({
      backgroundImage: 'linear-gradient(to bottom, #227EFF, #5EC1FF)',
    });
  });
});
