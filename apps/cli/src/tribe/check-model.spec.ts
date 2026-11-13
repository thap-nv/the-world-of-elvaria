// The model `elvaria tribe check` tries a real CLI on when the owner names none (PS-23, settled 2026-11-13 after
// fix/agy-1-5-7): the tribe's own, never one constant. Before, a tribe without a default model was tried on
// claude-haiku-5-5, which agy refuses, and `tribe check gemini` read 3/7 as a broken CLI.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { FAKE_LANTERN, LANTERN_ADAPTER, installLantern } from '../../test/lantern.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

describe('the model of tribe check', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await installLantern(kingdom);
    await elvaria(testIo(), 'tribe', 'add', 'lantern', '--adapter', LANTERN_ADAPTER);
    await elvaria(testIo(), 'doctor', '--tool', `lantern=${FAKE_LANTERN}`);
  });
  afterEach(() => dir.remove());

  const elvaria = (io: TestIo, ...args: string[]) => run(io, ...args, '--kingdom', kingdom, '--locale', 'en');
  const summon = (id: string, model: string, ...more: string[]) =>
    elvaria(
      testIo(),
      'character',
      'add',
      id,
      '--class',
      'knight',
      '--tribe',
      'lantern',
      '--model',
      model,
      ...more,
    );

  it('refuses a real CLI when the tribe has no default model and no character to borrow one from', async () => {
    const io = testIo();
    expect(await elvaria(io, 'tribe', 'check', 'lantern')).toBe(1);
    expect(io.printed.err).toEqual([
      'Tribe lantern has no default model and no character on a pool that is on, so there is no model to try: give --model <model>, one its account runs.',
    ]);
    expect(printed(io)).not.toContain('✓');
  });

  it("tries the cheapest model the tribe's own characters run, never a suspended one's", async () => {
    expect(await summon('wick', 'lantern-large', '--level', '5')).toBe(0);
    expect(await summon('glim', 'lantern-flash')).toBe(0);
    expect(await summon('ash', 'lantern-haiku')).toBe(0);
    expect(await elvaria(testIo(), 'character', 'suspend', 'ash')).toBe(0);
    const io = testIo();
    expect(await elvaria(io, 'tribe', 'check', 'lantern')).toBe(0);
    expect(io.printed.out).toContain(
      'Tries model lantern-flash, which glim of tribe lantern runs: the cheapest the kingdom runs on that account. --model tries another.',
    );
  });

  it('takes --model as given, and the fake CLI of --scenarios without a word', async () => {
    const given = testIo();
    expect(await elvaria(given, 'tribe', 'check', 'lantern', '--model', 'lantern-small')).toBe(0);
    expect(printed(given)).not.toContain('Tries model');
    const fake = testIo();
    expect(await elvaria(fake, 'tribe', 'check', 'lantern', '--scenarios')).toBe(0);
    expect(printed(fake)).not.toContain('Tries model');
  });
});
