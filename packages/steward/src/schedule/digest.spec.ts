// The digest (PS-03, implementation-plan §3.16.3): a scheduled job of the tick, no model. Once a day at
// kingdom.schedule.digest.at, whatever the clock does; the port writes the file, the Steward the line and the bell.
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import { carriedRedHistory } from './__fixtures__/carried-red.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { Digest, DigestRequest, Steward } from '../types.ts';
import {
  EVENT_VERSION,
  EventSchema,
  MemoSchema,
  QuestSchema,
  TerritoryIdSchema,
  TerritorySchema,
} from '@elvaria/domain';
import type { Event } from '@elvaria/domain';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const lines = async (kingdom: Bench): Promise<readonly Event[]> =>
  (await openEventLog(kingdom.root).read()).events;
const ofType = async (kingdom: Bench, type: string) =>
  (await lines(kingdom)).filter((event) => event.type === type).map(({ data }) => data);

/** A port that keeps what it was asked and names the file as apps/cli does; `fail` makes the next write throw. */
function recordingPort(): Digest & { readonly asked: DigestRequest[]; fail: boolean } {
  const port = {
    asked: [] as DigestRequest[],
    fail: false,
    write: (request: DigestRequest) => {
      if (port.fail) return Promise.reject(new Error('disk full'));
      port.asked.push(request);
      return Promise.resolve(`digest/${request.day}.md`);
    },
  };
  return port;
}

async function open(port: Digest) {
  // The bench's clock reads 09:00 on 2026-11-07: past the default 08:00.
  current = await bench({ cast: [{ id: 'thorn', cls: 'knight', level: 5 }] });
  running = current.steward({ digest: port });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

const MEMO = MemoSchema.parse({
  version: 1,
  id: 'm_20261107_4k2pqz',
  kind: 'proposal',
  from: 'thorn',
  quest: 'q_20261107_7pzkfv',
  attempt: 1,
  to: { route: 'chancellor' },
  body: 'The list prints times in UTC.',
  refs: [],
  state: 'open',
  filed_at: '2026-11-07T08:30:00+07:00',
});

/** History predates today's digest: rolling alerts must not stop at the previous digest. */
const narrowHistory = (): Event[] =>
  Array.from({ length: 12 }, (_, n) => {
    const quest = `q_20261106_${String(n).padStart(6, '0')}`;
    const envelope = {
      v: EVENT_VERSION,
      ts: '2026-11-06T09:00:00+07:00',
      actor: { kind: 'steward' },
    };
    return [
      EventSchema.parse({
        ...envelope,
        id: `01JC00000000000000000001${String(n).padStart(2, '0')}`,
        type: 'delivery.merged',
        data: {
          territory: 'dc1-se-team',
          quest,
          branch: `quest/${quest}`,
          head: 'a'.repeat(40),
          merge_sha: 'b'.repeat(40),
          method: 'merge',
          sealed: true,
          branch_deleted: true,
          pr: { number: n + 1, url: 'https://github.com/o/r/pull/1' },
        },
      }),
      EventSchema.parse({
        ...envelope,
        id: `01JC00000000000000000002${String(n).padStart(2, '0')}`,
        type: 'check.attributed',
        data: {
          territory: 'dc1-se-team',
          culprit: quest,
          source: 'patrol',
          checks: ['unit'],
          runs: [],
          cause: n < 2 ? 'own_change' : 'flaky',
        },
      }),
    ];
  }).flat();

describe('the digest', () => {
  it.each(['2026-11-07', '2026-11-06', undefined])(
    'includes only today’s carried regressions (%s)',
    async (day) => {
      const port = recordingPort();
      current = await bench({ cast: [] });
      if (day !== undefined) {
        await openEventLog(current.root).append(carriedRedHistory(day));
      }
      running = current.steward({ digest: port });
      expect(await running.start({ loop: false })).toEqual({ ok: true });
      await running.tick();
      expect(port.asked).toHaveLength(1);
      if (day === '2026-11-07') expect(port.asked[0]).toHaveProperty('carried_red', 1);
      else expect(port.asked[0]).not.toHaveProperty('carried_red');
    },
  );

  it.each(['2026-11-07', '2026-11-06', undefined])('counts only heals due today (%s)', async (day) => {
    const port = recordingPort();
    current = await bench({ cast: [] });
    if (day !== undefined) {
      const entry = {
        n: 1,
        character: 'thorn',
        role: 'assignee',
        started_at: `${day}T08:00:00+07:00`,
        ended_at: `${day}T08:10:00+07:00`,
        run_dir: '.runs/q_20261107_7pzkfv-1',
      };
      const quest = QuestSchema.parse({
        version: 1,
        id: 'q_20261107_7pzkfv',
        title: 'Healed quest',
        description: 'Digest heal evidence.',
        kind: 'build',
        rank: 'E',
        territory: 'dc1-se-team',
        class_required: 'knight',
        tags: [],
        status: 'archived',
        tier: 'session',
        assignee: 'thorn',
        verifier: null,
        budget: { max_minutes: 45, max_tokens: 400000, max_attempts: 3 },
        estimate: { tokens: 200000, minutes: 30 },
        attempts: 1,
        attempt_log: [
          { ...entry, heal: 'due', outcome: 'breaker' },
          { ...entry, character: 'sage', heal: 'session', outcome: 'submitted' },
        ],
        plot: { type: 'none' },
        deliverable: { type: 'branch' },
        seal_required: false,
        created_by: 'user',
        created_at: entry.started_at,
        updated_at: entry.ended_at,
      });
      expect((await current.store.quests.write(quest)).ok).toBe(true);
    }
    running = current.steward({ digest: port });
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await running.tick();
    expect(port.asked).toHaveLength(1);
    if (day === '2026-11-07') expect(port.asked[0]).toHaveProperty('heals', { total: 1, healed: 1 });
    else expect(port.asked[0]).not.toHaveProperty('heals');
  });

  it('recommends full checks when narrow escapes exceed one in ten recent merges', async () => {
    const port = recordingPort();
    current = await bench({ cast: [] });
    const code = await current.store.territories.read(TerritoryIdSchema.parse('dc1-se-team'));
    if (!code.ok) throw new Error('fixture: territory');
    await current.store.territories.write(
      TerritorySchema.parse({
        ...code.value,
        check_policy: { mode: 'narrow' },
      }),
    );
    await openEventLog(current.root).append(narrowHistory());
    running = current.steward({ digest: port });
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await running.tick();
    expect(port.asked[0]?.items.filter(({ kind }) => kind === 'narrow_escapes')).toEqual([
      {
        kind: 'narrow_escapes',
        territory: 'dc1-se-team',
        merges: 12,
        escapes: 2,
        group: 'can_wait',
        advice: 'consider_full',
        command: ['metrics'],
      },
    ]);
  });

  it('is written once a day, rung once, and never again that day however the clock or the Steward moves', async () => {
    const port = recordingPort();
    const { kingdom, steward } = await open(port);
    await steward.tick();
    await steward.tick();
    expect(port.asked.map(({ day }) => day)).toEqual(['2026-11-07']);
    expect(await ofType(kingdom, 'digest.written')).toEqual([
      { day: '2026-11-07', file: 'digest/2026-11-07.md', must: 0, can_wait: 0 },
    ]);
    expect(await ofType(kingdom, 'schedule.ran')).toEqual([{ job: 'digest', day: '2026-11-07' }]);
    expect(kingdom.notices.filter(({ kind }) => kind === 'digest')).toEqual([
      { kind: 'digest', day: '2026-11-07', file: 'digest/2026-11-07.md', must: 0, can_wait: 0 },
    ]);
    // The clock goes back before 08:00, then forward past it; a new Steward reads the day from the log.
    kingdom.clock.advance(-120);
    await steward.tick();
    kingdom.clock.advance(180);
    await steward.stop();
    running = kingdom.steward({ digest: port });
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await running.tick();
    expect(port.asked).toHaveLength(1);
    // The next morning, one more.
    kingdom.clock.advance(24 * 60);
    await running.tick();
    expect(port.asked.map(({ day }) => day)).toEqual(['2026-11-07', '2026-11-08']);
  });

  it('lists what waits in its two groups, each item with its command', async () => {
    const port = recordingPort();
    const { kingdom, steward } = await open(port);
    // Nobody of the cast is a scribe: the quest waits for one (`unclaimable`); the memo waits for a decision.
    await kingdom.store.memos.write(MEMO);
    await kingdom.command(
      'create_quest',
      questPayload('No scribe', { kind: 'document', class_required: 'scribe' }),
    );
    await steward.tick();
    const [request] = port.asked;
    const quest = await kingdom.quest('No scribe');
    expect(request?.items.map(({ group, kind, command }) => [group, kind, command.join(' ')])).toEqual([
      ['must', 'unclaimable', `quest show ${quest.id}`],
      ['can_wait', 'memo', `memo show ${MEMO.id}`],
    ]);
    expect(await ofType(kingdom, 'digest.written')).toMatchObject([{ must: 1, can_wait: 1 }]);
  });

  it('runs no model, and a port that fails tries again at the next start, not at every tick', async () => {
    const port = recordingPort();
    port.fail = true;
    const { kingdom, steward } = await open(port);
    await steward.tick();
    await steward.tick();
    expect(kingdom.warnings.filter((line) => line.includes('scheduled digest failed'))).toHaveLength(1);
    expect(await ofType(kingdom, 'schedule.ran')).toEqual([]);
    expect(kingdom.requests).toEqual([]);
    port.fail = false;
    await steward.stop();
    running = kingdom.steward({ digest: port });
    await running.start({ loop: false });
    await tickUntil(running, kingdom.clock, () => Promise.resolve(port.asked.length === 1));
    expect(await ofType(kingdom, 'schedule.ran')).toHaveLength(1);
  });

  it('offers the newer build the composition root reads as the digest is made (PS-08d)', async () => {
    const port = recordingPort();
    current = await bench({ cast: [{ id: 'thorn', cls: 'knight', level: 5 }] });
    const offer = { pinned: 'a'.repeat(40), latest: 'b'.repeat(40), commits: 2 };
    running = current.steward({ digest: port, upgradeOffer: () => Promise.resolve(offer) });
    await running.start({ loop: false });
    await running.tick();
    expect(port.asked[0]?.items).toEqual([
      { kind: 'upgrade_available', group: 'can_wait', advice: 'upgrade', command: ['upgrade'], ...offer },
    ]);
  });
});
