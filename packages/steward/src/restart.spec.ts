// A Steward that starts finishes what the last one left half done (P1-44). A session that went with the last Steward
// costs no attempt (P1-37 (c): two kills of the Steward cost a quest two attempts), and a judge lost so counts toward
// no stalled review. A review the last Steward left stalled, without its move to the infirmary, goes there at once
// (P1-42 (a)); a review the owner retried gets its new judge.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { PASS, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { restartFromLog } from './restart.ts';
import { SESSIONS_FILE } from './sessions/pids.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward, StewardDeps } from './types.ts';
import type { Event, Quest } from '@elvaria/domain';

let current: Bench | undefined;
const stewards: Steward[] = [];

afterEach(async () => {
  for (const steward of stewards.splice(0)) await steward.stop();
  await current?.remove();
  current = undefined;
});

/** No process ever has this pid (breakers.spec.ts): the session's process died with its Steward. */
const NO_SUCH_PID = 2_147_483_647;
const NOTHING = { verdict: 'looks fine' };
const PARTIAL = { result: 'partial', progress: { checked_until: 'src/api/orders.ts' } };

async function started(kingdom: Bench, overrides: Partial<StewardDeps> = {}): Promise<Steward> {
  const steward = kingdom.steward(overrides);
  stewards.push(steward);
  expect(await steward.start({ loop: false })).toEqual({ ok: true });
  return steward;
}

async function stopped(steward: Steward): Promise<void> {
  stewards.splice(stewards.indexOf(steward), 1);
  await steward.stop();
}

const runsOf = (quest: Quest) => quest.attempt_log.map(({ n, role, outcome }) => [n, role, outcome]);
const judgesOf = (quest: Quest) =>
  quest.attempt_log.filter(({ role }) => role === 'verifier').map(({ outcome }) => outcome);
const statusIs = (kingdom: Bench, title: string, status: Quest['status']) => async () =>
  (await kingdom.quest(title)).status === status;

describe('a session that went with the last Steward', () => {
  it('costs no attempt: the same character goes on in a fresh session from its letter', async () => {
    const kingdom = (current = await bench({ plays: { work: { 'Hangs on': ['hang', 'submit'] } } }));
    await kingdom.command('create_quest', questPayload('Hangs on'));
    const first = await started(kingdom);
    await tickUntil(first, kingdom.clock, statusIs(kingdom, 'Hangs on', 'working'));
    const before = await kingdom.quest('Hangs on');
    expect(before.attempts).toBe(1);
    const doer = before.assignee ?? '';
    await stopped(first);
    // A killed Steward leaves its record behind, naming a process that is gone by now.
    const spawnedAt = before.attempt_log[0]?.started_at;
    const sessions = [
      { quest: before.id, role: 'assignee', character: doer, pid: NO_SUCH_PID, spawned_at: spawnedAt },
    ];
    await writeFile(path.join(kingdom.root, SESSIONS_FILE), JSON.stringify({ version: 1, sessions }));

    const second = await started(kingdom);
    await second.tick();
    const after = await kingdom.quest('Hangs on');
    expect(after).toMatchObject({ status: 'working', assignee: doer, attempts: 1 });
    expect(runsOf(after)).toEqual([
      [1, 'assignee', 'cancelled'],
      [2, 'assignee', undefined],
    ]);
    const types = (await openEventLog(kingdom.root).read()).events.map(({ type }) => type);
    expect(types.slice(-2)).toEqual(['quest.returned', 'quest.started']);
    const revived = kingdom.requests.filter((req) => req.quest?.id === before.id && req.role === 'assignee');
    expect(revived.at(-1)?.prompt.user).toContain('# Picking up the quest');
    expect(kingdom.warnings.join('\n')).toContain(
      `${doer}'s session was lost with the last Steward; the run does not count`,
    );
    await tickUntil(second, kingdom.clock, statusIs(kingdom, 'Hangs on', 'done'));
    expect((await kingdom.quest('Hangs on')).attempts).toBe(1);
  });

  it('of a judge leaves the review to the next one, and counts toward no stalled review', async () => {
    const kingdom = (current = await bench({
      plays: { verdicts: { 'Judged across': [NOTHING, PASS, PASS] } },
    }));
    await kingdom.command('create_quest', questPayload('Judged across'));
    const first = await started(kingdom);
    // The first judge hands in nothing (one of the two the run may lose so); the second is cut by the stop.
    await tickUntil(first, kingdom.clock, async () => {
      const quest = await kingdom.quest('Judged across');
      return judgesOf(quest).length === 2 && quest.verifier !== null;
    });
    await stopped(first);

    const second = await started(kingdom);
    await tickUntil(second, kingdom.clock, statusIs(kingdom, 'Judged across', 'done'));
    expect(judgesOf(await kingdom.quest('Judged across'))).toEqual(['crash', 'cancelled', 'submitted']);
    expect(kingdom.notices.filter(({ kind }) => kind === 'infirmary')).toEqual([]);
  });
});

/** A store whose writes of a quest into the infirmary fail: the Steward stops between the two moves of a stall. */
function failingInfirmary(kingdom: Bench): Partial<StewardDeps> {
  const { quests } = kingdom.store;
  const write: typeof quests.write = (quest) =>
    quest.status === 'infirmary'
      ? Promise.resolve({
          ok: false,
          error: { code: 'locked', file: `quests/${quest.id}.json`, message: 'held' },
        })
      : quests.write(quest);
  return { store: { ...kingdom.store, quests: { ...quests, write } } };
}

describe('a review the last Steward left stalled', () => {
  it.each([
    ['no judge hands in a verdict', [NOTHING, NOTHING, PASS], 2, 'no_verdict', { verifiers_stopped: 2 }],
    [
      'judges only read in part',
      [PARTIAL, PARTIAL, PARTIAL, PASS],
      3,
      'partial_verdicts',
      { partial_verdicts: 3 },
    ],
  ] as const)(
    'goes to the infirmary at the next start when %s',
    async (_, verdicts, judges, trip, detail) => {
      const kingdom = (current = await bench({ plays: { verdicts: { 'Left stalled': verdicts } } }));
      await kingdom.command('create_quest', questPayload('Left stalled'));
      const first = await started(kingdom, failingInfirmary(kingdom));
      await tickUntil(first, kingdom.clock, async () => {
        const quest = await kingdom.quest('Left stalled');
        return judgesOf(quest).length === judges && quest.verifier === null;
      });
      await stopped(first);
      expect(await kingdom.quest('Left stalled')).toMatchObject({ status: 'review', verifier: null });

      const second = await started(kingdom);
      await second.tick();
      expect(await kingdom.quest('Left stalled')).toMatchObject({ status: 'infirmary', verifier: null });
      expect(kingdom.notices.at(-1)).toMatchObject({
        kind: 'infirmary',
        trip,
        detail,
        reason: {
          code: `restart:${trip}`,
          params: trip === 'partial_verdicts' ? { count: 3 } : { stopped: 2 },
        },
      });
      // No further judge opens while the quest waits for the owner.
      for (let tick = 0; tick < 3; tick += 1) {
        kingdom.clock.advance(1);
        await second.tick();
      }
      expect(judgesOf(await kingdom.quest('Left stalled'))).toHaveLength(judges);
      expect(second.running()).toBe(0);
    },
  );

  it.each(['timeout', 'breaker'] as const)('recovers a review stopped by %s', async (outcome) => {
    const kingdom = (current = await bench({ plays: { verdicts: { Interrupted: [NOTHING, NOTHING] } } }));
    await kingdom.command('create_quest', questPayload('Interrupted'));
    const first = await started(kingdom, failingInfirmary(kingdom));
    await tickUntil(first, kingdom.clock, async () => {
      const quest = await kingdom.quest('Interrupted');
      return judgesOf(quest).length === 2 && quest.verifier === null;
    });
    await stopped(first);
    const quest = await kingdom.quest('Interrupted');
    const attempt_log = quest.attempt_log.map((entry) => {
      return entry.role === 'verifier' ? { ...entry, outcome } : entry;
    });
    expect((await kingdom.store.quests.write({ ...quest, attempt_log })).ok).toBe(true);
    const second = await started(kingdom);
    await second.tick();
    expect(kingdom.notices.at(-1)).toMatchObject({
      reason: { code: outcome === 'timeout' ? 'restart:time' : 'restart:tokens', params: { stopped: 2 } },
    });
  });

  it('is judged again when the owner retried it before the stop', async () => {
    const kingdom = (current = await bench({ plays: { verdicts: { Retried: [NOTHING, NOTHING, PASS] } } }));
    await kingdom.command('create_quest', questPayload('Retried'));
    const first = await started(kingdom);
    await tickUntil(first, kingdom.clock, statusIs(kingdom, 'Retried', 'infirmary'));
    const quest = await kingdom.quest('Retried');
    await kingdom.command('retry', { quest: quest.id });
    kingdom.clock.advance(1);
    await first.tick();
    // Stopped while the new judge's checks run: the file looks as if the move to the infirmary was never made.
    expect(await kingdom.quest('Retried')).toMatchObject({ status: 'review', verifier: null });
    await stopped(first);

    const second = await started(kingdom);
    await tickUntil(second, kingdom.clock, statusIs(kingdom, 'Retried', 'done'));
    expect(judgesOf(await kingdom.quest('Retried'))).toEqual(['crash', 'crash', 'submitted']);
    expect(kingdom.notices.filter(({ kind }) => kind === 'infirmary')).toHaveLength(1);
  });
});

describe('restartFromLog', () => {
  const line = (quest: string, type: string, kind = 'steward') =>
    ({ quest, type, actor: { kind }, data: {} }) as unknown as Event;

  it("names the quests whose last move is the owner's retry, or the infirmary it left", () => {
    const { retried } = restartFromLog([
      line('q_a', 'quest.infirmary'),
      line('q_a', 'quest.submitted', 'user'),
      line('q_a', 'quest.edited', 'user'),
      line('q_b', 'quest.verdict'),
      line('q_c', 'quest.infirmary'),
      line('q_d', 'quest.submitted', 'character'),
      line('q_e', 'quest.infirmary'),
      line('q_e', 'quest.submitted', 'user'),
      line('q_e', 'quest.started'),
      { type: 'command.applied', actor: { kind: 'steward' }, data: {} } as unknown as Event,
    ]);
    expect([...retried].sort()).toEqual(['q_a', 'q_c']);
  });
});
