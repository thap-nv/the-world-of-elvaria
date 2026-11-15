// claimPromptsOf (fix/claim-step): which assignees' prompts the Steward measures before the tick, for which open
// quests, and that a length is kept until the quest or its log change, so a quest that waits for a knight costs no
// prompt build at every tick.
import { describe, expect, it } from 'vitest';

import { claimPromptsOf } from './claim-prompt-size.ts';
import type { Character, Quest, TribeLimits } from '@elvaria/domain';
import type { Context } from '../context.ts';
import type { SessionInput } from './input.ts';

const who = (id: string, tribe: string, more: Record<string, string> = {}) =>
  ({ id, tribe, class: 'knight', status: 'idle', ...more }) as unknown as Character;
const KAEL = who('kael', 'gemini');
const CHARACTERS = [
  KAEL,
  who('thorn', 'claude'),
  who('vex', 'gemini', { status: 'suspended' }),
  who('ilse', 'gemini', { class: 'judge' }),
];
const questOf = (id: string, more: Record<string, unknown> = {}) =>
  ({
    id,
    status: 'open',
    tier: 'session',
    class_required: 'knight',
    territory: 't1',
    depends_on: [],
    attempts: 0,
    attempt_log: [],
    updated_at: '2026-11-15T09:00:00+07:00',
    plot: { type: 'none' },
    ...more,
  }) as unknown as Quest;

function contextOf(quests: readonly Quest[], limits: Partial<Record<string, Partial<TribeLimits>>>) {
  const warnings: string[] = [];
  const ctx = {
    world: {
      characters: new Map(CHARACTERS.map((c) => [c.id, c])),
      quests: new Map(quests.map((q) => [q.id, q])),
      territories: new Map([['t1', { id: 't1', path: 'D:/territory' }]]),
    },
    limits,
    deps: { log: { warn: (line: string) => warnings.push(line) } },
  } as unknown as Context;
  return { ctx, warnings };
}

const QUESTS = [
  questOf('q_open'),
  questOf('q_claimed', { status: 'claimed', assignee: 'thorn' }),
  questOf('q_script', { tier: 'script' }),
  questOf('q_merge', { party_role: 'merge' }),
  questOf('q_docs', { class_required: 'scribe' }),
  questOf('q_waits', { depends_on: ['q_claimed'] }),
  questOf('q_after', { depends_on: ['q_done'] }),
  questOf('q_done', { status: 'done' }),
  questOf('q_needs_lost', { depends_on: ['q_nowhere'] }),
  questOf('q_lost', { territory: 'gone' }),
];
const LIMITED = { gemini: { prompt_max_chars: 26_000 } };

describe('claimPromptsOf', () => {
  it('measures the characters of a tribe with a limit here, for the open quests they may claim now', async () => {
    const { ctx } = contextOf(QUESTS, LIMITED);
    const sizes = new Map<string, number | null>();
    const asked: string[] = [];
    const lengthOf = (_ctx: Context, input: SessionInput) => {
      const { quest, character, cwd, n, continuation } = input;
      asked.push(`${quest.id}:${quest.status}:${String(quest.assignee)}:${character.id}:${cwd}:${String(n)}`);
      expect(continuation).toBeNull();
      return Promise.resolve(51_134);
    };
    const prompts = await claimPromptsOf(ctx, sizes, lengthOf);
    expect(prompts).toEqual([
      { quest: 'q_open', character: 'kael', chars: 51_134 },
      { quest: 'q_after', character: 'kael', chars: 51_134 },
    ]);
    expect(asked).toEqual([
      'q_open:claimed:kael:kael:D:/territory:1',
      'q_after:claimed:kael:kael:D:/territory:1',
    ]);
    // The next tick keeps the lengths: nothing changed of the quests.
    expect(await claimPromptsOf(ctx, sizes, lengthOf)).toEqual(prompts);
    expect(asked).toHaveLength(2);
  });

  it('measures again once the owner edited the quest', async () => {
    const sizes = new Map<string, number | null>();
    let calls = 0;
    const lengthOf = () => Promise.resolve((calls += 1) * 1000);
    await claimPromptsOf(contextOf([questOf('q_open')], LIMITED).ctx, sizes, lengthOf);
    const edited = questOf('q_open', { updated_at: '2026-11-15T09:05:00+07:00' });
    const again = await claimPromptsOf(contextOf([edited], LIMITED).ctx, sizes, lengthOf);
    expect(again).toEqual([{ quest: 'q_open', character: 'kael', chars: 2000 }]);
    expect(sizes.size).toBe(1);
  });

  it('measures nothing in a kingdom without a tribe that has a limit here, and forgets what it kept', async () => {
    const sizes = new Map<string, number | null>([['old', 1]]);
    const lengthOf = () => Promise.reject(new Error('not asked'));
    expect(await claimPromptsOf(contextOf(QUESTS, {}).ctx, sizes, lengthOf)).toEqual([]);
    expect(sizes.size).toBe(0);
  });

  it('says once why a prompt could not be built, and passes nobody over for it', async () => {
    const { ctx, warnings } = contextOf([questOf('q_open')], LIMITED);
    const sizes = new Map<string, number | null>();
    const lengthOf = () => Promise.reject(new Error('registry has no class "knight"'));
    expect(await claimPromptsOf(ctx, sizes, lengthOf)).toEqual([]);
    expect(await claimPromptsOf(ctx, sizes, () => Promise.reject(new Error('no string')))).toEqual([]);
    expect(warnings).toEqual([
      'steward: q_open: cannot measure kael\'s prompt: registry has no class "knight"',
    ]);
  });

  it('words a thrown value that is no error', async () => {
    const { ctx, warnings } = contextOf([questOf('q_open')], LIMITED);
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a CLI may throw anything
    await claimPromptsOf(ctx, new Map(), () => Promise.reject('E2BIG'));
    expect(warnings).toEqual(["steward: q_open: cannot measure kael's prompt: E2BIG"]);
  });
});
