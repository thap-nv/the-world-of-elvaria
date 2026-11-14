// Amendments (PS-22b, implementation-plan §3.16.2, ADR 0024): an assignee that holds its quest's description wrong
// writes an `amendment` memo and ends its session; the quest waits as on a question. Whoever wrote the description
// decides it outside the tick (a job on call: here a fake that writes the author's decide_amendment): accepted, the
// description is rewritten and the doer's next session reads it with the reason; rejected, it reads the reason and
// the old description; handed to the owner, it asks the owner, rings once and is in the digest, and `elvaria answer`
// lets it go on. The owner's own quests, and a quest's second amendment, ask the owner at once. A decision changes no
// other quest, reaches no running session, and the judge never reads the memo.
import { openEventLog } from '@elvaria/eventlog';
import type { Event, Memo } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { authorJob } from './__fixtures__/author.ts';
import { PASS, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { letter, writing } from './__fixtures__/letters.ts';
import { statusIs } from './__fixtures__/review.ts';
import type { Decide } from './__fixtures__/author.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Letters } from './__fixtures__/letters.ts';
import type { Digest, DigestRequest, Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

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

async function open(options: BenchOptions, letters: Letters, decide: Decide = () => ({}), idle = false) {
  current = await bench(options);
  const made = current;
  const runners = {
    claude: writing(made.runners.claude, letters, () => undefined),
    gemini: writing(made.runners.gemini, letters, () => undefined),
  };
  const job = authorJob(() => made, decide);
  const digest = recordingPort();
  // `idle`: the author's office never gets to it (its tribe busy elsewhere), so the owner goes first.
  const onCall = idle ? [{ ...job, ready: () => Promise.resolve(false) }] : [job];
  running = made.steward({ runners, digest, onCall });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: made, steward: running, job, digest };
}

const AMENDMENT =
  '- amendment: Đề bài: sửa `package.json` bằng tay. Đề nghị: `pnpm pkg set`. Vì: lint chặn sửa tay. refs: package.json';
const AGAIN = '- amendment: Đề bài vẫn sai: README không có mục cài đặt. refs: README.md';
const NEW = '## Goal\n\nThêm script bằng `pnpm pkg set scripts.check=…`.';

const memosOf = async (kingdom: Bench): Promise<Memo[]> =>
  (await kingdom.store.memos.list()).items.toSorted((a, b) => a.filed_at.localeCompare(b.filed_at));
const linesOf = async (kingdom: Bench, type: string): Promise<Event[]> =>
  (await openEventLog(kingdom.root).read()).events.filter((event) => event.type === type);
const assigneeRuns = (kingdom: Bench, title: string) =>
  kingdom.requests.filter(({ role, quest }) => role === 'assignee' && quest?.title === title);
const judgeRuns = (kingdom: Bench) => kingdom.requests.filter(({ role }) => role === 'verifier');
const blockedOn = (kingdom: Bench, title: string) => async () =>
  (await kingdom.quest(title)).blocked?.amendment !== undefined;
const textOf = (prompt: { system: string; user: string } | undefined) =>
  `${prompt?.system ?? ''}\n${prompt?.user ?? ''}`;

describe('an amendment to a quest the Chancellor drafted', () => {
  const chancellor = { created_by: 'chancellor' };

  it('accepted: the description is rewritten, and the next session reads it with the reason', async () => {
    const accept: Decide = (_, quest) => ({
      decision: 'accepted',
      note: 'Đúng: lint chặn sửa tay.',
      description: NEW,
      expected_updated_at: quest.updated_at,
    });
    const { kingdom, steward, job } = await open(
      { plays: { verdicts: { Taken: [PASS] } } },
      (title, nth) => letter(title === 'Taken' && nth === 1 ? AMENDMENT : '-'),
      accept,
    );
    await kingdom.command('create_quest', questPayload('Taken', chancellor));
    await kingdom.command('create_quest', questPayload('Bystander', chancellor));
    await tickUntil(steward, kingdom.clock, blockedOn(kingdom, 'Taken'));
    const waiting = await kingdom.quest('Taken');
    // The quest waits for its author, not the owner: no bell, no question for the digest.
    expect(waiting).toMatchObject({ status: 'blocked', blocked: { amendment: { by: 'author' } } });
    expect(kingdom.notices.filter(({ kind }) => kind === 'question')).toEqual([]);
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Taken', 'done'));
    const [memo, ...others] = await memosOf(kingdom);
    expect(others).toEqual([]);
    expect(memo).toMatchObject({
      kind: 'amendment',
      to: { route: 'author' },
      state: 'closed',
      outcome: { decision: 'accepted', note: 'Đúng: lint chặn sửa tay.' },
    });
    const quest = await kingdom.quest('Taken');
    expect(quest.description).toBe(NEW);
    expect(job.asked).toEqual([quest.id]);
    const next = assigneeRuns(kingdom, 'Taken')[1]?.prompt;
    expect(next?.user).toContain('## The decision on your amendment');
    expect(next?.user).toContain('Đúng: lint chặn sửa tay.');
    expect(textOf(next)).toContain(NEW);
    // The judge reads the description as rewritten, never the memo.
    const judged = textOf(judgeRuns(kingdom).find(({ quest: q }) => q?.title === 'Taken')?.prompt);
    expect(judged).toContain(NEW);
    expect(judged).not.toContain('lint chặn sửa tay');
    // The decision is the Chancellor's, and it changed no other quest.
    const lines = (await linesOf(kingdom, 'memo.closed')).map(({ actor, data }) => [actor, data]);
    expect(lines).toEqual([[{ kind: 'chancellor' }, { memo: memo?.id, decision: 'accepted' }]]);
    const bystander = await kingdom.quest('Bystander');
    expect(bystander.description).toBe(questPayload('Bystander').description);
    expect(bystander.blocked).toBeUndefined();
  });

  it('handed to the owner: it asks the owner once, is in the digest, and goes on with the answer', async () => {
    const refer: Decide = () => ({
      decision: 'owner',
      note: 'Chủ nhân đã chọn sửa tay.',
      holds: ['decision_change'],
    });
    const { kingdom, steward, digest } = await open(
      { plays: { verdicts: { Referred: [PASS] } } },
      (_, nth) => letter(nth === 1 ? AMENDMENT : '-'),
      refer,
    );
    await kingdom.command('create_quest', questPayload('Referred', chancellor));
    const owners = async () => (await kingdom.quest('Referred')).blocked?.amendment?.by === 'owner';
    await tickUntil(steward, kingdom.clock, owners);
    for (let tick = 0; tick < 3; tick += 1) await steward.tick();
    const quest = await kingdom.quest('Referred');
    expect(quest.status).toBe('blocked');
    expect(quest.blocked?.question).toContain('Chủ nhân đã chọn sửa tay.');
    expect(kingdom.notices.filter(({ kind }) => kind === 'question')).toHaveLength(1);
    const [memo] = await memosOf(kingdom);
    expect(memo).toMatchObject({
      state: 'open',
      escalation: { action: 'owner', holds: ['decision_change'] },
    });
    kingdom.clock.advance(24 * 60);
    await steward.tick();
    const items = digest.asked.at(-1)?.items ?? [];
    expect(items.map(({ kind, quest: id, memo: m }) => [kind, id ?? m])).toContainEqual([
      'question',
      quest.id,
    ]);
    expect(items.some(({ memo: m }) => m === memo?.id)).toBe(false);
    await kingdom.command('answer', { quest: quest.id, answer: 'Làm theo đề nghị.' });
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Referred', 'done'));
    expect((await memosOf(kingdom))[0]).toMatchObject({
      state: 'closed',
      outcome: { decision: 'handled', quest: quest.id, note: 'Làm theo đề nghị.' },
    });
    const next = assigneeRuns(kingdom, 'Referred')[1]?.prompt.user;
    expect(next).toContain('The owner answered it:');
    expect(next).toContain('Làm theo đề nghị.');
  });

  it("sends the quest's second amendment to the owner, with no author's session", async () => {
    const reject: Decide = () => ({ decision: 'rejected', note: 'Không: lint cho phép.' });
    const { kingdom, steward, job } = await open(
      { plays: { verdicts: { Twice: [PASS] } } },
      (_, nth) => letter(nth === 1 ? AMENDMENT : nth === 2 ? AGAIN : '-'),
      reject,
    );
    await kingdom.command('create_quest', questPayload('Twice', chancellor));
    const second = async () => (await memosOf(kingdom)).length === 2;
    await tickUntil(steward, kingdom.clock, second);
    await steward.tick();
    const quest = await kingdom.quest('Twice');
    const [, again] = await memosOf(kingdom);
    expect(again).toMatchObject({ to: { route: 'owner', refusal: 'second_amendment' }, state: 'open' });
    expect(quest.blocked).toMatchObject({ amendment: { memo: again?.id, by: 'owner' } });
    expect(job.asked).toEqual([quest.id]);
    // The rejected one: its reason reached the second session, with the description as it was.
    const next = assigneeRuns(kingdom, 'Twice')[1]?.prompt.user;
    expect(next).toContain('Không: lint cho phép.');
    expect(next).toContain('Its author rejected it');
    expect(quest.description).toBe(questPayload('Twice').description);
  });

  it('lets the owner decide the memo first: the quest goes on, and its author is never asked', async () => {
    const { kingdom, steward, job } = await open(
      { plays: { verdicts: { First: [PASS] } } },
      (_, nth) => letter(nth === 1 ? AMENDMENT : '-'),
      () => ({}),
      true,
    );
    await kingdom.command('create_quest', questPayload('First', chancellor));
    await tickUntil(steward, kingdom.clock, blockedOn(kingdom, 'First'));
    const [memo] = await memosOf(kingdom);
    await kingdom.command('decide_memo', { memo: memo?.id, decision: 'rejected', note: 'Giữ đề.' });
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'First', 'done'));
    expect((await memosOf(kingdom))[0]).toMatchObject({ state: 'closed', outcome: { decision: 'rejected' } });
    expect(assigneeRuns(kingdom, 'First')[1]?.prompt.user).toContain('The owner answered it:');
    expect(job.asked).toEqual([]);
  });
});

describe('an amendment to a quest the author is a mage of', () => {
  it("goes to the mage who did the plan quest, whose rejection is told as the mage's", async () => {
    const reject: Decide = () => ({ decision: 'rejected', note: 'Kế hoạch đã chọn cách này.' });
    const { kingdom, steward } = await open(
      { plays: { verdicts: { Plan: [PASS], Child: [PASS] } } },
      (title, nth) => letter(title === 'Child' && nth === 1 ? AMENDMENT : '-'),
      reject,
    );
    await kingdom.command('create_quest', questPayload('Plan'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Plan', 'done'));
    const plan = await kingdom.quest('Plan');
    await kingdom.command(
      'create_quest',
      questPayload('Child', { created_by: 'council', parent_id: plan.id }),
    );
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Child', 'done'));
    const [memo] = await memosOf(kingdom);
    expect(memo).toMatchObject({
      to: { route: 'author', author: plan.assignee },
      outcome: { decision: 'rejected' },
    });
    const [closed] = await linesOf(kingdom, 'memo.closed');
    expect(closed?.actor).toEqual({ kind: 'character', id: plan.assignee });
  });
});

describe("an amendment to the owner's own quest", () => {
  it('is a question to the owner, as today', async () => {
    const { kingdom, steward, job } = await open({ plays: { verdicts: { Own: [PASS] } } }, (_, nth) =>
      letter(nth === 1 ? AMENDMENT : '-'),
    );
    await kingdom.command('create_quest', questPayload('Own'));
    await tickUntil(steward, kingdom.clock, blockedOn(kingdom, 'Own'));
    const quest = await kingdom.quest('Own');
    expect(quest.blocked).toMatchObject({ amendment: { by: 'owner' } });
    expect((await memosOf(kingdom))[0]?.to).toEqual({ route: 'owner', refusal: 'no_author' });
    expect(kingdom.notices.filter(({ kind }) => kind === 'question')).toHaveLength(1);
    await kingdom.command('answer', { quest: quest.id, answer: 'Đồng ý.' });
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Own', 'done'));
    expect(job.asked).toEqual([]);
  });
});
