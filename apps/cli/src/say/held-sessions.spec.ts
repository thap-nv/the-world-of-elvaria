// Sessions outside planTick on a tribe held by its CLI's version ((D) of fix/tribe-version-hold, fix/held-tribe-sessions):
// the Chancellor's triage and the owner's words, and an amendment's author, open no session while their tribe is held,
// as planTick's roster opens none. By hand (`elvaria triage`, `elvaria say`) the command says which tribe and which
// check; the Steward's jobs wait, and an amendment waits for its author instead of going to the owner. No mana:
// scripted runners, the holds given as the Steward's notices or as the command's own ask.
import { MemoSchema, TribeIdSchema } from '@elvaria/domain';
import type { InboxCommand, TribeHold } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ACCEPT, CHILD, CLAUDE, DRAFTED, author, seedAmendments } from '../../test/amend.ts';
import { foundKingdom, tempDir, testIo } from '../../test/cli.ts';
import { amendmentJob } from '../amend/job.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { triageJob } from '../triage/job.ts';
import { triageCommand } from '../triage/triage.ts';
import { sayCommand } from './say.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

const GEMINI = TribeIdSchema.parse('gemini');
const OLD = 'C:/Users/owner/.vscode/extensions/anthropic.claude-code-2.1.322-win32-x64/claude.exe';
/** Claude Code's pinned folder gone after a VS Code update (Codex's was, 2026-11-14). */
const GONE: TribeHold = { tribe: CLAUDE, path: OLD, version: undefined, checked: '2.1.322' };
const GEMINI_HELD: TribeHold = { tribe: GEMINI, path: 'C:/agy.exe', version: '1.5.9', checked: '1.5.8' };

const LETTER = MemoSchema.parse({
  version: 1,
  id: 'm_20261105_cccccc',
  kind: 'proposal',
  from: 'thorn',
  quest: DRAFTED.id,
  attempt: 1,
  to: { route: 'chancellor' },
  body: 'docs/guide.md có link chết.',
  refs: [],
  state: 'open',
  filed_at: '2026-11-05T11:00:00+07:00',
});

describe('sessions outside planTick on a held tribe', () => {
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
  const input = (...positionals: string[]) => ({ values: { kingdom }, positionals });
  const contextOf = async (io: TestIo) => {
    const ctx = await openKingdomContext(input(), cli(io));
    if (ctx === undefined) throw new Error('kingdom');
    return ctx;
  };
  const inbox = async (): Promise<InboxCommand[]> =>
    (await openKingdom(kingdom).inbox.read()).flatMap(({ command }) => (command.ok ? [command.value] : []));
  const view = (holds: readonly TribeHold[], amendments: readonly string[] = []) => ({
    day: '2026-11-05',
    notices: { tribes_held: holds },
    amendments: amendments as (typeof DRAFTED.id)[],
    busy: new Set<typeof CLAUDE>(),
    signal: new AbortController().signal,
  });
  const goneLine =
    `Tribe claude is held: the CLI the Steward starts for it, ${OLD}, is gone. elvaria tribe check claude ` +
    'finds the one now installed and pins it once it passes (a little mana); then restart elvaria run.';

  it('`elvaria triage` and `elvaria say` by hand open no session, and say which tribe to check', async () => {
    const runner = author(ACCEPT);
    const deps = { runnersOf: () => ({ [CLAUDE]: runner }), holdsOf: () => Promise.resolve([GONE]) };
    const triage = testIo();
    expect(await triageCommand(deps).run(input(), cli(triage))).toBe(1);
    const said = [
      'The Chancellor opens no session: every Chancellor who could speak now is of a held tribe.',
      goneLine,
    ];
    expect(triage.printed.err).toEqual(said);
    const say = testIo();
    expect(await sayCommand(deps).run(input('Sửa link chết.'), cli(say))).toBe(1);
    expect(say.printed.err).toEqual(said);
    expect(runner.heard).toEqual([]);
    expect(await inbox()).toEqual([]);
  });

  it("the triage job waits while the Chancellor's tribe is held, and runs once the hold ends", async () => {
    const runner = author({ version: 1, decisions: [], drafts: [] });
    const job = triageJob(await contextOf(testIo()), { [CLAUDE]: runner });
    expect(await job.ready?.(view([GONE]))).toBe(false);
    // Another tribe's hold keeps no one: aldric speaks.
    expect(await job.ready?.(view([GEMINI_HELD]))).toBe(true);
    // Held between `ready` and the run: no session, and the day is not counted as done.
    await expect(job.run(view([GONE]))).rejects.toThrow('held');
    expect(runner.heard).toEqual([]);
    await expect(job.run(view([]))).rejects.toThrow('invalid_reply');
    expect(runner.heard).toHaveLength(1);
  });

  it("an amendment waits for its author's tribe instead of going to the owner, the mage's as the Chancellor's", async () => {
    const runner = author(ACCEPT);
    const job = amendmentJob(await contextOf(testIo()), { [CLAUDE]: runner });
    // DRAFTED's author is the Chancellor aldric, CHILD's the mage merlin: both of the claude tribe.
    const both = [DRAFTED.id, CHILD.id];
    expect(await job.ready(view([GONE], both))).toBe(false);
    await job.run(view([GONE], both));
    expect(runner.heard).toEqual([]);
    expect(await inbox()).toEqual([]);
    expect(await job.ready(view([GEMINI_HELD], [CHILD.id]))).toBe(true);
    await job.run(view([GEMINI_HELD], [CHILD.id]));
    expect(runner.heard.map(({ character }) => character.id)).toEqual(['merlin']);
    expect(await inbox()).toEqual([expect.objectContaining({ kind: 'decide_amendment' })]);
  });
});
