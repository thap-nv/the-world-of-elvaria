import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import type { TempDir } from '../../test/cli.ts';

describe('elvaria character model (P1-22)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    const summon = (...args: string[]) => run(testIo(), 'character', 'add', ...args, '--kingdom', kingdom);
    await summon('quill', '--class', 'scribe', '--tribe', 'gemini', '--model', 'gemini-4-argon-medium');
    await summon('thorn', '--class', 'knight', '--tribe', 'claude', '--model', 'claude-sonnet-5-5');
  });
  afterEach(() => dir.remove());

  const model = (io: ReturnType<typeof testIo>, ...args: string[]) =>
    run(io, 'character', 'model', ...args, '--kingdom', kingdom, '--locale', 'en');
  const sent = async () =>
    (await openKingdom(kingdom).inbox.read()).flatMap(({ command }) =>
      command.ok ? [{ kind: command.value.kind, payload: command.value.payload }] : [],
    );

  it('sends set_model and says the level stays', async () => {
    const io = testIo();
    expect(await model(io, 'quill', 'gemini-3.8-flash-high')).toBe(0);
    expect(io.printed.out[0]).toBe(
      'Sent the command to move quill from gemini-4-argon-medium to gemini-3.8-flash-high: its next session runs ' +
        "it, and that model's mana gauges bind it. Its level stays 3 (elvaria character level changes it).",
    );
    expect(await sent()).toEqual([
      { kind: 'set_model', payload: { character: 'quill', model: 'gemini-3.8-flash-high' } },
    ]);
  });

  it('says when the new model runs in a pool the owner turned off, and sends it all the same', async () => {
    const io = testIo();
    expect(await model(io, 'quill', 'claude-opus-5-5-high')).toBe(0);
    expect(io.printed.out[0]).toBe(
      'Note: pool claude_gpt_models of tribe gemini, where claude-opus-5-5-high runs, is turned off in ' +
        'kingdom.json: the character takes no work until it is on.',
    );
    expect(await sent()).toHaveLength(1);
  });

  it("refuses a slug that is no model, the model it runs, another tribe's model, an unknown character", async () => {
    const errors = async (...args: string[]) => {
      const io = testIo();
      expect(await model(io, ...args)).toBe(1);
      return io.printed.err;
    };
    expect(await errors('quill', 'Gemini Flash')).toEqual([
      'Model «Gemini Flash» is not valid: lowercase letters, digits, dots and hyphens only.',
    ]);
    expect(await errors('quill', 'gemini-4-argon-medium')).toEqual([
      'quill runs gemini-4-argon-medium already.',
    ]);
    expect(await errors('thorn', 'gemini-4-argon-medium')).toEqual([
      "Tribe claude does not run model gemini-4-argon-medium: a character's tribe is fixed for life. Summon a " +
        'character of another tribe instead: elvaria character add',
    ]);
    expect(await errors('nobody', 'claude-opus-5-5')).toEqual([
      'There is no character nobody. See: elvaria character list',
    ]);
    expect(await sent()).toEqual([]);
  });
});
