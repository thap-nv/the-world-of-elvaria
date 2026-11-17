// The patrol in the owner's words (PS-26): `elvaria digest` reads the patrolled branches' health from the log as the
// Steward's book holds it (a red check with its error line, log, commit and suspects; a scan that did not pass), the
// bell names a turn to red and its draft, and `elvaria metrics` lists each turn beside the quests merged before it.
import { EVENT_VERSION, EventSchema, QuestIdSchema, TerritoryIdSchema } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { translator } from '@elvaria/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { QUEST_ID } from '../../test/quest.ts';
import { lineOf } from '../run/bell.ts';
import type { TempDir } from '../../test/cli.ts';

const SHA = 'abcdef1234567890abcdef1234567890abcdef12';
let serial = 0;
const line = (ts: string, type: string, data: Record<string, unknown>) => {
  serial += 1;
  return EventSchema.parse({
    v: EVENT_VERSION,
    id: `01JCF8X4Z6Q3W9N2M5R7T8V${String(serial).padStart(3, '0')}`,
    ts,
    type,
    actor: { kind: 'steward' },
    data,
  });
};
const check = (pass: boolean) => ({
  id: 'unit',
  pass,
  duration_ms: 1000,
  timed_out: false,
  environment: false,
  ...(pass ? {} : { error_line: 'FAIL src/a.spec.ts' }),
  log_path: '.runs/patrol-do-an/checks/unit.log',
});
const ran = (ts: string, pass: boolean, scans: readonly unknown[] = []) =>
  line(ts, 'patrol.ran', {
    territory: 'do-an',
    head: SHA,
    trigger: 'schedule',
    setup: null,
    checks: [check(pass)],
    scans,
  });
const merged = (ts: string) =>
  line(ts, 'delivery.merged', {
    quest: QUEST_ID,
    territory: 'do-an',
    branch: `quest/${QUEST_ID}`,
    head: SHA,
    pr: { number: 7, url: 'https://github.com/o/r/pull/7' },
    merge_sha: SHA,
    method: 'merge',
    sealed: false,
    branch_deleted: true,
  });

describe('the patrol in the digest and the metrics', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await openEventLog(kingdom).append([
      ran('2026-11-05T06:30:00+07:00', true),
      merged('2026-11-05T10:00:00+07:00'),
      ran('2026-11-06T06:30:00+07:00', false, [{ script: 'link-check', outcome: 'fail', count: 2 }]),
    ]);
  });
  afterEach(() => dir.remove());

  it('`elvaria digest` names the red check with its line, log, commit and suspect, and the failed scan', async () => {
    const io = testIo();
    expect(await run(io, 'digest', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    const text = io.printed.out.join('\n');
    expect(text).toContain(
      `- Territory do-an: check unit of the default branch is red since 2026-11-06T06:30:00+07:00 (commit abcdef1): FAIL src/a.spec.ts Log: .runs/patrol-do-an/checks/unit.log. Quests merged since the last green patrol: ${QUEST_ID}.`,
    );
    expect(text).toContain('`elvaria territory check do-an`');
    expect(text).toContain('- Territory do-an: scan link-check of the latest patrol: fail, 2 found.');
    expect(text).toContain('`elvaria territory patrol do-an`');
  });

  it('`elvaria metrics` lists the turn to red beside the quest merged before it, unsealed', async () => {
    const io = testIo();
    expect(await run(io, 'metrics', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    const text = printed(io);
    expect(text).toContain('Default branch red after a merge');
    expect(text).toContain(`${QUEST_ID} (unsealed)`);
  });
});

describe('the bell on a turn to red', () => {
  const en = translator('en');
  const territory = TerritoryIdSchema.parse('do-an');
  it('names the checks, and the draft to confirm when the patrol opened one', () => {
    const checks = [{ check: 'unit', error_line: 'FAIL' }, { check: 'setup' }];
    expect(lineOf(en, { kind: 'base_red', territory, checks })).toBe(
      'Territory do-an: the default branch turned red at unit, setup. See: elvaria digest',
    );
    const draft = QuestIdSchema.parse(QUEST_ID);
    expect(lineOf(en, { kind: 'base_red', territory, checks, draft })).toContain(
      `elvaria quest confirm ${QUEST_ID}`,
    );
  });
});
