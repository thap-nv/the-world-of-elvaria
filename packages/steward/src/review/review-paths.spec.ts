// The review helpers on their own, over a stub of the tick's context: the paths a whole Steward rarely takes (a quest
// gone from the files, a kind without a ritual, a verdict the store refuses, a fail without fail_kind).
import { CharacterSchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { characterOf } from '../__fixtures__/kingdom.ts';
import { judged, levelAfterVerdict, moveOnVerdict, recordVerdict, ritualOf } from '../verdicts.ts';
import { machineReview } from './machine.ts';
import type { Context } from '../context.ts';
import type { Judged } from '../verdicts.ts';
import type { Quest, QuestId, Territory, Verdict } from '@elvaria/domain';

const QUEST = 'q_20261107_7k3m2a' as QuestId;
const quest = {
  id: QUEST,
  kind: 'build',
  territory: 'dc1-se-team',
  tags: ['backend'],
  plot: { type: 'none' },
  attempt_log: [],
} as unknown as Quest;
const territory = { id: 'dc1-se-team' } as unknown as Territory;

interface Stub {
  readonly ctx: Context;
  readonly warnings: string[];
}

function stub(
  world: { quests?: Quest[]; territories?: Territory[]; rituals?: boolean; checks?: boolean } = {},
): Stub {
  const warnings: string[] = [];
  const ctx = {
    world: {
      quests: new Map((world.quests ?? []).map((q) => [q.id, q])),
      territories: new Map((world.territories ?? []).map((t) => [t.id, t])),
      registry: {
        kinds: [{ id: 'build', ritual: 'build_review' }],
        rituals: world.rituals === false ? [] : [{ id: 'build_review', pass_rule: 'all_checks_and_agent' }],
      },
      characters: new Map(),
    },
    deps: {
      log: { warn: (message: string) => void warnings.push(message) },
      plots: {
        check: () =>
          world.checks === true ? Promise.resolve([]) : Promise.reject(new Error('git is not found')),
      },
      store: {
        verdicts: {
          write: () =>
            Promise.resolve({
              ok: false,
              error: { code: 'io', file: `verdicts/${QUEST}-1.json`, message: 'EACCES' },
            }),
        },
      },
    },
    record: { stamp: () => '2026-11-07T10:00:00+07:00', note: () => Promise.resolve() },
  } as unknown as Context;
  return { ctx, warnings };
}

describe('the review helpers', () => {
  it('find no ritual for a kind the registry does not tie to one', () => {
    expect(ritualOf(stub({ rituals: false }).ctx, quest)).toBeUndefined();
    expect(ritualOf(stub().ctx, quest)?.pass_rule).toBe('all_checks_and_agent');
  });

  it('say why a machine review cannot start', async () => {
    expect(await machineReview(stub().ctx, QUEST)).toEqual({ ok: false, error: 'unknown_quest' });
    expect(await machineReview(stub({ quests: [quest] }).ctx, QUEST)).toEqual({
      ok: false,
      error: 'unknown_territory',
    });
    const broken = stub({ quests: [quest], territories: [territory] });
    expect(await machineReview(broken.ctx, QUEST)).toEqual({ ok: false, error: 'checks_failed' });
    expect(broken.warnings).toEqual([`steward: ${QUEST}: the checks did not run: git is not found`]);
    const noRitual = stub({ quests: [quest], territories: [territory], rituals: false, checks: true });
    expect(await machineReview(noRitual.ctx, QUEST)).toEqual({ ok: false, error: 'unknown_ritual' });
  });

  it('write no line for a verdict the store refuses', async () => {
    const verdict = { id: `${QUEST}-1`, result: 'pass' } as unknown as Verdict;
    const written = await recordVerdict(stub().ctx, quest, verdict, { kind: 'steward' });
    expect(written).toEqual({ ok: false, error: `verdicts/${QUEST}-1.json: io (EACCES)` });
  });

  it('move a quest with no assignee on a verdict without touching any window', async () => {
    const { ctx } = stub({ quests: [quest] });
    const moving = {
      ...ctx,
      record: { ...ctx.record, move: () => Promise.resolve({ ok: true, value: quest }) },
    };
    const verdict = { id: `${QUEST}-1`, result: 'pass', by_human: false } as unknown as Judged;
    const moved = await moveOnVerdict(moving as unknown as Context, quest, verdict, {
      event: { type: 'verdict_pass' },
      actor: 'steward',
    });
    expect(moved).toEqual({ ok: true, value: quest });
  });

  it('lower a level the window no longer holds, and say so when the file refuses it', async () => {
    const failing = Array.from({ length: 5 }, (_, index) => ({
      verdict_id: `${QUEST}-${index + 1}`,
      result: 'fail',
      by_human: false,
      at: '2026-11-07T10:00:00+07:00',
    }));
    const kael = CharacterSchema.parse({
      ...characterOf({ id: 'kael', cls: 'knight' }),
      reputation: { window: failing },
    });
    const changes: string[] = [];
    const { ctx, warnings } = stub();
    const recording = {
      ...ctx,
      record: {
        ...ctx.record,
        change: (id: string, type: string) => {
          changes.push(`${id} ${type}`);
          return Promise.resolve({ ok: false, error: 'invalid_character' });
        },
      },
    } as unknown as Context;
    await levelAfterVerdict(recording, kael);
    expect(changes).toEqual(['kael character.level_down']);
    expect(warnings).toEqual(['steward: kael character.level_down: invalid_character']);
  });

  it("put a fail without fail_kind in the windows as `other`, the owner's verdict weighing as such", () => {
    const fail = { id: `${QUEST}-1-user`, result: 'fail', by_human: true } as unknown as Judged;
    const after = judged(quest, fail)(
      characterOf({ id: 'kael', cls: 'knight' }),
      '2026-11-07T10:00:00+07:00',
    );
    expect(after).toMatchObject({
      ok: true,
      value: {
        consecutive_fail: { fail_kind: 'other', count: 1 },
        reputation: { window: [{ by_human: true }] },
      },
    });
  });
});
