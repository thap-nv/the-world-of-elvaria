import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import type { TempDir } from '../../test/cli.ts';

describe('elvaria character level (P1-29)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await run(
      testIo(),
      'character',
      'add',
      'ember',
      '--class',
      'knight',
      '--level',
      '1',
      '--kingdom',
      kingdom,
    );
  });
  afterEach(() => dir.remove());

  const level = (io: ReturnType<typeof testIo>, ...args: string[]) =>
    run(io, 'character', 'level', ...args, '--kingdom', kingdom, '--locale', 'en');
  const sent = async () =>
    (await openKingdom(kingdom).inbox.read()).flatMap(({ command }) =>
      command.ok ? [{ kind: command.value.kind, payload: command.value.payload }] : [],
    );

  it('sends set_level and says which ranks the character is given from then on', async () => {
    const io = testIo();
    expect(await level(io, 'ember', '4')).toBe(0);
    expect(io.printed.out[0]).toBe(
      'Sent the command to set ember from level 1 to level 4: the Steward then gives it quests up to rank C.',
    );
    expect(io.printed.out[1]).toMatch(/^Command \S+ is in the inbox/);
    expect(await sent()).toEqual([{ kind: 'set_level', payload: { character: 'ember', level: 4 } }]);
  });

  it('refuses a level off the table, the level it has, and a character it does not know', async () => {
    const errors = async (...args: string[]) => {
      const io = testIo();
      expect(await level(io, ...args)).toBe(1);
      return io.printed.err;
    };
    const offTable = ['The level must be a whole number from 1 to 10.'];
    expect(await errors('ember', '11')).toEqual(offTable);
    expect(await errors('ember', '0')).toEqual(offTable);
    expect(await errors('ember', '2.5')).toEqual(offTable);
    expect(await errors('ember', 'high')).toEqual(offTable);
    expect(await errors('ember', '1')).toEqual(['ember is level 1 already.']);
    expect(await errors('nobody', '3')).toEqual([
      'There is no character nobody. See: elvaria character list',
    ]);
    expect(await sent()).toEqual([]);
  });

  it('needs both the character and the level', async () => {
    const io = testIo();
    expect(await level(io, 'ember')).toBe(2);
    expect(await sent()).toEqual([]);
  });
});
