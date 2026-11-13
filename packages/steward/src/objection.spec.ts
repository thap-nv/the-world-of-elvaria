// Objections (PS-22, implementation-plan §3.16.2, ADR 0024, ADR 0008): an assignee whose run came back with a judge's
// fail writes an `objection` memo in its next letter; the Steward takes it to a second judge, never the first one nor
// anyone who worked the quest, who reads the contested verdict and the memo. Its verdict is final: a pass sends the
// quest on and spares the assignee the first fail, a fail sends it back with both notes. A second objection to the
// same verdict, and one against the final verdict, go to the owner's digest. With no second judge in the roster the
// quest waits as unjudgeable, until the owner summons one or decides the memo.
import { openEventLog } from '@elvaria/eventlog';
import type { Digest, DigestRequest } from './types.ts';
import type { Event, Memo, Verdict } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { FAIL, PASS, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { letter, writing } from './__fixtures__/letters.ts';
import { statusIs } from './__fixtures__/review.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Letters } from './__fixtures__/letters.ts';
import type { Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** A port that keeps the digests it was asked for. */
function recordingPort(): Digest & { readonly asked: DigestRequest[] } {
  const asked: DigestRequest[] = [];
  return {
    asked,
    write: (request) => {
      asked.push(request);
      return Promise.resolve(`digest/${request.day}.md`);
    },
  };
}

async function open(options: BenchOptions, letters: Letters, digest = recordingPort()) {
  current = await bench(options);
  const runners = {
    claude: writing(current.runners.claude, letters, () => undefined),
    gemini: writing(current.runners.gemini, letters, () => undefined),
  };
  running = current.steward({ runners, digest });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running, digest };
}

const OBJECTION =
  '- objection: Ghi chú sai: orders.spec.ts đã xanh ở commit 1a2b3c4. refs: src/api/orders.spec.ts';
const AGAIN = '- objection: Vẫn sai: test giảm giá đã có từ lượt trước. refs: src/api/orders.spec.ts';

const memosOf = async (kingdom: Bench): Promise<Memo[]> =>
  (await kingdom.store.memos.list()).items.toSorted((a, b) => a.filed_at.localeCompare(b.filed_at));
const linesOf = async (kingdom: Bench, type: string): Promise<Event[]> =>
  (await openEventLog(kingdom.root).read()).events.filter((event) => event.type === type);
const verdictOf = async (kingdom: Bench, id: string): Promise<Verdict | undefined> => {
  const read = await kingdom.store.verdicts.read(id as Verdict['id']);
  return read.ok ? read.value : undefined;
};
const assigneeRuns = (kingdom: Bench) => kingdom.requests.filter(({ role }) => role === 'assignee');
const judgeRuns = (kingdom: Bench) => kingdom.requests.filter(({ role }) => role === 'verifier');

describe('an objection to the verdict that sent the run back', () => {
  it('takes a second judge, whose pass sends the quest on and spares the assignee the first fail', async () => {
    const { kingdom, steward } = await open({ plays: { verdicts: { Contested: [FAIL, PASS] } } }, (_, nth) =>
      letter(nth === 2 ? OBJECTION : '-'),
    );
    await kingdom.command('create_quest', questPayload('Contested'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Contested', 'done'));
    const quest = await kingdom.quest('Contested');
    const [memo, ...others] = await memosOf(kingdom);
    expect(others).toEqual([]);
    const first = await verdictOf(kingdom, `${quest.id}-1`);
    const second = await verdictOf(kingdom, `${quest.id}-2`);
    // The knight works on Sonnet: orin (gemini) judges first; the objection takes sable, never orin again.
    expect(first).toMatchObject({ verifier_id: 'orin', result: 'fail' });
    expect(second).toMatchObject({
      verifier_id: 'sable',
      result: 'pass',
      objection: { memo: memo?.id, verdict: first?.id, judge: 'orin' },
    });
    expect(memo).toMatchObject({
      kind: 'objection',
      attempt: 2,
      to: { route: 'judge', verdict: first?.id },
      state: 'closed',
      outcome: { decision: 'sustained', verdict: second?.id },
    });
    expect(quest.objection).toBeUndefined();
    // No run of the assignee after the second judge's pass.
    expect(assigneeRuns(kingdom)).toHaveLength(2);
    const prompt = judgeRuns(kingdom)[1]?.prompt;
    expect(prompt?.user).toContain("# The assignee's objection");
    expect(prompt?.user).toContain('orders.spec.ts đã xanh ở commit 1a2b3c4');
    expect(prompt?.user).toContain(FAIL.notes);
    // The first judge is named nowhere in the second judge's session (ADR 0025).
    expect(`${prompt?.system ?? ''}\n${prompt?.user ?? ''}`).not.toMatch(/orin/i);
    expect(judgeRuns(kingdom)[0]?.prompt.user).not.toContain("# The assignee's objection");
    // The first fail left the assignee's books: its reputation holds the pass alone.
    const knight = await kingdom.character(String(quest.assignee));
    expect(knight.reputation.window.map(({ verdict_id: id }) => id)).toEqual([second?.id]);
    expect(knight.consecutive_fail).toEqual({ count: 0 });
    expect(await linesOf(kingdom, 'memo.closed')).toEqual([
      expect.objectContaining({
        actor: { kind: 'character', id: 'sable' },
        quest: quest.id,
        data: { memo: memo?.id, decision: 'sustained', verdict: second?.id },
      }),
    ]);
  });

  it('is final when the second judge fails it: both notes go back, and an objection to it goes to the digest', async () => {
    const plays = {
      verdicts: { Final: [FAIL, { ...FAIL, notes: 'Second judge: the discount test is still red.' }, PASS] },
    };
    const { kingdom, steward, digest } = await open({ plays }, (_, nth) =>
      letter(nth === 2 ? OBJECTION : nth === 3 ? AGAIN : '-'),
    );
    await kingdom.command('create_quest', questPayload('Final'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Final', 'done'));
    const quest = await kingdom.quest('Final');
    const [first, second] = await memosOf(kingdom);
    expect(first).toMatchObject({
      state: 'closed',
      outcome: { decision: 'overruled', verdict: `${quest.id}-2` },
    });
    expect(second).toMatchObject({
      attempt: 3,
      to: { route: 'owner', verdict: `${quest.id}-2`, refusal: 'final_verdict' },
      state: 'open',
    });
    expect((await linesOf(kingdom, 'memo.routed')).map(({ data }) => data)).toEqual([
      { memo: first?.id, route: 'judge' },
      { memo: second?.id, route: 'owner', refusal: 'final_verdict' },
    ]);
    // The third run reads the final verdict and the first beside it.
    const third = assigneeRuns(kingdom)[2]?.prompt.user ?? '';
    expect(third).toContain('## The first verdict');
    expect(third).toContain(FAIL.notes);
    expect(third).toContain('Second judge: the discount test is still red.');
    // Its review owes no second judge: the third verdict answers no objection.
    expect(await verdictOf(kingdom, `${quest.id}-3`)).not.toHaveProperty('objection');
    // Both fails stay in the assignee's books.
    const knight = await kingdom.character(String(quest.assignee));
    expect(knight.reputation.window.map(({ result }) => result)).toEqual(['fail', 'fail', 'pass']);
    // Tomorrow's digest lists the objection for the owner, and nothing of the one the judge settled.
    kingdom.clock.advance(24 * 60);
    await steward.tick();
    const items = digest.asked.at(-1)?.items.filter(({ memo }) => memo !== undefined);
    expect(items?.map(({ group, kind, command }) => [group, kind, command.join(' ')])).toEqual([
      ['can_wait', 'objection', `memo show ${second?.id}`],
    ]);
  });

  it('takes the first objection to a verdict to its judge, and a second one to the owner', async () => {
    const { kingdom, steward } = await open({ plays: { verdicts: { Twice: [FAIL, PASS] } } }, (_, nth) =>
      letter(nth === 2 ? `${OBJECTION}\n${AGAIN}` : '-'),
    );
    await kingdom.command('create_quest', questPayload('Twice'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Twice', 'done'));
    const quest = await kingdom.quest('Twice');
    const verdict = `${quest.id}-1`;
    expect((await memosOf(kingdom)).map(({ to, state }) => [to, state])).toEqual([
      [{ route: 'judge', verdict }, 'closed'],
      [{ route: 'owner', verdict, refusal: 'second_objection' }, 'open'],
    ]);
  });

  it('sends an objection with no verdict to contest to the owner, and moves no review', async () => {
    const { kingdom, steward } = await open({}, () => letter(OBJECTION));
    await kingdom.command('create_quest', questPayload('Early'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Early', 'done'));
    expect((await memosOf(kingdom)).map(({ to }) => to)).toEqual([{ route: 'owner', refusal: 'no_verdict' }]);
    expect(await verdictOf(kingdom, `${(await kingdom.quest('Early')).id}-1`)).toMatchObject({
      verifier_id: 'orin',
    });
  });
});

describe('an objection no judge of the roster may take', () => {
  const cast = [
    { id: 'thorn', cls: 'knight', level: 5 },
    { id: 'orin', cls: 'judge', tribe: 'gemini', model: 'gemini-3.8-flash-low', level: 6 },
  ];

  it('waits as unjudgeable, rung once, until the owner decides the memo and any judge may take it', async () => {
    const plays = { verdicts: { Alone: [FAIL, PASS] } };
    const { kingdom, steward } = await open({ cast, plays }, (_, nth) => letter(nth === 2 ? OBJECTION : '-'));
    await kingdom.command('create_quest', questPayload('Alone'));
    const waiting = async () => {
      const quest = await kingdom.quest('Alone');
      return quest.status === 'review' && quest.objection !== undefined;
    };
    await tickUntil(steward, kingdom.clock, waiting);
    for (let tick = 0; tick < 3; tick += 1) await steward.tick();
    const quest = await kingdom.quest('Alone');
    expect(quest).toMatchObject({ status: 'review', verifier: null });
    expect(kingdom.notices.filter(({ kind }) => kind === 'unjudgeable')).toHaveLength(1);
    expect(judgeRuns(kingdom)).toHaveLength(1);
    const [memo] = await memosOf(kingdom);
    await kingdom.command('decide_memo', { memo: memo?.id, decision: 'rejected', note: 'Ghi chú đúng.' });
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Alone', 'done'));
    expect(await kingdom.quest('Alone')).not.toHaveProperty('objection');
    expect((await memosOf(kingdom))[0]?.outcome).toMatchObject({ decision: 'rejected' });
    // The owner's decision left the quest: orin judges the run as any judge would, and the verdict answers nothing.
    const second = await verdictOf(kingdom, `${quest.id}-2`);
    expect(second).toMatchObject({ verifier_id: 'orin', result: 'pass' });
    expect(second).not.toHaveProperty('objection');
    expect((await linesOf(kingdom, 'quest.edited')).map(({ actor }) => actor)).toEqual([{ kind: 'user' }]);
  });
});
