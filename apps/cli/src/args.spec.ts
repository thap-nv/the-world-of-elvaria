import { describe, expect, it } from 'vitest';

import { flagOption, parseCommandArgs, textOption, textOptions } from './args.ts';
import { EXIT } from './command.ts';
import type { CommandSpec } from './command.ts';

const SPEC: CommandSpec = {
  name: ['quest', 'add'],
  summary: 'cli.quest.add.summary',
  args: [{ name: '<quest>', help: 'cli.quest.arg.quest' }],
  options: {
    title: { type: 'string', required: true, help: 'cli.quest.add.option.title' },
    tag: { type: 'string', multiple: true, help: 'cli.quest.add.option.tag' },
    seal: { type: 'boolean', help: 'cli.quest.add.option.seal' },
  },
  run: () => Promise.resolve(EXIT.ok),
};

describe('parseCommandArgs', () => {
  it('reads options, repeated options, negated flags and positionals', () => {
    const parsed = parseCommandArgs(SPEC, ['q_1', '--title', 'T', '--tag', 'a', '--tag', 'b', '--no-seal']);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(textOption(parsed.value, 'title')).toBe('T');
    expect(textOptions(parsed.value, 'tag')).toEqual(['a', 'b']);
    expect(flagOption(parsed.value, 'seal')).toBe(false);
    expect(parsed.value.positionals).toEqual(['q_1']);
    expect(textOption(parsed.value, 'seal')).toBeUndefined();
    expect(textOptions(parsed.value, 'title')).toEqual(['T']);
    expect(textOptions(parsed.value, 'missing')).toEqual([]);
    expect(flagOption(parsed.value, 'title')).toBeUndefined();
  });

  it('accepts the global options on every command', () => {
    const parsed = parseCommandArgs(SPEC, ['q_1', '--title', 'T', '--kingdom', 'k', '--locale', 'en', '-h']);
    expect(parsed.ok && parsed.value.values).toMatchObject({ kingdom: 'k', locale: 'en', help: true });
  });

  it('answers --help before any other check', () => {
    expect(parseCommandArgs(SPEC, ['--help']).ok).toBe(true);
  });

  it.each([
    [['q_1', '--title', 'T', '--nope'], { code: 'unknown_option', option: '--nope' }],
    [['q_1', '--title'], { code: 'bad_value', option: '--title' }],
    [['q_1', '--title', 'T', '--seal=yes'], { code: 'bad_value', option: '--seal' }],
    [['q_1'], { code: 'missing_option', option: '--title' }],
    [['--title', 'T'], { code: 'missing_argument', name: '<quest>' }],
    [['q_1', 'q_2', '--title', 'T'], { code: 'extra_argument', value: 'q_2' }],
  ])('%j → %j', (argv, error) => {
    expect(parseCommandArgs(SPEC, argv)).toEqual({ ok: false, error });
  });
});
