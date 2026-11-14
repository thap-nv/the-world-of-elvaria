// `elvaria tribe disable` (implementation-plan §3.14, P1-19), apart from tribe.spec.ts so that each stays within the
// 300 lines of a file.
import { KingdomSchema } from '@elvaria/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { kingdomJson } from '../../test/lantern.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

describe('elvaria tribe disable', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const elvaria = (io: TestIo, ...args: string[]) => run(io, ...args, '--kingdom', kingdom, '--locale', 'en');
  const tribes = async () => KingdomSchema.parse(await kingdomJson(kingdom)).tribes;

  it('turns a tribe off and says what becomes of its quests', async () => {
    const io = testIo();
    expect(await elvaria(io, 'tribe', 'disable', 'gemini')).toBe(0);
    expect(io.printed.out).toEqual([
      expect.stringMatching(/^Tribe gemini is disabled: it takes no new work/) as string,
    ]);
    expect((await tribes()).map(({ id, enabled }) => [id, enabled])).toEqual([
      ['claude', true],
      ['gemini', false],
    ]);
    const again = testIo();
    expect(await elvaria(again, 'tribe', 'disable', 'gemini')).toBe(0);
    expect(again.printed.out).toEqual(['Tribe gemini is already disabled.']);
    expect(await elvaria(testIo(), 'tribe', 'disable', 'nobody')).toBe(1);
  });
});
