// The models whose judges all draw on one mana pool (P1-56, (d) of the P1-50 report; counted by pool since PS-03,
// (b) of P1-56): the pure part and the line `doctor` prints.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { baseEnv, foundKingdom, isolatedPath, printed, run, tempDir, testIo } from '../../test/cli.ts';

import { onePoolJudgesOf } from './check-judges.ts';
import type { TempDir } from '../../test/cli.ts';

// Ids are branded in the registry; the plain strings here are what the function reads.
const classes = [
  { id: 'knight', kinds: ['build', 'fix'], is_verifier: false, is_monk: false },
  { id: 'scribe', kinds: ['docs'], is_verifier: false, is_monk: false },
  { id: 'judge', kinds: ['build', 'fix', 'docs'], is_verifier: true, is_monk: false },
  { id: 'code-judge', kinds: ['build'], is_verifier: true, is_monk: false },
  { id: 'monk', kinds: [], is_verifier: false, is_monk: true },
] as unknown as Parameters<typeof onePoolJudgesOf>[1];
// Claude is one pool; Gemini's account has two (poolOf: gemini-* and claude-*, gpt-*).
const tribes = [
  { id: 'claude', enabled: true },
  {
    id: 'gemini',
    enabled: true,
    pools: { gemini_models: { enabled: true }, claude_gpt_models: { enabled: true } },
  },
  { id: 'old', enabled: false },
] as unknown as Parameters<typeof onePoolJudgesOf>[2];
type Roster = Parameters<typeof onePoolJudgesOf>[0];
const who = (
  id: string,
  role: string,
  model: string,
  tribe = 'claude',
  status: 'idle' | 'suspended' = 'idle',
): Roster[number] => ({ id, class: role, model, tribe, status }) as unknown as Roster[number];

const ARGON = 'gemini-4-argon-medium';

describe('onePoolJudgesOf', () => {
  it('names a model whose judges of another model share one pool, two characters or one (P1-50: two Argons)', () => {
    const characters = [
      who('kael', 'knight', 'claude-opus-5-5'),
      who('thorn', 'knight', 'claude-sonnet-5-5'),
      who('argon', 'judge', ARGON, 'gemini'),
      who('vega', 'judge', 'gemini-4-argon-high', 'gemini'),
      who('ilse', 'judge', 'claude-sonnet-5-5'),
    ];
    // Opus work has the two Argons (Gemini) and ilse (Claude): two pools. Sonnet work has the two Argons alone.
    expect(onePoolJudgesOf(characters, classes, tribes)).toEqual([
      { model: 'claude-sonnet-5-5', judges: ['argon', 'vega'], tribe: 'gemini', pool: 'gemini_models' },
    ]);
  });

  it('counts the other pool of the same account apart', () => {
    const characters = [
      who('thorn', 'knight', 'claude-sonnet-5-5'),
      who('wren', 'judge', 'gemini-3.8-flash-high', 'gemini'),
      who('ash', 'judge', 'claude-opus-5-5-low', 'gemini'),
    ];
    expect(onePoolJudgesOf(characters, classes, tribes)).toEqual([]);
  });

  it('counts only judges that can take work now: not suspended, of an enabled tribe', () => {
    const characters = [
      who('kael', 'knight', 'claude-opus-5-5'),
      who('ilse', 'judge', 'claude-sonnet-5-5'),
      who('maren', 'judge', ARGON, 'gemini', 'suspended'),
      who('wren', 'judge', 'flash', 'old'),
    ];
    // ilse is the only one left: suspending maren and disabling wren's tribe left one pool.
    expect(onePoolJudgesOf(characters, classes, tribes)).toEqual([
      { model: 'claude-opus-5-5', judges: ['ilse'], tribe: 'claude', pool: 'claude' },
    ]);
  });

  it('counts the judges of the kinds the model’s doers work, a doer’s class apart', () => {
    // Code judges judge only build: scribes on Flash (docs) have the full judge alone, knights have both pools.
    const characters = [
      who('kael', 'knight', 'claude-opus-5-5'),
      who('sage', 'scribe', 'gemini-3.8-flash-high', 'gemini'),
      who('ilse', 'judge', 'claude-sonnet-5-5'),
      who('maren', 'code-judge', 'claude-sonnet-5-5'),
      who('wren', 'code-judge', ARGON, 'gemini'),
    ];
    expect(onePoolJudgesOf(characters, classes, tribes)).toEqual([
      { model: 'gemini-3.8-flash-high', judges: ['ilse'], tribe: 'claude', pool: 'claude' },
    ]);
  });

  it('says nothing for a kingdom without doers, without a judge, with judges on two pools, or with monks only', () => {
    const kael = who('kael', 'knight', 'claude-opus-5-5');
    expect(onePoolJudgesOf([], classes, tribes)).toEqual([]);
    expect(onePoolJudgesOf([kael], classes, tribes)).toEqual([]);
    expect(onePoolJudgesOf([kael, who('mo', 'monk', 'claude-opus-5-5')], classes, tribes)).toEqual([]);
    const two = [kael, who('ilse', 'judge', 'claude-sonnet-5-5'), who('wren', 'judge', ARGON, 'gemini')];
    expect(onePoolJudgesOf(two, classes, tribes)).toEqual([]);
    // A character of a class the registry no longer has takes no part.
    const ghost = [who('ghost', 'gone', 'claude-opus-5-5'), who('ilse', 'judge', 'claude-sonnet-5-5')];
    expect(onePoolJudgesOf(ghost, classes, tribes)).toEqual([]);
  });
});

describe('elvaria doctor: the models whose judges share one mana pool', () => {
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
  const warning = (judges: string) =>
    `! Doers on the model claude-sonnet-5-5 have judges of another model on one mana pool only (pool claude of tribe claude: ${judges}): when that pool closes, or they are suspended, work from that model has nobody to judge it. Add a judge of another model on another mana pool, best on another account.`;

  it('warns while every judge of another model is on one pool, two judges included, until one is on another', async () => {
    await summon('kael', '--class', 'knight', '--model', 'claude-sonnet-5-5');
    await summon('argon', '--class', 'judge', '--model', 'claude-opus-5-5');
    expect(await doctor()).toContain(warning('argon'));
    await summon('maren', '--class', 'judge', '--model', 'claude-haiku-5-5');
    expect(await doctor()).toContain(warning('argon, maren'));
    await summon('wren', '--class', 'judge', '--tribe', 'gemini', '--model', ARGON);
    expect(await doctor()).not.toContain('on one mana pool only');
  });

  it('says nothing about judges in a kingdom without characters', async () => {
    expect(await doctor()).not.toContain('judges of another model');
  });
});
