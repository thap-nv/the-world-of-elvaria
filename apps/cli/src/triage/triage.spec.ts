// `elvaria triage` and its scheduled job (PS-03b, implementation-plan §3.16.3), with a scripted Chancellor (no mana):
// a letter within kingdom.delegation is applied by the Steward without the owner, a letter beyond it goes to the
// owner with the Chancellor's advice and into the digest; the result is inbox commands only; no letter waiting, no
// model call; the Steward's stop ends the job.
import path from 'node:path';

import { MemoSchema, QuestSchema, TerritorySchema, TribeIdSchema, createIdSource } from '@elvaria/domain';
import type { InboxCommand, Memo, Quest } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { translator } from '@elvaria/i18n';
import { createFakeRunner, openFileTreasury } from '@elvaria/runner-core';
import type { AgentRunner, SpawnRequest } from '@elvaria/runner-core';
import { createSteward, folderPlots } from '@elvaria/steward';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TZ, foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { consoleBell } from '../run/bell.ts';
import { triageJob } from './job.ts';
import { triageCommand } from './triage.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

const CLAUDE = TribeIdSchema.parse('claude');

const questOf = (id: string, fields: Record<string, unknown>): Quest =>
  QuestSchema.parse({
    version: 1,
    id,
    title: `Quest ${id}`,
    description: `Work of ${id}.`,
    kind: 'build',
    rank: 'D',
    class_required: 'knight',
    tags: ['backend'],
    territory: 'dc1-se-team',
    status: 'open',
    tier: 'session',
    assignee: null,
    verifier: null,
    depends_on: [],
    budget: { max_minutes: 45, max_tokens: 400000, max_attempts: 3 },
    estimate: { tokens: 200000, minutes: 30 },
    attempts: 0,
    attempt_log: [],
    plot: { type: 'none' },
    deliverable: { type: 'branch' },
    seal_required: false,
    secrets_required: [],
    checks_run: [],
    created_by: 'user',
    created_at: '2026-11-05T09:00:00+07:00',
    updated_at: '2026-11-05T09:00:00+07:00',
    ...fields,
  });

const SOURCE = questOf('q_20261105_srcqst', { status: 'done', scope_paths: ['apps/api/**'] });
const DOCS = questOf('q_20261105_d0csaa', { rank: 'E', scope_paths: ['docs/**'] });

const memoOf = (id: string, body: string, refs: readonly string[], filed: string): Memo =>
  MemoSchema.parse({
    version: 1,
    id,
    kind: 'proposal',
    from: 'thorn',
    quest: SOURCE.id,
    attempt: 1,
    to: { route: 'chancellor' },
    body,
    refs,
    state: 'open',
    filed_at: filed,
  });

const LINK = memoOf(
  'm_20261105_aaaaaa',
  'docs/guide.md có link chết.',
  ['docs/guide.md'],
  '2026-11-05T10:00:00+07:00',
);
const RENAME = memoOf(
  'm_20261105_bbbbbb',
  'Đổi tên trường bell.desktop.',
  ['docs/kingdom.md'],
  '2026-11-05T11:00:00+07:00',
);

const REPLY = {
  version: 1,
  decisions: [
    {
      memo: LINK.id,
      action: 'merge',
      quest: DOCS.id,
      addendum: 'Sửa link chết trong docs/guide.md.',
      ask: [],
      note: 'Cùng vùng docs.',
    },
    {
      memo: RENAME.id,
      action: 'owner',
      ask: ['contract_change'],
      note: 'Đổi tên một trường là đổi hợp đồng.',
    },
  ],
  drafts: [],
};

/** A Chancellor whose sessions end with `structured`, and the prompts it was given. */
function chancellor(structured: unknown): AgentRunner & { readonly heard: SpawnRequest[] } {
  const fake = createFakeRunner();
  const heard: SpawnRequest[] = [];
  return {
    ...fake,
    heard,
    spawn: async (req) => {
      heard.push(req);
      const session = await fake.spawn(req);
      return { ...session, wait: async () => ({ ...(await session.wait()), structured }) };
    },
  };
}

describe('the Chancellor’s triage (PS-03b)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    const store = openKingdom(kingdom);
    await store.territories.write(
      TerritorySchema.parse({
        version: 1,
        id: 'dc1-se-team',
        name: 'dc1-se-team',
        path: path.join(dir.root, 'dc1-se-team').replaceAll('\\', '/'),
        kind: 'code',
        vcs: { type: 'git', default_branch: 'main' },
        commands: {},
        checks: [],
        laws: { forbidden_paths: [], forbidden_commands: [] },
        secrets_allowed: [],
      }),
    );
    expect(
      await run(testIo(), 'character', 'add', 'aldric', '--class', 'chancellor', '--kingdom', kingdom),
    ).toBe(0);
    for (const quest of [SOURCE, DOCS]) await store.quests.write(quest);
  });
  afterEach(() => dir.remove());

  const cli = (io: TestIo) => ({ io, locale: 'en' as const, localeFromFlag: true, t: translator('en') });
  const triage = (io: TestIo, runner: AgentRunner) =>
    triageCommand({ runnersOf: () => ({ [CLAUDE]: runner }) }).run(
      { values: { kingdom }, positionals: [] },
      cli(io),
    );
  const inbox = async (): Promise<InboxCommand[]> =>
    (await openKingdom(kingdom).inbox.read()).flatMap(({ command }) => (command.ok ? [command.value] : []));

  /** One tick of a Steward with no runner: it applies the inbox and starts nothing. */
  async function stewardTick(): Promise<void> {
    const io = testIo();
    const ids = createIdSource({ clock: io.clock, random: io.random, tz: TZ });
    if (!ids.ok) throw new Error('tz');
    const steward = createSteward({
      store: openKingdom(kingdom),
      events: openEventLog(kingdom),
      runners: {},
      plots: folderPlots(kingdom),
      env: {},
      treasury: openFileTreasury(path.join(dir.root, 'no-treasury.json')),
      clock: io.clock,
      ids: ids.value,
      bell: consoleBell(translator('en'), io),
      log: { warn: () => undefined },
    });
    await steward.start({ loop: false });
    const report = await steward.tick();
    await steward.stop();
    expect(report.commands.rejected).toBe(0);
  }

  it('calls no model when no letter waits', async () => {
    const runner = chancellor(REPLY);
    const io = testIo();
    expect(await triage(io, runner)).toBe(0);
    expect(io.printed.out).toEqual(['No letter waits for the Chancellor.']);
    expect(runner.heard).toEqual([]);
  });

  it('applies a letter within the delegation without the owner, and sends the other to the digest', async () => {
    for (const memo of [RENAME, LINK]) await openKingdom(kingdom).memos.write(memo);
    const runner = chancellor(REPLY);
    const io = testIo();
    expect(await triage(io, runner)).toBe(0);
    expect(runner.heard).toHaveLength(1);
    expect(runner.heard[0]?.prompt.user.indexOf(LINK.id)).toBeLessThan(
      runner.heard[0]?.prompt.user.indexOf(RENAME.id) ?? 0,
    );
    expect(io.printed.out).toEqual([
      'Chancellor Aldric reads 2 letters…',
      `${LINK.id}: merge into quest ${DOCS.id}. Decided without you.`,
      `${RENAME.id}: only you can decide. Yours to decide, because it changes a data contract, the Chancellor sends it to you.`,
      expect.stringContaining('2 commands sent to the Steward') as string,
    ]);
    expect((await inbox()).map(({ kind, source }) => [kind, source])).toEqual([
      ['edit_quest', 'chancellor'],
      ['escalate_memo', 'chancellor'],
    ]);
    await stewardTick();
    const store = openKingdom(kingdom);
    const [link, rename, docs] = await Promise.all([
      store.memos.read(LINK.id),
      store.memos.read(RENAME.id),
      store.quests.read(DOCS.id),
    ]);
    expect(link.ok && link.value).toMatchObject({
      state: 'closed',
      outcome: { decision: 'handled', quest: DOCS.id },
    });
    expect(rename.ok && rename.value).toMatchObject({ state: 'open', escalation: { action: 'owner' } });
    expect(docs.ok && docs.value.description).toContain('Sửa link chết trong docs/guide.md.');
    const again = testIo();
    expect(await triage(again, runner)).toBe(0);
    expect(again.printed.out).toEqual(['No letter waits for the Chancellor.']);
    expect(runner.heard).toHaveLength(1);
    const digest = testIo();
    expect(await run(digest, 'digest', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(digest.printed.out.join('\n')).toContain(
      `Letter ${RENAME.id} (proposal) from thorn, of quest ${SOURCE.id}: the Chancellor advises: only you can decide`,
    );
  });

  it('sends up a letter whose files the territory protects, though the Chancellor flagged nothing', async () => {
    const store = openKingdom(kingdom);
    const read = await store.territories.read(SOURCE.territory);
    if (!read.ok) throw new Error('fixture: dc1-se-team');
    await store.territories.write({
      ...read.value,
      laws: { ...read.value.laws, protected_paths: ['docs/**'] },
    });
    for (const memo of [RENAME, LINK]) await store.memos.write(memo);
    const io = testIo();
    expect(await triage(io, chancellor(REPLY))).toBe(0);
    expect(io.printed.out[1]).toContain(`${LINK.id}: merge into quest ${DOCS.id}.`);
    expect(io.printed.out[1]).toContain('it touches protected paths');
    expect((await inbox()).map(({ kind }) => kind)).toEqual(['escalate_memo', 'escalate_memo']);
  });

  it('leaves out a letter a command in the inbox already decides, and says when a reply breaks its contract', async () => {
    for (const memo of [RENAME, LINK]) await openKingdom(kingdom).memos.write(memo);
    expect(await run(testIo(), 'memo', 'decide', LINK.id, 'rejected', '--kingdom', kingdom)).toBe(0);
    const runner = chancellor({ version: 1 });
    const io = testIo();
    expect(await triage(io, runner)).toBe(1);
    expect(runner.heard[0]?.prompt.user).not.toContain(LINK.id);
    expect(io.printed.err[0]).toBe("The Chancellor's reply does not follow the memo-triage contract:");
  });

  it('never takes an objection, to a second judge or to the owner (PS-22): only letters sent to the Chancellor', async () => {
    const objection = (id: string, to: Record<string, string>) =>
      MemoSchema.parse({ ...LINK, id, kind: 'objection', to, body: 'Ghi chú 1 sai: test đã có.' });
    const store = openKingdom(kingdom);
    await store.memos.write(objection('m_20261105_cccccc', { route: 'judge', verdict: `${SOURCE.id}-1` }));
    await store.memos.write(objection('m_20261105_dddddd', { route: 'owner', refusal: 'owner_verdict' }));
    const runner = chancellor(REPLY);
    const io = testIo();
    expect(await triage(io, runner)).toBe(0);
    expect(io.printed.out).toEqual(['No letter waits for the Chancellor.']);
    expect(runner.heard).toEqual([]);
  });

  it('runs as a job of the schedule: waits for the Chancellor’s tribe, ends with the Steward, throws on a failure', async () => {
    const io = testIo();
    const ctx = await openKingdomContext({ values: { kingdom }, positionals: [] }, cli(io));
    if (ctx === undefined) throw new Error('kingdom');
    const view = { day: '2026-11-06', notices: {} };
    const job = triageJob(ctx, { [CLAUDE]: chancellor({ version: 1 }) });
    expect(await job.ready?.({ ...view, busy: new Set([CLAUDE]) })).toBe(false);
    expect(await job.ready?.({ ...view, busy: new Set() })).toBe(true);
    const signal = new AbortController().signal;
    await job.run({ ...view, busy: new Set(), signal });
    expect(io.printed.out).toEqual([]);
    await openKingdom(kingdom).memos.write(LINK);
    await expect(job.run({ ...view, busy: new Set(), signal })).rejects.toThrow('invalid_reply');
    const stopping = new AbortController();
    stopping.abort();
    await job.run({ ...view, busy: new Set(), signal: stopping.signal });
    const done = triageJob(ctx, { [CLAUDE]: chancellor({ ...REPLY, decisions: [REPLY.decisions[0]] }) });
    await done.run({ ...view, busy: new Set(), signal });
    expect(io.printed.out.at(-1)).toBe('Triage of 1 letters: 1 decided without you, 0 sent up to you.');
    const nobody = triageJob(ctx, {});
    expect(await nobody.ready?.({ ...view, busy: new Set([CLAUDE]) })).toBe(true);
  });
});
