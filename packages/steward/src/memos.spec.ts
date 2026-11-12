// Memos (PS-02, implementation-plan §3.16.2, ADR 0024): what an assignee writes in the Memos section of its letter
// becomes memos/<id>.json and memo.filed when the run ends through a submit, a question or a crash, routed to the
// Chancellor; reading the letter again files nothing twice; a line that follows no memo is a warning and the run's end
// stands; no memo moves a quest. The owner closes a memo with decide_memo. FakeRunners whose assignee rewrites its
// letter as its session ends, before the Steward settles it.
import { writeFile } from 'node:fs/promises';

import { openEventLog } from '@elvaria/eventlog';
import type { Event, Memo } from '@elvaria/domain';
import type { AgentRunner, RunResult, SpawnRequest } from '@elvaria/runner-core';
import { afterEach, describe, expect, it } from 'vitest';

import { FAIL, PASS, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { statusIs } from './__fixtures__/review.ts';
import type { Bench, Plays } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** The letter of an assignee's session, by quest title and the session's place among that quest's assignee runs. */
type Letters = (title: string, nth: number) => string | undefined;
/** What the session's end says instead, by quest title (a breaker's cut). */
type Ends = (title: string) => Partial<RunResult> | undefined;

const letter = (memos: string) =>
  `## Where I am\n\nXong.\n\n## Next step\n\nNộp.\n\n## Memos\n\n${memos}\n\n## Question\n`;

function writing(runner: AgentRunner, letters: Letters, ends: Ends): AgentRunner {
  const seen = new Map<string, number>();
  return {
    ...runner,
    spawn: async (req: SpawnRequest) => {
      const session = await runner.spawn(req);
      if (req.role !== 'assignee' || req.handover === undefined) return session;
      const title = req.quest?.title ?? '';
      const nth = (seen.get(title) ?? 0) + 1;
      seen.set(title, nth);
      const handover = req.handover;
      return {
        ...session,
        wait: async () => {
          const result = await session.wait();
          const text = letters(title, nth);
          if (text !== undefined) await writeFile(handover, text, 'utf8');
          return { ...result, ...ends(title) };
        },
      };
    },
  };
}

async function open(plays: Plays, letters: Letters, ends: Ends = () => undefined) {
  current = await bench({ plays });
  const runners = {
    claude: writing(current.runners.claude, letters, ends),
    gemini: writing(current.runners.gemini, letters, ends),
  };
  running = current.steward({ runners });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

const memosOf = async (kingdom: Bench): Promise<readonly Memo[]> => (await kingdom.store.memos.list()).items;
const linesOf = async (kingdom: Bench): Promise<readonly Event[]> =>
  (await openEventLog(kingdom.root).read()).events;

const LIST_UTC =
  '- proposal: `quest list` in giờ UTC; nên dùng múi giờ của vương quốc. refs: apps/cli/src/quest/list.ts';

describe('memos from the letter', () => {
  it('files each memo as the run is handed in, routed to the Chancellor, and warns of the lines it leaves out', async () => {
    const lines = [LIST_UTC, 'Also the README.', '- gossip: the judge is slow.'].join('\n');
    const { kingdom, steward } = await open({}, () => letter(lines));
    await kingdom.command('create_quest', questPayload('Letters'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Letters', 'done'));
    const quest = await kingdom.quest('Letters');
    const [memo, ...more] = await memosOf(kingdom);
    expect(more).toEqual([]);
    expect(memo).toMatchObject({
      kind: 'proposal',
      from: quest.assignee,
      quest: quest.id,
      attempt: 1,
      to: { route: 'chancellor' },
      body: '`quest list` in giờ UTC; nên dùng múi giờ của vương quốc.',
      refs: ['apps/cli/src/quest/list.ts'],
      state: 'open',
    });
    expect(memo?.id).toMatch(new RegExp(`^m_${quest.id.slice(2, 10)}_`));
    const events = await linesOf(kingdom);
    const types = events.map(({ type }) => type);
    // Filed before the move it came with, by the character who wrote it; routed by the Steward.
    expect(types.indexOf('memo.filed')).toBeLessThan(types.indexOf('quest.submitted'));
    expect(events.find(({ type }) => type === 'memo.filed')).toMatchObject({
      actor: { kind: 'character', id: quest.assignee },
      quest: quest.id,
      data: { memo: memo?.id, kind: 'proposal', from: quest.assignee },
    });
    expect(events.find(({ type }) => type === 'memo.routed')).toMatchObject({
      actor: { kind: 'steward' },
      data: { memo: memo?.id, route: 'chancellor' },
    });
    expect(kingdom.warnings.join('\n')).toContain('follows no memo and is left out: Also the README.');
    expect(kingdom.warnings.join('\n')).toContain('no memo kind "gossip"');
  });

  it('files a memo kept in the next letter once, and tells the next session what was filed', async () => {
    // The second letter keeps the memo with other spaces and capitals: the same matter, the same id.
    const again = LIST_UTC.replace('UTC;', 'utc;  ');
    const plays = { verdicts: { Twice: [FAIL, PASS] } };
    const { kingdom, steward } = await open(plays, (_, nth) => letter(nth === 1 ? LIST_UTC : again));
    await kingdom.command('create_quest', questPayload('Twice'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Twice', 'done'));
    const memos = await memosOf(kingdom);
    expect(memos.map(({ attempt }) => attempt)).toEqual([1]);
    expect((await linesOf(kingdom)).filter(({ type }) => type === 'memo.filed')).toHaveLength(1);
    const second = kingdom.requests.filter(({ role }) => role === 'assignee')[1];
    expect(second?.prompt.user).toContain('## Memos already filed');
    expect(second?.prompt.user).toContain(`\`${memos[0]?.id}\` (proposal, open)`);
  });

  it('files the memos of a crash and of a question, never those of a run a breaker cut', async () => {
    const plays = { work: { Crashes: ['crash' as const], Asks: ['ask' as const] } };
    const ends: Ends = (title) => (title === 'Cut' ? { outcome: 'max_turns' } : undefined);
    const { kingdom, steward } = await open(
      plays,
      (title) => letter(`- proposal: ${title} found work.`),
      ends,
    );
    for (const title of ['Crashes', 'Asks', 'Cut'])
      await kingdom.command('create_quest', questPayload(title));
    const cut = async () =>
      (await kingdom.quest('Cut')).attempt_log.some(({ outcome }) => outcome === 'breaker');
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusIs(kingdom, 'Asks', 'blocked')()) && (await cut()),
    );
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Crashes', 'done'));
    const filed = await memosOf(kingdom);
    const byQuest = async (title: string) => {
      const { id } = await kingdom.quest(title);
      return filed.filter(({ quest }) => quest === id);
    };
    expect((await byQuest('Crashes')).map(({ attempt, body }) => [attempt, body])).toEqual([
      [1, 'Crashes found work.'],
    ]);
    expect((await byQuest('Asks')).map(({ body }) => body)).toEqual(['Asks found work.']);
    expect(await byQuest('Cut')).toEqual([]);
  });
});

describe('decide_memo', () => {
  const reasons = async (kingdom: Bench, ids: readonly string[]) => {
    const events = await linesOf(kingdom);
    return ids.map((id) => {
      const answer = events.find(({ data }) => data.command_id === id);
      return answer?.type === 'command.applied' ? 'applied' : answer?.data.reason;
    });
  };

  it("closes a memo once on the owner's decision, and moves no quest", async () => {
    const { kingdom, steward } = await open({}, () => letter(LIST_UTC));
    await kingdom.command('create_quest', questPayload('Letters'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Letters', 'done'));
    const quest = await kingdom.quest('Letters');
    const [memo] = await memosOf(kingdom);
    const id = memo!.id;
    const sent = [
      await kingdom.command('decide_memo', { memo: 'm_20261107_000000', decision: 'shelved' }),
      await kingdom.command('decide_memo', { memo: id, decision: 'handled', quest: 'q_20261107_zzzzzz' }),
      await kingdom.command('decide_memo', {
        memo: id,
        decision: 'handled',
        quest: quest.id,
        note: 'Đã gộp.',
      }),
      await kingdom.command('decide_memo', { memo: id, decision: 'rejected' }),
    ];
    await steward.tick();
    expect(await reasons(kingdom, sent)).toEqual(['unknown_memo', 'unknown_quest', 'applied', 'memo_closed']);
    const read = await kingdom.store.memos.read(id);
    expect(read.ok && read.value).toMatchObject({
      state: 'closed',
      outcome: { decision: 'handled', quest: quest.id, note: 'Đã gộp.' },
    });
    expect((await linesOf(kingdom)).filter(({ type }) => type === 'memo.closed')).toEqual([
      expect.objectContaining({
        actor: { kind: 'user' },
        quest: quest.id,
        data: { memo: id, decision: 'handled', quest: quest.id },
      }),
    ]);
    expect(await kingdom.quest('Letters')).toEqual(quest);
  });
});
