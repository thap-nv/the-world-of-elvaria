// reviewPromptsOf (fix/verifier-prompt-limit): which judges' prompts the Steward measures before the tick, and that a
// review's length is kept until the quest, its checks or the judge change, so a quest that waits for a judge costs no
// git diff at every tick.
import { describe, expect, it } from 'vitest';

import { reviewPromptsOf } from './prompt-size.ts';
import type { Character, Quest, TribeLimits } from '@elvaria/domain';
import type { CheckedRun } from '../background.ts';
import type { Context } from '../context.ts';
import type { SessionInput } from '../sessions/input.ts';

const CLASSES = [
  { id: 'judge', is_verifier: true, kinds: ['code'] },
  { id: 'knight', is_verifier: false, kinds: ['code'] },
];
const who = (id: string, tribe: string, more: Record<string, string> = {}) =>
  ({ id, tribe, class: 'judge', status: 'idle', ...more }) as unknown as Character;
const ILSE = who('ilse', 'gemini');
const CHARACTERS = [
  ILSE,
  who('maren', 'claude'),
  who('vex', 'gemini', { status: 'suspended' }),
  who('kael', 'gemini', { class: 'knight' }),
];
const questOf = (id: string, more: Record<string, unknown> = {}) =>
  ({
    id,
    status: 'review',
    tier: 'session',
    verifier: null,
    kind: 'code',
    territory: 't1',
    attempt_log: [],
    plot: { type: 'folder', path: `D:/kingdom/quests/${id}/work` },
    ...more,
  }) as unknown as Quest;
const CHECKED: CheckedRun = { checks: [], head: 'abc123' };

function contextOf(quests: readonly Quest[], limits: Partial<Record<string, Partial<TribeLimits>>>) {
  const warnings: string[] = [];
  const ended = new Map<string, CheckedRun>([
    ['q_ready', CHECKED],
    ['q_env', { ...CHECKED, environment: { check: 'e2e' } } as unknown as CheckedRun],
    ['q_docs', CHECKED],
    ['q_lost', CHECKED],
  ]);
  const ctx = {
    world: {
      registry: { classes: CLASSES, kinds: [], rituals: [] },
      characters: new Map(CHARACTERS.map((c) => [c.id, c])),
      quests: new Map(quests.map((q) => [q.id, q])),
      territories: new Map([['t1', { id: 't1', path: 'D:/territory' }]]),
    },
    limits,
    background: { ended: (quest: string) => ended.get(quest) },
    deps: { log: { warn: (line: string) => warnings.push(line) } },
  } as unknown as Context;
  return { ctx, warnings };
}

const QUESTS = [
  questOf('q_ready'),
  questOf('q_judged', { verifier: 'maren' }),
  questOf('q_working', { status: 'working' }),
  questOf('q_script', { tier: 'script' }),
  questOf('q_unchecked'),
  questOf('q_env'),
  questOf('q_docs', { kind: 'docs' }),
  questOf('q_lost', { territory: 'gone' }),
];
const LIMITED = { gemini: { prompt_max_chars: 26_000 } };

describe('reviewPromptsOf', () => {
  it('measures the judges of a tribe with a limit here, for the quests whose judge is due, once each', async () => {
    const { ctx } = contextOf(QUESTS, LIMITED);
    const sizes = new Map<string, number | null>();
    const asked: string[] = [];
    const lengthOf = (_ctx: Context, input: SessionInput) => {
      asked.push(`${input.quest.id}:${input.character.id}:${input.cwd}`);
      return Promise.resolve(39_636);
    };
    const prompts = await reviewPromptsOf(ctx, sizes, lengthOf);
    expect(prompts).toEqual([{ quest: 'q_ready', character: 'ilse', chars: 39_636 }]);
    expect(asked).toEqual(['q_ready:ilse:D:/kingdom/quests/q_ready/work']);
    // The next tick keeps the length: nothing changed of the review.
    expect(await reviewPromptsOf(ctx, sizes, lengthOf)).toEqual(prompts);
    expect(asked).toHaveLength(1);
  });

  it('measures again once the review moved on (a judge left, a partial verdict)', async () => {
    const sizes = new Map<string, number | null>();
    let calls = 0;
    const lengthOf = () => Promise.resolve((calls += 1) * 1000);
    await reviewPromptsOf(contextOf([questOf('q_ready')], LIMITED).ctx, sizes, lengthOf);
    const left = questOf('q_ready', { attempt_log: [{ n: 1, role: 'verifier', character: 'ilse' }] });
    const again = await reviewPromptsOf(contextOf([left], LIMITED).ctx, sizes, lengthOf);
    expect(again).toEqual([{ quest: 'q_ready', character: 'ilse', chars: 2000 }]);
    expect(sizes.size).toBe(1);
  });

  it('measures nothing in a kingdom without a tribe that has a limit here, and forgets what it kept', async () => {
    const sizes = new Map<string, number | null>([['old', 1]]);
    const lengthOf = () => Promise.reject(new Error('not asked'));
    expect(await reviewPromptsOf(contextOf(QUESTS, {}).ctx, sizes, lengthOf)).toEqual([]);
    expect(sizes.size).toBe(0);
  });

  it('says once why a prompt could not be built, and passes nobody over for it', async () => {
    const { ctx, warnings } = contextOf([questOf('q_ready')], LIMITED);
    const sizes = new Map<string, number | null>();
    const lengthOf = () => Promise.reject(new Error('registry has no class "judge"'));
    expect(await reviewPromptsOf(ctx, sizes, lengthOf)).toEqual([]);
    expect(await reviewPromptsOf(ctx, sizes, () => Promise.reject(new Error('no string')))).toEqual([]);
    expect(warnings).toEqual([
      'steward: q_ready: cannot measure ilse\'s prompt: registry has no class "judge"',
    ]);
  });

  it('words a thrown value that is no error', async () => {
    const { ctx, warnings } = contextOf([questOf('q_ready')], LIMITED);
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a CLI may throw anything
    await reviewPromptsOf(ctx, new Map(), () => Promise.reject('E2BIG'));
    expect(warnings).toEqual(["steward: q_ready: cannot measure ilse's prompt: E2BIG"]);
  });
});
