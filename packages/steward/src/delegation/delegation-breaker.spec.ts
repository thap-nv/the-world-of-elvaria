// The breaker of the seal delegation (implementation-plan §3.16.7, ADR 0023; PS-08g, K11) on the bench, with a fake
// patrol whose one check the spec turns red: a merge without the seal, then a check turned red, suspends the
// territory's delegation once (its new quests wait for the seal, another territory's do not), a restart keeps it, the
// owner's resume ends it; only sealed merges among the suspects suspend nothing; the owner's report of an escaped
// defect suspends on a quest merged without the seal, only counts on a sealed one, and is refused before the merge.
import { EventSchema, SealDelegationSchema, TerritorySchema } from '@elvaria/domain';
import type { CheckId, Event, QuestId, TerritoryId, TerritoryTrial } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { FORGE_REMOTE } from '../__fixtures__/forge-bench.ts';
import { bench, questPayload } from '../__fixtures__/kingdom.ts';
import { folderPlots } from '../plot/folder-plots.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { Plots, Steward } from '../types.ts';

const CODE = 'dc1-se-team' as TerritoryId;
const OTHER = 'dc2-other' as TerritoryId;
const GONE = 'q_20261107_aaaaa1' as QuestId;
const SEALED = 'q_20261107_aaaaa2' as QuestId;
const SHA = 'a'.repeat(40);
const TS = '2026-11-07T09:00:00+07:00';

let current: Bench | undefined;
let running: Steward | undefined;
afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** Two code territories that merge by themselves under patrol; the kingdom delegates the seal of small builds. */
async function open(): Promise<Bench> {
  const kingdom = await bench({ cast: [] });
  current = kingdom;
  const code = await kingdom.store.territories.read(CODE);
  if (!code.ok) throw new Error('fixture: territory');
  const git = {
    vcs: { type: 'git', default_branch: 'main', remote: FORGE_REMOTE },
    delivery: { mode: 'pr_merge' },
    patrol: { scans: [] },
  };
  await kingdom.store.territories.write(TerritorySchema.parse({ ...code.value, ...git }));
  const other = { ...code.value, ...git, id: OTHER, name: OTHER, path: 'C:/repos/dc2-other' };
  await kingdom.store.territories.write(TerritorySchema.parse(other));
  const settings = await kingdom.store.kingdom.read();
  if (!settings.ok) throw new Error('fixture: kingdom.json');
  const seal = SealDelegationSchema.parse({ max_rank: 'D', kinds: ['build'] });
  await kingdom.store.kingdom.write({
    ...settings.value,
    delegation: { ...settings.value.delegation, seal },
  });
  return kingdom;
}

/** The patrol's one check, red while `branch.red` says so. */
const branch = { red: false };
const trial = (): Promise<TerritoryTrial> => {
  const pass = !branch.red;
  return Promise.resolve({
    base: SHA,
    setup: null,
    checks: [
      {
        id: 'unit' as CheckId,
        command: 'node check.mjs',
        pass,
        duration_ms: 1,
        timed_out: false,
        exit_code: pass ? 0 : 1,
        log_path: '.runs/patrol-dc1-se-team/checks/unit.log',
        timeout_minutes: 5,
        ...(pass ? {} : { error_line: 'FAIL src/rooms.spec.ts' }),
      },
    ],
  });
};

async function start(kingdom: Bench): Promise<Steward> {
  const plots: Plots = { ...folderPlots(kingdom.root), patrol: trial };
  running = kingdom.steward({ plots });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return running;
}

const lines = async (kingdom: Bench, type: string): Promise<Event[]> =>
  (await openEventLog(kingdom.root).read()).events.filter((event) => event.type === type);

let serial = 0;
/** The Steward's merge of `quest`'s pull request, as the forge's delivery writes it. */
async function merged(kingdom: Bench, quest: QuestId, sealed: boolean): Promise<void> {
  serial += 1;
  const data = {
    quest,
    territory: CODE,
    branch: `quest/${quest}`,
    head: SHA,
    pr: { number: serial, url: `https://github.com/elvaria-specs/kingdom-repo/pull/${serial}` },
    merge_sha: 'b'.repeat(40),
    method: 'merge',
    sealed,
    branch_deleted: true,
  };
  const id = `01JF${String(serial).padStart(22, '0')}`;
  const line = {
    v: 2,
    id,
    ts: TS,
    type: 'delivery.merged',
    actor: { kind: 'steward' },
    quest,
    territory: CODE,
    data,
  };
  await openEventLog(kingdom.root).append([EventSchema.parse(line)]);
}

/** The owner's `territory patrol --now`, run to its end. */
async function patrol(kingdom: Bench, steward: Steward): Promise<void> {
  await kingdom.command('patrol', { territory: CODE });
  await steward.tick();
  await steward.idle();
}

/** A draft made by a command that says nothing of the seal: the delegation may spare it. */
async function draft(kingdom: Bench, steward: Steward, title: string, territory = CODE) {
  const { seal_required: _, ...payload } = questPayload(title, { draft: true, territory });
  await kingdom.command('create_quest', payload);
  await steward.tick();
  return kingdom.quest(title);
}

/** The Steward's answer to a command: applied, or the reason it was refused. */
async function answer(kingdom: Bench, steward: Steward, kind: string, payload: Record<string, unknown>) {
  const id = await kingdom.command(kind as never, payload);
  await steward.tick();
  const refused = (await lines(kingdom, 'command.rejected')).find(({ data }) => data.command_id === id);
  return refused === undefined ? 'applied' : refused.data.reason;
}

const rung = (kingdom: Bench) => kingdom.notices.filter(({ kind }) => kind === 'delegation_suspended');

describe('the breaker of the seal delegation', () => {
  it('a check turned red after a merge without the seal suspends the territory once, until the owner resumes it', async () => {
    branch.red = false;
    const kingdom = await open();
    let steward = await start(kingdom);
    await patrol(kingdom, steward);
    await merged(kingdom, SEALED, true);
    await merged(kingdom, GONE, false);
    branch.red = true;
    await patrol(kingdom, steward);
    await patrol(kingdom, steward);
    const suspended = await lines(kingdom, 'delegation.suspended');
    expect(suspended.map(({ data }) => data)).toEqual([
      { territory: CODE, quest: GONE, cause: 'base_red', check: 'unit' },
    ]);
    expect(rung(kingdom)).toEqual([
      { kind: 'delegation_suspended', territory: CODE, quest: GONE, cause: 'base_red', check: 'unit' },
    ]);
    expect(await draft(kingdom, steward, 'Here')).toMatchObject({ seal_required: true });
    expect((await kingdom.quest('Here')).seal_delegated).toBeUndefined();
    expect(await draft(kingdom, steward, 'There', OTHER)).toMatchObject({
      seal_required: false,
      seal_delegated: true,
    });

    // A new Steward reads the suspension back from the log.
    await steward.stop();
    steward = await start(kingdom);
    expect((await draft(kingdom, steward, 'Again')).seal_delegated).toBeUndefined();

    expect(await answer(kingdom, steward, 'resume_delegation', { territory: CODE })).toBe('applied');
    expect((await lines(kingdom, 'delegation.resumed')).map(({ data, actor }) => [data, actor.kind])).toEqual(
      [[{ territory: CODE }, 'user']],
    );
    expect(await draft(kingdom, steward, 'After')).toMatchObject({
      seal_required: false,
      seal_delegated: true,
    });
    expect(await answer(kingdom, steward, 'resume_delegation', { territory: CODE })).toBe('not_suspended');
    expect(await answer(kingdom, steward, 'resume_delegation', { territory: 'nowhere' })).toBe(
      'unknown_territory',
    );
  });

  it('suspends nothing when every merge since the last green patrol had the seal', async () => {
    branch.red = false;
    const kingdom = await open();
    const steward = await start(kingdom);
    await patrol(kingdom, steward);
    await merged(kingdom, SEALED, true);
    branch.red = true;
    await patrol(kingdom, steward);
    expect(kingdom.notices.filter(({ kind }) => kind === 'base_red')).toHaveLength(1);
    expect(await lines(kingdom, 'delegation.suspended')).toEqual([]);
    expect((await draft(kingdom, steward, 'Here')).seal_delegated).toBe(true);
  });

  it("the owner's report suspends on a quest merged without the seal, only counts on a sealed one", async () => {
    const kingdom = await open();
    const steward = await start(kingdom);
    const spared = await draft(kingdom, steward, 'Spared');
    const sealed = await draft(kingdom, steward, 'Sealed');
    const pending = await draft(kingdom, steward, 'Pending');
    await merged(kingdom, spared.id, false);
    await merged(kingdom, sealed.id, true);

    expect(await answer(kingdom, steward, 'report_escape', { quest: pending.id })).toBe('not_merged');
    expect(await answer(kingdom, steward, 'report_escape', { quest: sealed.id })).toBe('applied');
    expect(await lines(kingdom, 'delegation.suspended')).toEqual([]);
    const note = 'the rooms page lost its header';
    expect(await answer(kingdom, steward, 'report_escape', { quest: spared.id, note })).toBe('applied');
    expect(await answer(kingdom, steward, 'report_escape', { quest: spared.id })).toBe('already_reported');

    expect((await lines(kingdom, 'quest.escaped')).map(({ data, actor }) => [data, actor.kind])).toEqual([
      [{ quest: sealed.id, territory: CODE, delegated: false }, 'user'],
      [{ quest: spared.id, territory: CODE, delegated: true, note }, 'user'],
    ]);
    const suspended = await lines(kingdom, 'delegation.suspended');
    expect(suspended.map(({ data }) => data)).toEqual([
      { territory: CODE, quest: spared.id, cause: 'escape_reported', note },
    ]);
    expect(rung(kingdom)).toHaveLength(1);
    expect((await draft(kingdom, steward, 'Next')).seal_delegated).toBeUndefined();
  });
});
