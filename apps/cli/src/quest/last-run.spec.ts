// `quest show` says what the last run came to (P1-46: (c) of P1-44, (b) of P1-42): its verdicts with their notes, the
// partial ones first, and the `plot.restored` lines of that run, so the owner need not open verdicts/ or the journal.
import { EventSchema, VerdictSchema } from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { QUEST_ID, plantQuests, questFixture } from '../../test/quest.ts';
import type { TempDir } from '../../test/cli.ts';

const AT = '2026-11-06T09:00:00+07:00';

const attempt = (n: number, role: string, character: string, outcome: string, session: string) => ({
  n,
  character,
  role,
  started_at: AT,
  ended_at: AT,
  outcome,
  session_id: session,
  run_dir: role === 'verifier' ? `.runs/${QUEST_ID}-${n}/verify` : `.runs/${QUEST_ID}-${n}`,
});

/** Run 1 judged by brann; run 2 read in part by ilse, then judged by mira. */
const RETURNED = questFixture('returned', QUEST_ID, {
  assignee: 'wren',
  attempts: 2,
  attempt_log: [
    attempt(1, 'assignee', 'wren', 'submitted', 's-1'),
    attempt(1, 'verifier', 'brann', 'submitted', 's-2'),
    attempt(2, 'assignee', 'wren', 'submitted', 's-3'),
    attempt(2, 'verifier', 'ilse', 'partial', 's-4'),
    attempt(2, 'verifier', 'mira', 'submitted', 's-5'),
  ],
});

const check = (id: string, pass: boolean, n: number) => ({
  id,
  pass,
  duration_ms: 1000,
  log_path: `.runs/${QUEST_ID}-${n}/checks/${id}.log`,
});

function verdict(id: string, n: number, extra: Record<string, unknown>) {
  return VerdictSchema.parse({
    version: 1,
    id: `${QUEST_ID}-${id}`,
    quest_id: QUEST_ID,
    attempt: n,
    ritual: 'build_review',
    checks: [check('lint', true, n)],
    by_human: false,
    created_at: AT,
    ...extra,
  });
}

let next = 0;
function restoredLine(n: number, paths: string[]) {
  next += 1;
  return EventSchema.parse({
    v: 1,
    id: `01M6RQ5Y000000000000000${String(next).padStart(3, '0')}`,
    ts: AT,
    type: 'plot.restored',
    actor: { kind: 'steward' },
    quest: QUEST_ID,
    territory: 'do-an',
    attempt: n,
    data: { paths },
  });
}

describe('elvaria quest show of a quest that has been judged', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const plantVerdicts = async (...verdicts: ReturnType<typeof verdict>[]) => {
    const store = openKingdom(kingdom);
    for (const value of verdicts) {
      const written = await store.verdicts.write(value);
      if (!written.ok) throw new Error(written.error.message);
    }
  };

  const show = async (...args: string[]) => {
    const io = testIo();
    expect(await run(io, 'quest', 'show', QUEST_ID, '--kingdom', kingdom, ...args)).toBe(0);
    return io.printed.out;
  };

  it('prints the verdicts of the last run, partial ones with their notes, and its plot.restored lines', async () => {
    await plantQuests(kingdom, RETURNED);
    await plantVerdicts(
      verdict('1', 1, { verifier_id: 'brann', result: 'pass', notes: 'An older run.', session_id: 's-2' }),
      verdict('2-p1', 2, {
        verifier_id: 'ilse',
        result: 'partial',
        progress: { checked_until: 'break_and_expect_red' },
        notes: 'The shell refused pnpm test.\nRead up to the second criterion.',
        session_id: 's-4',
      }),
      verdict('2', 2, {
        verifier_id: 'mira',
        result: 'fail',
        fail_kind: 'tests_fail',
        checks: [check('lint', true, 2), check('unit', false, 2)],
        notes: 'unit is red: scoring/effective-level.spec.ts fails twice.',
        session_id: 's-5',
      }),
    );
    const paths = Array.from({ length: 12 }, (_, k) => `docs/generated-${String(k + 1)}.md`);
    await openJournal(kingdom, QUEST_ID).append([restoredLine(1, ['old.txt']), restoredLine(2, paths)]);

    const out = await show('--locale', 'en');
    const at = out.indexOf('Attempt 2:');
    expect(out.slice(at, at + 20)).toEqual([
      'Attempt 2:',
      '  Partial verdict of ilse, read up to: break_and_expect_red',
      '    Notes: The shell refused pnpm test.',
      '      Read up to the second criterion.',
      '  Verdict of mira: fail (tests_fail)',
      '    Checks that failed: unit',
      '    Notes: unit is red: scoring/effective-level.spec.ts fails twice.',
      "  The Steward put the plot back to its commit, dropping 12 path(s) that commands (a judge's or the checks') left there:",
      ...paths.slice(0, 10).map((path) => `    ${path}`),
      "    …and 2 more (the quest's journal has them all)",
      '',
    ]);
    // The earlier run is not the last one.
    expect(out.join('\n')).not.toContain('An older run.');
    expect(out.join('\n')).not.toContain('old.txt');
    expect(out.at(-1)).toBe(RETURNED.description);
  });

  it("names the machine and the owner's own verdict, in the owner's language", async () => {
    const sealed = questFixture('done', QUEST_ID, {
      attempts: 1,
      attempt_log: [attempt(1, 'assignee', 'wren', 'submitted', 's-1')],
    });
    await plantQuests(kingdom, sealed);
    await plantVerdicts(
      verdict('1', 1, { verifier_id: 'machine', result: 'pass' }),
      verdict('1-user', 1, {
        verifier_id: 'user',
        by_human: true,
        result: 'pass',
        notes: 'Gọn, cảm ơn.',
      }),
    );
    const out = await show();
    const at = out.indexOf('Lần thử 1:');
    expect(out.slice(at, at + 4)).toEqual([
      'Lần thử 1:',
      '  Phán quyết của máy kiểm tra: đạt',
      '  Phán quyết của bạn: đạt',
      '    Ghi chú: Gọn, cảm ơn.',
    ]);
  });

  it('says nothing of a run before the first one, nor of a run that left no trace', async () => {
    // "Attempts" is a field of the table too: only a line that is the section's head counts.
    const heads = async () => (await show('--locale', 'en')).filter((line) => /^Attempt \d+:$/u.test(line));
    await plantQuests(kingdom, questFixture('open'));
    expect(await heads()).toEqual([]);
    const working = questFixture('working', QUEST_ID, {
      assignee: 'wren',
      attempts: 1,
      attempt_log: [
        { n: 1, character: 'wren', role: 'assignee', started_at: AT, run_dir: `.runs/${QUEST_ID}-1` },
      ],
    });
    await plantQuests(kingdom, working);
    expect(await heads()).toEqual([]);
  });
});
