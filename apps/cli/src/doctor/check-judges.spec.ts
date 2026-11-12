// The models whose work has one judge (P1-56, (d) of the P1-50 report), the pure part and the line `doctor` prints.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { baseEnv, foundKingdom, isolatedPath, printed, run, tempDir, testIo } from '../../test/cli.ts';

import { loneJudgesOf } from './check-judges.ts';
import type { TempDir } from '../../test/cli.ts';

// Ids are branded in the registry; the plain strings here are what the function reads.
const classes = [
  { id: 'knight', kinds: ['build', 'fix'], is_verifier: false, is_monk: false },
  { id: 'scribe', kinds: ['docs'], is_verifier: false, is_monk: false },
  { id: 'judge', kinds: ['build', 'fix', 'docs'], is_verifier: true, is_monk: false },
  { id: 'code-judge', kinds: ['build'], is_verifier: true, is_monk: false },
  { id: 'monk', kinds: [], is_verifier: false, is_monk: true },
] as unknown as Parameters<typeof loneJudgesOf>[1];
const tribes = [
  { id: 'claude', enabled: true },
  { id: 'gemini', enabled: true },
  { id: 'old', enabled: false },
] as unknown as Parameters<typeof loneJudgesOf>[2];
type Roster = Parameters<typeof loneJudgesOf>[0];
const who = (
  id: string,
  role: string,
  model: string,
  tribe = 'claude',
  status: 'idle' | 'suspended' = 'idle',
): Roster[number] => ({ id, class: role, model, tribe, status }) as unknown as Roster[number];

describe('loneJudgesOf', () => {
  it('names a model of doers whose work has exactly one judge of another model', () => {
    // Opus work has ilse (Sonnet) and maren (Sonnet): two. Sonnet work has argon (Opus) alone.
    const characters = [
      who('kael', 'knight', 'opus'),
      who('thorn', 'knight', 'sonnet'),
      who('argon', 'judge', 'opus'),
      who('ilse', 'judge', 'sonnet'),
      who('maren', 'judge', 'sonnet'),
    ];
    expect(loneJudgesOf(characters, classes, tribes)).toEqual([{ model: 'sonnet', judge: 'argon' }]);
  });

  it('counts only judges that can take work now: not suspended, of an enabled tribe', () => {
    const characters = [
      who('kael', 'knight', 'opus'),
      who('ilse', 'judge', 'sonnet'),
      who('maren', 'judge', 'sonnet', 'claude', 'suspended'),
      who('wren', 'judge', 'flash', 'old'),
    ];
    // ilse is the only one left: suspending maren and disabling wren's tribe left a lone judge.
    expect(loneJudgesOf(characters, classes, tribes)).toEqual([{ model: 'opus', judge: 'ilse' }]);
  });

  it('counts the judges of the kinds the model’s doers work, a doer’s class apart', () => {
    // The code judge judges only build: scribes on opus (docs) have the full judge alone, knights have both.
    const characters = [
      who('kael', 'knight', 'opus'),
      who('sage', 'scribe', 'flash', 'gemini'),
      who('ilse', 'judge', 'sonnet'),
      who('maren', 'code-judge', 'sonnet'),
    ];
    expect(loneJudgesOf(characters, classes, tribes)).toEqual([{ model: 'flash', judge: 'ilse' }]);
  });

  it('says nothing for a kingdom without doers, without a judge, with two judges, or with monks only', () => {
    expect(loneJudgesOf([], classes, tribes)).toEqual([]);
    expect(loneJudgesOf([who('kael', 'knight', 'opus')], classes, tribes)).toEqual([]);
    expect(loneJudgesOf([who('kael', 'knight', 'opus'), who('mo', 'monk', 'opus')], classes, tribes)).toEqual(
      [],
    );
    const two = [
      who('kael', 'knight', 'opus'),
      who('ilse', 'judge', 'sonnet'),
      who('wren', 'judge', 'flash'),
    ];
    expect(loneJudgesOf(two, classes, tribes)).toEqual([]);
    // A character of a class the registry no longer has takes no part.
    expect(
      loneJudgesOf([who('ghost', 'gone', 'opus'), who('ilse', 'judge', 'sonnet')], classes, tribes),
    ).toEqual([]);
  });
});

describe('elvaria doctor: the models with a lone judge (P1-56)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const summon = (id: string, ...args: string[]) =>
    run(testIo(), 'character', 'add', id, ...args, '--kingdom', kingdom);
  const doctor = async () => {
    const io = testIo({ env: baseEnv(await isolatedPath()) });
    await run(io, 'doctor', '--kingdom', kingdom, '--locale', 'en');
    return printed(io);
  };

  it('warns that work on one model has a single judge of another, as a warning, until a second one is summoned', async () => {
    await summon('kael', '--class', 'knight', '--model', 'claude-sonnet-5-5');
    await summon('argon', '--class', 'judge', '--model', 'claude-opus-5-5');
    const lone =
      '! Doers on the model claude-sonnet-5-5 have only one judge of another model (argon): when their mana gauge closes, or they are suspended, work from that model has nobody to judge it. Add a judge of another model, best on another account.';
    expect(await doctor()).toContain(lone);
    await summon('maren', '--class', 'judge', '--model', 'claude-haiku-5-5');
    expect(await doctor()).not.toContain('only one judge of another model');
  });

  it('says nothing about judges in a kingdom without characters', async () => {
    expect(await doctor()).not.toContain('judge of another model');
  });
});
