import { describe, expect, it } from 'vitest';

import {
  BRANN,
  ELLA,
  QUEST_ID,
  SCRIPT,
  SESSION,
  THORN,
  at,
  eventOf,
  questIn,
  walk,
} from './__fixtures__/quests.ts';
import { transition } from './transition.ts';
import type { ScriptId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { QuestActor, QuestEventType } from './events.ts';

// The specs below pick payloads that fit `type`; transition() checks the rest.
const fire = (quest: Quest, type: QuestEventType, actor: QuestActor, extra: object = {}) =>
  transition(quest, { ...eventOf(type, quest, at(50)), ...extra }, actor);

const value = (result: ReturnType<typeof transition>): Quest => {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

const RUN = `.runs/${QUEST_ID}-1`;

describe('transition: attempts and the attempt log', () => {
  it('starts attempt 1 on start: the counter, the run number and an open entry for the assignee', () => {
    const quest = questIn('working');
    expect(quest).toMatchObject({ status: 'working', assignee: THORN, attempts: 1, updated_at: at(3) });
    expect(quest.attempt_log).toEqual([
      { n: 1, character: THORN, role: 'assignee', started_at: at(3), session_id: 's-start', run_dir: RUN },
    ]);
  });

  it('closes the entry on submit with what the runner knows', () => {
    expect(questIn('review').attempt_log).toEqual([
      expect.objectContaining({
        ended_at: at(4),
        outcome: 'submitted',
        session_id: 's-submit',
        tokens: 1200,
      }),
    ]);
  });

  it('releases a claim that never started: no attempt, no assignee', () => {
    expect(value(fire(questIn('claimed'), 'release', 'steward'))).toMatchObject({
      status: 'open',
      assignee: null,
      attempts: 0,
      attempt_log: [],
    });
  });

  it('retries after a crash with the same assignee, a new run number and the counter up', () => {
    const quest = walk(questIn('returned'), ['redispatch']);
    expect(quest).toMatchObject({ status: 'working', assignee: THORN, attempts: 2 });
    expect(quest.attempt_log.map((entry) => [entry.n, entry.outcome, entry.run_dir])).toEqual([
      [1, 'crash', RUN],
      [2, undefined, `.runs/${QUEST_ID}-2`],
    ]);
  });

  it('pauses on mana_out and resumes the same attempt in a fresh session', () => {
    const paused = questIn('paused_mana');
    expect(paused).toMatchObject({ assignee: THORN, attempt_log: [{ outcome: 'paused' }] });
    const resumed = value(fire(paused, 'mana_restored', 'mana', { session_id: 's-again' }));
    expect(resumed).toMatchObject({ status: 'working', attempts: 1 });
    expect(resumed.attempt_log.map((entry) => [entry.n, entry.session_id, entry.ended_at])).toEqual([
      [1, 's-start', at(4)],
      [1, 's-again', undefined],
    ]);
  });

  it('records the breaker that tripped: timeout for time, breaker for tokens and turns', () => {
    const working = questIn('working');
    expect(value(fire(working, 'breaker', 'steward', { trip: 'time' })).attempt_log[0]?.outcome).toBe(
      'timeout',
    );
    expect(value(fire(working, 'breaker', 'steward', { trip: 'turns' })).attempt_log[0]?.outcome).toBe(
      'breaker',
    );
  });

  it('ends the attempt as returned when the owner suspends the assignee, cancelled when the owner cancels', () => {
    const working = questIn('working');
    expect(value(fire(working, 'suspend', 'user'))).toMatchObject({
      status: 'returned',
      assignee: THORN,
      attempt_log: [{ outcome: 'returned' }],
    });
    expect(value(fire(working, 'cancel', 'user')).attempt_log[0]?.outcome).toBe('cancelled');
    expect(value(fire(questIn('blocked'), 'cancel', 'user')).attempt_log).toEqual([]);
  });

  it('gives a full budget again on retry and on a reassign out of the infirmary, not on other reassigns', () => {
    const infirmary = questIn('infirmary');
    expect(value(fire(infirmary, 'retry', 'user'))).toMatchObject({
      status: 'open',
      attempts: 0,
      assignee: null,
    });
    expect(value(fire(infirmary, 'reassign', 'user'))).toMatchObject({ assignee: ELLA, attempts: 0 });
    expect(value(fire(questIn('returned'), 'reassign', 'user'))).toMatchObject({
      assignee: ELLA,
      attempts: 1,
    });
    expect(value(fire(infirmary, 'retry', 'user')).attempt_log).toHaveLength(1);
  });
});

describe('transition: questions', () => {
  it('blocks an open quest with the question and opens it again on the answer', () => {
    const blocked = questIn('blocked');
    expect(blocked.blocked).toEqual({ question: 'Bản EN dùng giọng nào?', asked_at: at(2) });
    expect(value(fire(blocked, 'answer', 'user'))).toMatchObject({
      status: 'open',
      blocked: { answer: 'Giữ, đánh dấu deprecated.', answered_at: at(50) },
    });
    expect(value(fire(blocked, 'unblock', 'steward')).status).toBe('open');
  });

  it("ends the assignee's attempt on ask and resumes it in a fresh session on the answer", () => {
    const asked = walk(questIn('working'), ['ask']);
    expect(asked).toMatchObject({ status: 'blocked', attempt_log: [{ outcome: 'blocked' }] });
    const answered = value(fire(asked, 'answer', 'user'));
    expect(answered).toMatchObject({ status: 'working', attempts: 1 });
    expect(answered.attempt_log.map((entry) => entry.n)).toEqual([1, 1]);
  });

  it('refuses an answer to a blocked quest that lost its question', () => {
    const { blocked: _, ...lost } = questIn('blocked');
    expect(fire(lost as Quest, 'answer', 'user')).toEqual({
      ok: false,
      error: { code: 'invalid_quest', issues: ['a blocked quest needs blocked'] },
    });
  });
});

describe('transition: verification', () => {
  const judged = () => walk(questIn('review'), ['assign_verifier']);

  it('assigns a verifier with an entry of its own on the same run', () => {
    expect(judged()).toMatchObject({ status: 'review', verifier: BRANN });
    expect(judged().attempt_log[1]).toEqual({
      n: 1,
      character: BRANN,
      role: 'verifier',
      // walk() counts minutes from 1 on every call.
      started_at: at(1),
      session_id: 's-verify',
      run_dir: `${RUN}/verify`,
    });
  });

  it('refuses the assignee or anyone who worked the quest as verifier (ADR 0008)', () => {
    const review = questIn('review');
    const reason = { ok: false, error: { code: 'invalid_event', reason: 'verifier_worked' } };
    expect(fire(review, 'assign_verifier', 'steward', { verifier: THORN })).toEqual(reason);
    const reassigned = walk(questIn('returned'), ['reassign', 'start', 'submit']);
    expect(fire(reassigned, 'assign_verifier', 'steward', { verifier: THORN })).toEqual(reason);
  });

  it('keeps the verifier on a pass and frees it on a fail, so the next attempt gets a fresh one', () => {
    expect(value(fire(judged(), 'verdict_pass', 'verifier'))).toMatchObject({
      status: 'done',
      verifier: BRANN,
    });
    const failed = value(fire(judged(), 'verdict_fail', 'verifier'));
    expect(failed).toMatchObject({ status: 'returned', verifier: null });
    expect(failed.attempt_log[1]).toMatchObject({ ended_at: at(50), outcome: 'submitted' });
  });

  it('drops a verifier that runs out of mana, trips a breaker or is suspended, and stays in review', () => {
    for (const [type, actor, outcome] of [
      ['mana_out', 'mana', 'paused'],
      ['breaker', 'steward', 'breaker'],
      ['suspend', 'user', 'cancelled'],
    ] as const) {
      const result = value(fire(judged(), type, actor));
      expect(result).toMatchObject({ status: 'review', verifier: null });
      expect(result.attempt_log[1]?.outcome).toBe(outcome);
    }
  });

  it('lets the machine judge when no verifier holds the quest, never over a verifier', () => {
    expect(value(fire(questIn('review'), 'verdict_pass', 'steward')).status).toBe('done');
    expect(fire(judged(), 'verdict_pass', 'steward')).toEqual({
      ok: false,
      error: { code: 'actor_not_holding', actor: 'steward' },
    });
  });

  it('seals with and without a note, and frees the verifier when the owner returns the work', () => {
    const sealed = questIn('awaiting_seal', { ...SESSION, seal_required: true });
    expect(value(fire(sealed, 'seal', 'user')).seal).toEqual({ at: at(50), note: 'ok' });
    expect(value(fire(sealed, 'seal', 'user', { note: undefined })).seal).toEqual({ at: at(50) });
    const judgedSeal = walk(questIn('review', { ...SESSION, seal_required: true }), ['assign_verifier']);
    const returned = value(fire(walk(judgedSeal, ['verdict_pass']), 'return', 'user'));
    expect(returned).toMatchObject({ status: 'returned', verifier: null });
  });

  it('delivers once', () => {
    const delivered = value(fire(questIn('done'), 'deliver', 'steward'));
    expect(delivered).toMatchObject({ status: 'done', deliverable: { delivered_at: at(50) } });
    expect(fire(delivered, 'deliver', 'steward')).toEqual({
      ok: false,
      error: { code: 'guard_failed', from: 'done', event: 'deliver', guards: ['undelivered'] },
    });
  });
});

describe('transition: the script tier', () => {
  it('runs without a character: claimed by nobody, submitted and judged by the Steward', () => {
    const done = walk(questIn('working', SCRIPT), ['submit', 'verdict_pass']);
    expect(done).toMatchObject({ status: 'done', assignee: null, verifier: null });
    expect(done.attempt_log).toEqual([expect.objectContaining({ character: null, outcome: 'submitted' })]);
  });

  it('goes to the infirmary on a crash or a fail, never back to a character', () => {
    expect(value(fire(questIn('working', SCRIPT), 'crash', 'steward')).status).toBe('infirmary');
    expect(value(fire(questIn('review', SCRIPT), 'verdict_fail', 'steward')).status).toBe('infirmary');
  });
});

describe('transition: refusals', () => {
  const refused = (result: ReturnType<typeof transition>) => (result.ok ? undefined : result.error);

  it('refuses a quest whose tiers disagree (the gaps of the v1 contract)', () => {
    const scriptJudged = { ...questIn('review', SCRIPT), verifier: BRANN };
    expect(refused(fire(scriptJudged, 'verdict_pass', 'steward'))).toEqual({
      code: 'invalid_quest',
      issues: ['verifier: a script-tier quest is judged by the machine, never by a character'],
    });
    const sessionScripted: Quest = {
      ...questIn('open'),
      script: { id: 'run-check' as ScriptId, params: {} },
    };
    expect(refused(fire(sessionScripted, 'claim', 'steward'))?.code).toBe('invalid_quest');
  });

  it('refuses an event no row takes, and names the guards a row needed', () => {
    expect(refused(fire(questIn('archived'), 'confirm', 'user'))).toEqual({
      code: 'no_transition',
      from: 'archived',
      event: 'confirm',
    });
    expect(refused(fire(questIn('review', SCRIPT), 'assign_verifier', 'steward'))).toEqual({
      code: 'guard_failed',
      from: 'review',
      event: 'assign_verifier',
      guards: ['needs_verifier'],
    });
  });

  it('refuses an actor the row does not list, and one that holds no role', () => {
    expect(refused(fire(questIn('open'), 'claim', 'user'))).toEqual({
      code: 'actor_not_allowed',
      actor: 'user',
      allowed: ['steward'],
    });
    expect(refused(fire(questIn('review'), 'verdict_pass', 'verifier'))).toEqual({
      code: 'actor_not_holding',
      actor: 'verifier',
    });
    const noAssignee = { ...questIn('working'), assignee: null };
    expect(refused(fire(noAssignee, 'ask', 'runner'))).toEqual({
      code: 'actor_not_holding',
      actor: 'runner',
    });
  });

  it('refuses a claim that does not fit the tier', () => {
    const reason = { code: 'invalid_event', reason: 'assignee_for_tier' };
    expect(refused(fire(questIn('open'), 'claim', 'steward', { assignee: null }))).toEqual(reason);
    expect(refused(fire(questIn('open', SCRIPT), 'claim', 'steward', { assignee: THORN }))).toEqual(reason);
  });

  it('refuses a result the quest schema rejects, such as a time without an offset', () => {
    const error = refused(fire(questIn('open'), 'cancel', 'user', { at: '2026-11-06 10:00' }));
    expect(error?.code).toBe('invalid_result');
    expect(error).toMatchObject({ issues: [expect.stringMatching(/^updated_at: /)] });
  });
});
