// The late machine verdict on a done quest (ADR 0033, plans/check-modes.md "Lần trượt muộn", CM-05): the three
// `done.verdict_fail` rows, their effect, and the run that follows.
import { describe, expect, it } from 'vitest';

import { BRANN, MERGE, SCRIPT, SESSION, THORN, at, draftQuest, walk } from './__fixtures__/quests.ts';
import { transition } from './transition.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { QuestEventType } from './events.ts';
import type { Variant } from './__fixtures__/quests.ts';

const BRANCH = 'quest/q_20261106_7k3m2a';
const JUDGED: readonly QuestEventType[] = ['submit', 'assign_verifier', 'verdict_pass'];
/** A judge passes the first run, the owner seals it, the Steward delivers it. */
const SEALED_AND_DELIVERED: readonly QuestEventType[] = [
  'confirm',
  'claim',
  'start',
  ...JUDGED,
  'seal',
  'deliver',
];

const draft = (variant: Variant): Quest => ({
  ...draftQuest(variant),
  deliverable: { type: 'branch', branch: BRANCH },
});
const late = (quest: Quest, actor: 'steward' | 'verifier' = 'steward') =>
  transition(quest, { type: 'verdict_fail', at: at(90) }, actor);
const lateFailed = (quest: Quest): Quest => {
  const failed = late(quest);
  if (!failed.ok) throw new Error(JSON.stringify(failed.error));
  return failed.value;
};

describe('a late machine verdict on a done quest (ADR 0033)', () => {
  const done = walk(draft({ ...SESSION, seal_required: true }), SEALED_AND_DELIVERED);

  it('starts from a quest a judge passed, the owner sealed and the Steward delivered', () => {
    expect(done).toMatchObject({ status: 'done', assignee: THORN, verifier: BRANN, attempts: 1 });
    expect(done.seal).toBeDefined();
    expect(done.deliverable.delivered_at).toBeDefined();
  });

  it('returns it to its assignee without the judge, the seal or the delivery stamp, keeping branch and seal_required', () => {
    const returned = lateFailed(done);
    expect(returned).toMatchObject({
      status: 'returned',
      assignee: THORN,
      verifier: null,
      attempts: 1,
      seal_required: true,
      deliverable: { type: 'branch', branch: BRANCH },
      updated_at: at(90),
    });
    expect(returned.seal).toBeUndefined();
    expect(returned.deliverable.delivered_at).toBeUndefined();
    // No session held the done quest, so none ends and the log stays as the pass left it.
    expect(returned.attempt_log).toEqual(done.attempt_log);
  });

  it('goes on as after any fail: a new run, a judge, the seal once more, then a second delivery', () => {
    const redone = walk(lateFailed(done), ['redispatch', ...JUDGED]);
    expect(redone).toMatchObject({ status: 'awaiting_seal', attempts: 2 });
    expect(redone.attempt_log.filter(({ role }) => role === 'assignee').map(({ n }) => n)).toEqual([1, 2]);
    const delivered = walk(redone, ['seal', 'deliver']);
    expect(delivered.status).toBe('done');
    // walk dates its events at(1), at(2)…: the second delivery is the deliver of this walk.
    expect(delivered.deliverable).toEqual({ type: 'branch', branch: BRANCH, delivered_at: at(2) });
  });

  it("is the Steward's alone: the judge who passed it holds no done quest", () => {
    expect(late(done, 'verifier')).toMatchObject({ ok: false, error: { code: 'actor_not_allowed' } });
  });

  it('sends a quest whose attempts ran out to the infirmary', () => {
    const last = walk(draft({ ...SESSION, max_attempts: 1 }), ['confirm', 'claim', 'start', ...JUDGED]);
    expect(last.status).toBe('done');
    expect(lateFailed(last)).toMatchObject({ status: 'infirmary', assignee: THORN, verifier: null });
  });

  it("opens the machine's merge of a party's parts for a knight, as its review would", () => {
    const merged = walk(draft(MERGE), ['confirm', 'claim', 'start', 'submit', 'verdict_pass', 'seal']);
    expect(merged).toMatchObject({ status: 'done', assignee: null, attempts: 0 });
    expect(lateFailed(merged)).toMatchObject({ status: 'open', assignee: null, attempts: 0 });
  });

  it("matches no row for a script: its red check is the owner's to read", () => {
    const script = walk(draft(SCRIPT), ['confirm', 'claim', 'start', 'submit', 'verdict_pass']);
    expect(script.status).toBe('done');
    expect(late(script)).toEqual({
      ok: false,
      error: {
        code: 'guard_failed',
        from: 'done',
        event: 'verdict_fail',
        guards: ['can_retry', 'machine_retry', 'session_out_of_retries'],
      },
    });
  });

  it('never moves an archived quest: one already on the base branch stays archived', () => {
    const archived = walk(done, ['archive']);
    expect(late(archived)).toMatchObject({ ok: false, error: { code: 'no_transition', from: 'archived' } });
  });
});
