// What a session of the Chancellor's office spent goes into the log (fix/run-221-followups, (b) of (248)): the owner's
// words, a triage of memos and an amendment's author each write one `chancellor.answered` line with the tokens the
// session reported, for the Steward's mana estimate; a session with no reply to use writes none, and a line that
// cannot be written is said while what the session answered stands.
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { MemoSchema } from '@elvaria/domain';
import type { Event, Quest } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { translator } from '@elvaria/i18n';
import { createFakeRunner } from '@elvaria/runner-core';
import type { AgentRunner } from '@elvaria/runner-core';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ACCEPT, CLAUDE, DRAFTED, seedAmendments } from '../../test/amend.ts';
import { foundKingdom, tempDir, testIo } from '../../test/cli.ts';
import { amendmentJob } from '../amend/job.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { triageCommand } from '../triage/triage.ts';
import { sayCommand } from './say.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

const SPLIT = path.join(
  import.meta.dirname,
  ...[
    '..',
    '..',
    '..',
    '..',
    'packages',
    'chancellor',
    'src',
    '__fixtures__',
    'structured-output',
    'split.json',
  ],
);

/** A letter for the Chancellor's triage, and the reply that sends it to the owner. */
const LETTER = MemoSchema.parse({
  version: 1,
  id: 'm_20261105_dddddd',
  kind: 'proposal',
  from: 'thorn',
  quest: DRAFTED.id,
  attempt: 1,
  to: { route: 'chancellor' },
  body: 'Đổi tên trường bell.desktop.',
  refs: ['docs/kingdom.md'],
  state: 'open',
  filed_at: '2026-11-05T11:00:00+07:00',
});
const TRIAGED = {
  version: 1,
  decisions: [{ memo: LETTER.id, action: 'owner', ask: ['contract_change'], note: 'Đổi hợp đồng.' }],
  drafts: [],
};

/** A runner whose sessions end with `structured` and report `tokens`, as a real CLI's usage does. */
function spending(structured: unknown, tokens: number): AgentRunner {
  const fake = createFakeRunner();
  return {
    ...fake,
    spawn: async (req) => {
      const session = await fake.spawn(req);
      return { ...session, wait: async () => ({ ...(await session.wait()), structured, usage: { tokens } }) };
    },
  };
}

describe("what the Chancellor's office spent, in the log", () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await seedAmendments(dir.root, kingdom);
    await openKingdom(kingdom).memos.write(LETTER);
  });
  afterEach(() => dir.remove());

  const cli = (io: TestIo) => ({ io, locale: 'en' as const, localeFromFlag: true, t: translator('en') });
  const args = (positionals: string[] = []) => ({ values: { kingdom }, positionals });
  const triage = (io: TestIo, runner: AgentRunner) =>
    triageCommand({ runnersOf: () => ({ [CLAUDE]: runner }) }).run(args(), cli(io));
  const answered = async (): Promise<Pick<Event, 'actor' | 'data'>[]> =>
    (await openEventLog(kingdom).read()).events
      .filter(({ type }) => type === 'chancellor.answered')
      .map(({ actor, data }) => ({ actor, data }));
  // The Chancellor seedAmendments summons: `character add` gives a claude character its default model.
  const aldric = { kind: 'character', id: 'aldric' };
  const model = 'claude-sonnet-5-5';

  it('writes one line for a triage, one for the words of the owner, one for an amendment', async () => {
    expect(await triage(testIo(), spending(TRIAGED, 48_310))).toBe(0);
    const words = spending(JSON.parse(await readFile(SPLIT, 'utf8')), 12_000);
    const said = sayCommand({ runnersOf: () => ({ [CLAUDE]: words }) });
    expect(await said.run(args(['Viết lại docs/architecture.md theo 18 ADR']), cli(testIo()))).toBe(0);
    const ctx = await openKingdomContext(args(), cli(testIo()));
    if (ctx === undefined) throw new Error('kingdom');
    const view = {
      day: '2026-11-05',
      notices: {},
      amendments: [DRAFTED.id] as Quest['id'][],
      busy: new Set([]),
    };
    await amendmentJob(ctx, { [CLAUDE]: spending(ACCEPT, 7_500) }).run({
      ...view,
      signal: new AbortController().signal,
    });
    expect(await answered()).toEqual([
      { actor: aldric, data: { tribe: 'claude', model, matter: 'triage', tokens: 48_310 } },
      { actor: aldric, data: { tribe: 'claude', model, matter: 'drafts', tokens: 12_000 } },
      { actor: aldric, data: { tribe: 'claude', model, matter: 'amendment', tokens: 7_500 } },
    ]);
  });

  it('writes none for a session whose reply cannot be used', async () => {
    expect(await triage(testIo(), spending({ version: 1 }, 9_000))).toBe(1);
    expect(await answered()).toEqual([]);
  });

  it('says a line it cannot write, and the triage still sends its commands', async () => {
    const events = path.join(kingdom, 'events');
    await rm(events, { recursive: true, force: true });
    await writeFile(events, 'not a folder');
    const io = testIo();
    expect(await triage(io, spending(TRIAGED, 48_310))).toBe(0);
    expect(io.printed.err.join('\n')).toContain(
      '! The tokens of the session could not be written to the log (',
    );
    expect((await openKingdom(kingdom).inbox.read()).length).toBe(1);
  });
});
