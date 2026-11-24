// The late fail the patrol finds (CM-06, ADR 0033) on a real git repo with real checks: a quest archived after its
// merge turns main red. Its own change: a late machine verdict, one `character.judged` line for its doer and one for
// the judge who passed it, and a fix quest claimed for the doer, the quest itself left archived. A merge of both sides:
// a fix quest for anyone, nobody judged. Above kingdom.delegation.max_rank the fix is a draft; a probe run again
// after a stop opens no second one and judges nobody twice. The owner's own commit opens nothing.
import { isEventOf, QuestSchema, VerdictSchema } from '@elvaria/domain';
import type { QuestId, VerdictId } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import type { EventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CODE,
  PROBE_CAST,
  Q1,
  Q2,
  TS,
  attributions,
  commitOn,
  deliver,
  openProbe,
  patrolNow,
} from '../__fixtures__/probe.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { Steward } from '../types.ts';

let current: Bench | undefined;
let running: Steward | undefined;
afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

async function open(events?: (log: EventLog) => EventLog) {
  const opened = await openProbe('green', PROBE_CAST, events);
  current = opened.kingdom;
  running = opened.steward;
  return opened;
}

const LATE = `${Q2}-1-late` as VerdictId;

/** `quest` archived on the code territory: thorn did its one run, sable passed it. */
async function archived(kingdom: Bench, quest: QuestId, rank = 'D'): Promise<void> {
  const run = {
    n: 1,
    character: 'thorn',
    role: 'assignee',
    started_at: TS,
    ended_at: TS,
    outcome: 'submitted',
    run_dir: `.runs/${quest}-1`,
  };
  const file = QuestSchema.parse({
    version: 1,
    id: quest,
    title: `Quest ${quest}`,
    description: 'A quest of the late fix spec.',
    kind: 'build',
    rank,
    class_required: 'knight',
    tags: [],
    territory: CODE,
    status: 'archived',
    tier: 'session',
    assignee: 'thorn',
    verifier: null,
    campaign_id: null,
    parent_id: null,
    depends_on: [],
    budget: { max_minutes: 45, max_tokens: 400_000, max_attempts: 3 },
    estimate: { tokens: 200_000, minutes: 30 },
    attempts: 1,
    attempt_log: [run],
    plot: { type: 'none' },
    deliverable: { type: 'branch' },
    seal_required: false,
    secrets_required: [],
    checks_run: [],
    created_by: 'user',
    created_at: TS,
    updated_at: TS,
  });
  const pass = {
    version: 1,
    id: `${quest}-1`,
    quest_id: quest,
    attempt: 1,
    verifier_id: 'sable',
    session_id: 's-sable',
  };
  const verdict = { ritual: 'build_review', checks: [], result: 'pass', notes: 'Read it.', by_human: false };
  expect((await kingdom.store.quests.write(file)).ok).toBe(true);
  const written = await kingdom.store.verdicts.write(
    VerdictSchema.parse({ ...pass, ...verdict, created_at: TS }),
  );
  expect(written.ok).toBe(true);
}

const fixesOf = async (kingdom: Bench, origin: QuestId) =>
  (await kingdom.quests()).filter((quest) => quest.parent_id === origin);

/** Who each `character.judged` line judged, and as what. */
const judgedOf = async (kingdom: Bench) =>
  (await openEventLog(kingdom.root).read()).events.flatMap((event) =>
    isEventOf(event, 'character.judged')
      ? [[event.data.character.id, event.data.role, event.data.verdict]]
      : [],
  );

/** main: Q1 green, then Q2 with `files`; the patrols before and after. */
async function redAfter(
  opened: Awaited<ReturnType<typeof open>>,
  files: Record<string, string>,
  update = false,
) {
  const { kingdom, repo, steward, green } = opened;
  await patrolNow(kingdom, steward);
  await deliver(kingdom, repo, Q1, green, { 'x.txt': 'x\n' });
  await deliver(kingdom, repo, Q2, green, files, update);
  await patrolNow(kingdom, steward);
}

describe('the late fail the patrol finds (CM-06)', () => {
  it('own_change: a late verdict, the doer and the judge judged, a fix claimed for the doer', async () => {
    const opened = await open();
    const { kingdom } = opened;
    await archived(kingdom, Q2);
    await redAfter(opened, { 'state.txt': 'red\n' });
    expect(
      (await fixesOf(kingdom, Q2)).map(({ kind, status, assignee, rank, created_by: by }) => [
        kind,
        status,
        assignee,
        rank,
        by,
      ]),
    ).toEqual([['fix', 'claimed', 'thorn', 'D', 'patrol']]);
    expect((await kingdom.quests()).find(({ id }) => id === Q2)?.status).toBe('archived');
    const late = await kingdom.store.verdicts.read(LATE);
    if (!late.ok) throw new Error('no late verdict');
    expect(late.value).toMatchObject({ result: 'fail', late: true, verifier_id: 'machine', attempt: 1 });
    expect(late.value.checks.map(({ id, pass }) => [id, pass])).toEqual([['unit', false]]);
    expect(late.value.notes).toContain('Error: red');
    expect(await judgedOf(kingdom)).toEqual([
      ['thorn', 'assignee', LATE],
      ['sable', 'judge', LATE],
    ]);
    for (const id of ['thorn', 'sable'])
      expect((await kingdom.character(id)).reputation.window).toContainEqual(
        expect.objectContaining({ verdict_id: LATE, result: 'fail' }),
      );
    expect((await kingdom.character('sable')).consecutive_fail).toEqual({ count: 0 });
  });

  it('combination: a fix for anyone, no late verdict, nobody judged', async () => {
    const opened = await open();
    const { kingdom } = opened;
    await archived(kingdom, Q2);
    await redAfter(opened, { 'y.txt': 'y\n' }, true);
    expect((await fixesOf(kingdom, Q2)).map(({ status, assignee }) => [status, assignee])).toEqual([
      ['open', null],
    ]);
    expect((await kingdom.store.verdicts.read(LATE)).ok).toBe(false);
    expect(await judgedOf(kingdom)).toEqual([]);
  });

  it('above max_rank a draft; a probe run again after a stop opens no second fix and judges nobody twice', async () => {
    let refused = false;
    // The first `check.attributed` is refused, as a Steward stopped before the line: the next patrol probes again.
    const refusing = (log: EventLog): EventLog => ({
      ...log,
      append: async (events) => {
        if (refused || !events.some(({ type }) => type === 'check.attributed')) return log.append(events);
        refused = true;
        throw new Error('the disk is full');
      },
    });
    const opened = await open(refusing);
    const { kingdom, steward } = opened;
    await archived(kingdom, Q2, 'C');
    await redAfter(opened, { 'state.txt': 'red\n' });
    expect(await attributions(kingdom)).toEqual([]);
    await patrolNow(kingdom, steward);
    expect(await attributions(kingdom)).toHaveLength(1);
    expect((await fixesOf(kingdom, Q2)).map(({ status, assignee }) => [status, assignee])).toEqual([
      ['draft', null],
    ]);
    expect(await judgedOf(kingdom)).toHaveLength(2);
    const fails = (await openEventLog(kingdom.root).read()).events.filter(
      ({ type }) => type === 'verdict.fail',
    );
    expect(fails).toHaveLength(1);
  });

  it("the owner's own commit: outside, no fix quest", async () => {
    const { kingdom, repo, steward, green } = await open();
    await archived(kingdom, Q1);
    await patrolNow(kingdom, steward);
    await deliver(kingdom, repo, Q1, green, { 'a.txt': 'a\n' });
    await commitOn(repo, { 'state.txt': 'red\n' }, 'by hand');
    await patrolNow(kingdom, steward);
    expect((await attributions(kingdom)).map(({ cause }) => cause)).toEqual(['outside']);
    expect(await fixesOf(kingdom, Q1)).toEqual([]);
  });
});
