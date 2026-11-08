// The review helpers on their own, over a stub of the tick's context: the paths a whole Steward rarely takes (a quest
// gone from the files, a kind without a ritual, a verdict the store refuses, a fail without fail_kind, checks that
// cannot run or have not ended).
import { CharacterSchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { characterOf } from '../__fixtures__/kingdom.ts';
import { createBackground } from '../background.ts';
import { judged, levelAfterVerdict, moveOnVerdict, recordVerdict, ritualOf } from '../verdicts.ts';
import { startChecks } from './checks.ts';
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
  deliverable: { type: 'branch' },
  attempt_log: [],
  secrets_required: [],
} as unknown as Quest;
const territory = { id: 'dc1-se-team', secrets_allowed: ['npm_token'] } as unknown as Territory;

interface Stub {
  readonly ctx: Context;
  readonly warnings: string[];
}

interface StubWorld {
  quests?: Quest[];
  territories?: Territory[];
  rituals?: boolean;
  checks?: boolean;
  /** A treasury that lists npm_token but cannot hand it over (the file changed between the two reads). */
  treasury?: 'unreadable';
  /** The event log refuses every line. */
  lines?: 'refused';
}

function stub(world: StubWorld = {}): Stub {
  const warnings: string[] = [];
  const log = { warn: (message: string) => void warnings.push(message) };
  const note = () =>
    world.lines === 'refused' ? Promise.reject(new Error('EACCES: events')) : Promise.resolve();
  const ctx = {
    background: createBackground(log),
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
      log,
      plots: {
        check: () =>
          world.checks === true ? Promise.resolve([]) : Promise.reject(new Error('git is not found')),
      },
      treasury: {
        names: () => Promise.resolve(['npm_token']),
        resolve: () =>
          world.treasury === 'unreadable'
            ? Promise.reject(new Error('treasury changed'))
            : Promise.resolve({ npm_token: 'x' }),
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
    record: { stamp: () => '2026-11-07T10:00:00+07:00', note },
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
    // No verdict without ended checks (P1-25: planTick names the quest only once they ended).
    expect(await machineReview(stub({ quests: [quest] }).ctx, QUEST)).toEqual({
      ok: false,
      error: 'checks_not_ready',
    });
    const noRitual = stub({ quests: [quest], territories: [territory], rituals: false, checks: true });
    expect(await startChecks(noRitual.ctx, QUEST)).toEqual({ ok: true, value: undefined });
    await noRitual.ctx.background.idle();
    expect(noRitual.ctx.background.view()).toEqual({ running: [], checked: [QUEST] });
    expect(await machineReview(noRitual.ctx, QUEST)).toEqual({ ok: false, error: 'unknown_ritual' });
  });

  it('say why checks cannot start, and leave nothing to take when they cannot run (P1-25)', async () => {
    expect(await startChecks(stub().ctx, QUEST)).toEqual({ ok: false, error: 'unknown_quest' });
    expect(await startChecks(stub({ quests: [quest] }).ctx, QUEST)).toEqual({
      ok: false,
      error: 'unknown_territory',
    });
    const broken = stub({ quests: [quest], territories: [territory] });
    expect((await startChecks(broken.ctx, QUEST)).ok).toBe(true);
    expect(broken.ctx.background.view()).toEqual({ running: [QUEST], checked: [] });
    await broken.ctx.background.idle();
    // Nothing waits for a judge: the next tick starts them again.
    expect(broken.ctx.background.view()).toEqual({ running: [], checked: [] });
    expect(broken.warnings).toEqual([`steward: ${QUEST}: the checks did not run: git is not found`]);
  });

  it('start no checks without the secrets a moment later, and run them whatever the log refuses (P1-10b)', async () => {
    const asking: Quest = { ...quest, secrets_required: ['npm_token'] };
    const changed = stub({ quests: [asking], territories: [territory], treasury: 'unreadable' });
    expect(await startChecks(changed.ctx, QUEST)).toEqual({ ok: false, error: 'secrets_unread' });
    expect(changed.ctx.background.view()).toEqual({ running: [], checked: [] });
    expect(changed.warnings).toEqual([`steward: ${QUEST}: no secrets for the checks: treasury changed`]);

    const mute = stub({ quests: [asking], territories: [territory], checks: true, lines: 'refused' });
    expect(await startChecks(mute.ctx, QUEST)).toEqual({ ok: true, value: undefined });
    await mute.ctx.background.idle();
    expect(mute.ctx.background.view()).toEqual({ running: [], checked: [QUEST] });
    expect(mute.warnings).toEqual([
      `steward: ${QUEST}: no check.start line: EACCES: events`,
      `steward: ${QUEST}: no check.end line: EACCES: events`,
    ]);
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
