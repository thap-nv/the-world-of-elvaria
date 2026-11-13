// The commands of the Chancellor's triage (PS-03b, implementation-plan §3.16.3, ADR 0005): plain inbox commands with
// source `chancellor`, told as the Chancellor's. A quest made open of memos, or an edit that merges them, closes them
// as handled by the quest; a draft's memos wait for the owner's confirm; a memo sent up keeps the advice and stays open.
import { openEventLog } from '@elvaria/eventlog';
import type { Event, InboxCommandInput, Memo, Quest } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload } from './__fixtures__/kingdom.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const M1 = 'm_20261107_aaaaaa';
const M2 = 'm_20261107_bbbbbb';

/** No character, so every quest stays where the commands put it; one open quest whose letter held the memos. */
async function open(memos: readonly string[] = [M1, M2]) {
  current = await bench({ cast: [] });
  running = current.steward();
  await running.start({ loop: false });
  await current.command('create_quest', questPayload('Source'));
  await running.tick();
  const source = await current.quest('Source');
  for (const id of memos) {
    const memo: Memo = {
      version: 1,
      id: id as Memo['id'],
      kind: 'proposal' as Memo['kind'],
      from: 'thorn' as Memo['from'],
      quest: source.id,
      attempt: 1,
      to: { route: 'chancellor' },
      body: `Memo ${id}.`,
      refs: ['docs/a.md'],
      state: 'open',
      filed_at: '2026-11-07T08:00:00+07:00',
    };
    await current.store.memos.write(memo);
  }
  return { kingdom: current, steward: running, source };
}

/** A command the triage writes. */
async function fromChancellor(kingdom: Bench, kind: string, payload: Record<string, unknown>) {
  const id = kingdom.ids.ulid();
  const command = { version: 1, id, ts: '2026-11-07T09:00:00+07:00', kind, source: 'chancellor', payload };
  const written = await kingdom.store.inbox.write(command as unknown as InboxCommandInput);
  if (!written.ok) throw new Error(written.error.message);
  return id;
}

const linesOf = async (kingdom: Bench): Promise<readonly Event[]> =>
  (await openEventLog(kingdom.root).read()).events;

const answerOf = async (kingdom: Bench, id: string) =>
  (await linesOf(kingdom)).find(({ data }) => data.command_id === id);

async function memo(kingdom: Bench, id: string): Promise<Memo> {
  const read = await kingdom.store.memos.read(id as Memo['id']);
  if (!read.ok) throw new Error(read.error.code);
  return read.value;
}

const closedLines = async (kingdom: Bench) =>
  (await linesOf(kingdom))
    .filter(({ type }) => type === 'memo.closed')
    .map(({ actor, data }) => ({ actor, data }));

describe('a quest the triage makes of memos', () => {
  it('opens, and closes its memos as handled by it, as the Chancellor’s', async () => {
    const { kingdom, steward } = await open();
    const made = questPayload('Made', { created_by: 'chancellor', memos: [M1, M2, 'm_20261107_zzzzzz'] });
    const sent = await fromChancellor(kingdom, 'create_quest', made);
    await steward.tick();
    const quest = await kingdom.quest('Made');
    expect(quest).toMatchObject({ status: 'open', memos: [M1, M2, 'm_20261107_zzzzzz'] });
    expect(await memo(kingdom, M1)).toMatchObject({
      state: 'closed',
      outcome: { decision: 'handled', quest: quest.id },
    });
    const chancellor = { kind: 'chancellor' };
    expect(await closedLines(kingdom)).toEqual([
      { actor: chancellor, data: { memo: M1, decision: 'handled', quest: quest.id } },
      { actor: chancellor, data: { memo: M2, decision: 'handled', quest: quest.id } },
    ]);
    expect(await answerOf(kingdom, sent)).toMatchObject({
      type: 'command.applied',
      data: { kind: 'create_quest', source: 'chancellor' },
    });
    const created = (await linesOf(kingdom)).find(
      ({ type, quest: id }) => type === 'quest.created' && id === quest.id,
    );
    expect(created?.actor).toEqual(chancellor);
    expect(kingdom.warnings).toEqual([`steward: memo m_20261107_zzzzzz taken in by ${quest.id}: not_found`]);
  });

  it('as a draft, leaves its memos open until the owner confirms it', async () => {
    const { kingdom, steward } = await open();
    const drafted = questPayload('Drafted', { draft: true, created_by: 'chancellor', memos: [M1] });
    await fromChancellor(kingdom, 'create_quest', drafted);
    await steward.tick();
    const draft = await kingdom.quest('Drafted');
    expect(draft.status).toBe('draft');
    expect((await memo(kingdom, M1)).state).toBe('open');
    await kingdom.command('confirm', { quest: draft.id });
    await steward.tick();
    expect(await closedLines(kingdom)).toEqual([
      { actor: { kind: 'user' }, data: { memo: M1, decision: 'handled', quest: draft.id } },
    ]);
  });
});

describe('an edit the triage makes', () => {
  it('closes the memos it merges once it holds, and none of an edit refused as stale', async () => {
    const { kingdom, steward, source } = await open();
    const edit = (memos: readonly string[], seen: Quest) => ({
      quest: seen.id,
      expected_updated_at: seen.updated_at,
      changes: { description: `${seen.description}\n\nAlso ${memos.join(', ')}.` },
      memos,
    });
    // The edit lands a minute after the quest was made: the second one read it before.
    kingdom.clock.advance(1);
    const merged = await fromChancellor(kingdom, 'edit_quest', edit([M1], source));
    const stale = await fromChancellor(kingdom, 'edit_quest', edit([M2], source));
    await steward.tick();
    expect((await answerOf(kingdom, merged))?.type).toBe('command.applied');
    expect(await answerOf(kingdom, stale)).toMatchObject({ data: { reason: 'stale', source: 'chancellor' } });
    expect((await kingdom.quest('Source')).description).toContain(`Also ${M1}.`);
    expect(await memo(kingdom, M1)).toMatchObject({ state: 'closed', outcome: { quest: source.id } });
    expect((await memo(kingdom, M2)).state).toBe('open');
    const edited = (await linesOf(kingdom)).find(({ type }) => type === 'quest.edited');
    expect(edited?.actor).toEqual({ kind: 'chancellor' });
  });
});

describe('the triage deciding a memo', () => {
  it('sets one aside as the Chancellor’s, and leaves one closed meanwhile as it is', async () => {
    const { kingdom, steward } = await open();
    await fromChancellor(kingdom, 'decide_memo', { memo: M1, decision: 'shelved', note: 'Trùng thư.' });
    await kingdom.command('decide_memo', { memo: M2, decision: 'rejected' });
    await fromChancellor(
      kingdom,
      'create_quest',
      questPayload('Late', { created_by: 'chancellor', memos: [M2] }),
    );
    await steward.tick();
    expect(await closedLines(kingdom)).toEqual([
      { actor: { kind: 'chancellor' }, data: { memo: M1, decision: 'shelved' } },
      { actor: { kind: 'user' }, data: { memo: M2, decision: 'rejected' } },
    ]);
  });

  it('sends one up with its advice, once, and keeps it open', async () => {
    const { kingdom, steward, source } = await open();
    const advice = { action: 'merge', quest: source.id, holds: ['above_rank'], note: 'Hạng C.' };
    const sent = [
      await fromChancellor(kingdom, 'escalate_memo', { memo: M1, ...advice }),
      await fromChancellor(kingdom, 'escalate_memo', { memo: M1, ...advice }),
      await fromChancellor(kingdom, 'escalate_memo', { ...advice, memo: 'm_20261107_zzzzzz' }),
      await fromChancellor(kingdom, 'escalate_memo', { ...advice, memo: M2, quest: 'q_20261107_zzzzzz' }),
    ];
    await kingdom.command('decide_memo', { memo: M2, decision: 'rejected' });
    const late = await fromChancellor(kingdom, 'escalate_memo', {
      memo: M2,
      action: 'owner',
      holds: ['chancellor_asks'],
      note: 'x',
    });
    await steward.tick();
    const answers = await Promise.all(
      [...sent, late].map(async (id) => (await answerOf(kingdom, id))?.data.reason),
    );
    expect(answers).toEqual([undefined, 'memo_escalated', 'unknown_memo', 'unknown_quest', 'memo_closed']);
    expect(await memo(kingdom, M1)).toMatchObject({
      state: 'open',
      escalation: {
        at: expect.any(String) as string,
        action: 'merge',
        quest: source.id,
        holds: ['above_rank'],
        note: 'Hạng C.',
      },
    });
    const escalated = (await linesOf(kingdom)).filter(({ type }) => type === 'memo.escalated');
    expect(escalated).toEqual([
      expect.objectContaining({
        actor: { kind: 'chancellor' },
        quest: source.id,
        data: { memo: M1, action: 'merge', quest: source.id, holds: ['above_rank'] },
      }),
    ]);
  });
});
