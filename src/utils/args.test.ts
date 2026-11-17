import { describe, expect, it } from 'vitest';
import { formatArgs, splitArgs } from './args';

describe('splitArgs', () => {
  it('splits on any whitespace', () => {
    expect(splitArgs('  -Xmx4G\t-XX:+UseG1GC  ')).toEqual(['-Xmx4G', '-XX:+UseG1GC']);
    expect(splitArgs('')).toEqual([]);
    expect(splitArgs('   ')).toEqual([]);
  });

  it('keeps quoted arguments together', () => {
    expect(splitArgs('--path "C:\\Program Files\\Java" --demo')).toEqual([
      '--path',
      'C:\\Program Files\\Java',
      '--demo',
    ]);
    expect(splitArgs("--name 'my world'")).toEqual(['--name', 'my world']);
  });

  it('keeps backslashes in Windows paths', () => {
    expect(splitArgs('-Duser.home=C:\\Users\\Player')).toEqual([
      '-Duser.home=C:\\Users\\Player',
    ]);
  });

  it('supports escaped quotes inside double quotes', () => {
    expect(splitArgs('"--title=\\"Hello world\\""')).toEqual(['--title="Hello world"']);
  });

  it('keeps empty quoted arguments', () => {
    expect(splitArgs('--prefix ""')).toEqual(['--prefix', '']);
  });

  it('does not lose an unterminated quoted tail', () => {
    expect(splitArgs('--path "C:\\Program Files')).toEqual([
      '--path',
      'C:\\Program Files',
    ]);
  });
});

describe('formatArgs', () => {
  it('quotes only arguments that need it', () => {
    expect(formatArgs(['-Xmx4G', '--path', 'C:\\Program Files\\Java'])).toBe(
      '-Xmx4G --path "C:\\\\Program Files\\\\Java"',
    );
  });

  it('round-trips arguments with spaces, quotes and backslashes', () => {
    const args = [
      '-Xmx4G',
      '-Duser.home=C:\\Users\\Player',
      '--path',
      'C:\\Program Files\\Java\\',
      '--title="Hello world"',
      "it's fine",
      '',
    ];
    expect(splitArgs(formatArgs(args))).toEqual(args);
  });
});
