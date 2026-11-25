// PS-12f: the Temple as the Steward's job on call, with a scripted Monk (no mana). It is ready only when the Temple is
// due and a Monk's tribe is free, not held and its pool open; no Monk is said once. In a real Steward a rung `check`
// becomes a proposal letter to the Chancellor after two ticks, and no line. A stop mid-session writes nothing and
// leaves the Temple due, so the next start runs it again.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { CharacterIdSchema, templeDue, templeLogOf } from '@elvaria/domain';
import type { TribeId } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { translator } from '@elvaria/i18n';
import type { JobView } from '@elvaria/steward';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, tempDir, testIo } from '../__fixtures__/cli.ts';
import { QUIET_VIEW } from '../__fixtures__/job-view.ts';
import {
  HOLD,
  LETTER_REPLY,
  addMonk,
  inboxOf,
  monkRunner,
  stageFailures,
  stewardOf,
  templeRanOf,
} from '../__fixtures__/temple.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { templeJob } from './job.ts';
import type { TempDir, TestIo } from '../__fixtures__/cli.ts';

const GEMINI = 'gemini' as TribeId;
const SCHEDULE = { enabled: true, every_quests: 2, weekly: false };
const DAY = '2026-11-06';
const LOG = { last_day: null, judged: 3, fails: 3, suspended: [] };

type Run = JobView & { readonly signal: AbortSignal };

const viewOf = (over: Partial<Run> = {}): Run => ({
  day: DAY,
  notices: {},
  amendments: [],
  busy: new Set(),
  temple: { log: LOG, due: templeDue(SCHEDULE, LOG, DAY) },
  mana_open: new Set([CharacterIdSchema.parse('sage')]),
  signal: new AbortController().signal,
  ...over,
});

describe('the Temple on call (PS-12f)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await stageFailures(kingdom);
  });
  afterEach(() => dir.remove());

  const contextOf = async (io: TestIo) => {
    const cli = { io, locale: 'en' as const, localeFromFlag: true, t: translator('en') };
    const ctx = await openKingdomContext({ values: { kingdom }, positionals: [] }, cli);
    if (ctx === undefined) throw new Error('kingdom');
    return ctx;
  };

  it('waits for a due Temple and a free, open, unheld tribe; says once that there is no Monk', async () => {
    const io = testIo();
    const job = templeJob(await contextOf(io), { [GEMINI]: monkRunner([]) });
    expect(await job.ready(viewOf())).toBe(false);
    expect(await job.ready(viewOf())).toBe(false);
    expect(io.printed.err).toHaveLength(1);
    expect(io.printed.err[0]).toContain('No Monk can run the Temple');
    await addMonk(kingdom);
    expect(await job.ready(viewOf())).toBe(true);
    expect(await job.ready(viewOf({ temple: QUIET_VIEW.temple }))).toBe(false);
    expect(await job.ready(viewOf({ busy: new Set([GEMINI]) }))).toBe(false);
    expect(await job.ready(viewOf({ notices: { tribes_held: [HOLD] } }))).toBe(false);
    expect(await job.ready(viewOf({ mana_open: new Set() }))).toBe(false);
    expect(io.printed.err).toHaveLength(1);
  });

  it('stopped mid-session, writes nothing and leaves the Temple due for the next start', async () => {
    await addMonk(kingdom);
    const io = testIo();
    const runner = monkRunner([{ hang: true }]);
    const job = templeJob(await contextOf(io), { [GEMINI]: runner });
    await job.run(viewOf({ signal: AbortSignal.abort() }));
    expect(runner.heard).toHaveLength(1);
    expect(io.printed.err).toContain(
      'The Steward stopped while the Monk was answering; the session was ended and nothing was written. The Temple runs again at the next start.',
    );
    expect(await inboxOf(kingdom)).toEqual([]);
    expect(await templeRanOf(kingdom)).toEqual([]);
    const events = (await openEventLog(kingdom).read()).events;
    expect(templeDue(SCHEDULE, templeLogOf(events), DAY)).toEqual({ due: true, trigger: 'quests' });
  });

  it('sends a rung check to the Chancellor as a proposal after two ticks, and no line of scripture', async () => {
    await addMonk(kingdom);
    const store = openKingdom(kingdom);
    const read = await store.kingdom.read();
    if (!read.ok) throw new Error('kingdom.json');
    await store.kingdom.write({ ...read.value, schedule: { ...read.value.schedule, temple: SCHEDULE } });
    const io = testIo();
    const runner = monkRunner([{ structured: LETTER_REPLY }]);
    const steward = await stewardOf(kingdom, io, [templeJob(await contextOf(io), { [GEMINI]: runner })]);
    await steward.tick();
    await steward.idle();
    await steward.tick();
    // The temple.ran of the run is in the log now: the Temple is not due again today.
    await steward.tick();
    await steward.stop();
    expect(runner.heard).toHaveLength(1);
    const memos = (await store.memos.list()).items;
    expect(memos.map(({ kind, from, to }) => [kind, from, to])).toEqual([
      ['proposal', 'sage', { route: 'chancellor' }],
    ]);
    await expect(readFile(path.join(kingdom, 'temple', 'scripture.md'), 'utf8')).rejects.toThrow();
    const [ran] = await templeRanOf(kingdom);
    expect(ran?.data).toMatchObject({ trigger: 'quests', groups: 1, operations: 0, letters: 1 });
  });
});
