import { createHash } from 'node:crypto';

import {
  CheckIdSchema,
  EVENT_VERSION,
  EventSchema,
  TerritoryIdSchema,
  VerdictIdSchema,
} from '@elvaria/domain';
import type { TempleEvidence, TempleTrigger } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { translator } from '@elvaria/i18n';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, tempDir, testIo } from '../../test/cli.ts';
import { FAILED, LETTER_REPLY, addMonk, monkRunner, stageFailures, templeRanOf } from '../../test/temple.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { evidenceHashOf } from './evidence-hash.ts';
import { reportTemple } from './report.ts';
import { runTemple } from './run-temple.ts';
import type { TempDir } from '../../test/cli.ts';

describe('scheduled Temple evidence', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await stageFailures(kingdom);
    await addMonk(kingdom);
  });
  afterEach(() => dir.remove());

  async function run(trigger: TempleTrigger, runner: ReturnType<typeof monkRunner>) {
    const io = testIo();
    const ctx = await openKingdomContext(
      { values: { kingdom }, positionals: [] },
      { io, locale: 'en', localeFromFlag: true, t: translator('en') },
    );
    if (ctx === undefined) throw new Error('kingdom');
    const options = { trigger, day: '2026-11-20', actor: { kind: 'steward' as const }, waits: { holds: [] } };
    const result = await runTemple(ctx, { [runner.tribe]: runner }, options);
    reportTemple(ctx, result);
    return { result, io };
  }

  it('skips repeated unchanged packs, records zero cost, and still runs for the owner', async () => {
    const runner = monkRunner([{ structured: LETTER_REPLY }, { structured: LETTER_REPLY }]);
    expect((await run('quests', runner)).result.status).toBe('sent');
    for (const trigger of ['weekly', 'suspension'] as const) {
      const skipped = await run(trigger, runner);
      expect(skipped.result).toEqual({ status: 'unchanged' });
      expect(skipped.io.printed.out).toContain(
        "The Temple's evidence is unchanged since its last model session. No model was called.",
      );
    }
    expect(runner.heard).toHaveLength(1);
    const events = await templeRanOf(kingdom);
    expect(events).toHaveLength(3);
    expect(events[1]?.data).toEqual({
      trigger: 'weekly',
      day: '2026-11-20',
      groups: 1,
      operations: 0,
      letters: 0,
      tokens: 0,
      evidence_hash: events[0]?.data.evidence_hash,
    });
    expect(events[1]?.data.evidence_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(events[2]?.data.evidence_hash).toBe(events[0]?.data.evidence_hash);
    expect((await run('owner', runner)).result.status).toBe('sent');
    expect(runner.heard).toHaveLength(2);
  });

  it('calls the runner when notes in a group change', async () => {
    const runner = monkRunner([{ structured: LETTER_REPLY }, { structured: LETTER_REPLY }]);
    await run('quests', runner);
    const store = openKingdom(kingdom);
    const verdict = await store.verdicts.read(VerdictIdSchema.parse(FAILED));
    if (!verdict.ok) throw new Error('verdict');
    await store.verdicts.write({ ...verdict.value, notes: 'A changed failure in the same group.' });
    expect((await run('weekly', runner)).result.status).toBe('sent');
    expect(runner.heard).toHaveLength(2);
    const events = await templeRanOf(kingdom);
    expect(events[1]?.data.evidence_hash).not.toBe(events[0]?.data.evidence_hash);
  });

  it('calls the runner after a legacy session without a hash', async () => {
    await openEventLog(kingdom).append([
      EventSchema.parse({
        v: EVENT_VERSION,
        id: '01JCFBR221FWTEMPXERAN000E1',
        ts: '2026-11-19T06:05:00+07:00',
        type: 'temple.ran',
        actor: { kind: 'steward' },
        data: {
          trigger: 'quests',
          day: '2026-11-19',
          groups: 1,
          operations: 0,
          letters: 0,
          tribe: 'gemini',
          model: 'gemini-3.8-flash-low',
          session: 'old',
        },
      }),
    ]);
    const runner = monkRunner([{ structured: LETTER_REPLY }]);
    expect((await run('weekly', runner)).result.status).toBe('sent');
    expect(runner.heard).toHaveLength(1);
  });
});

it('hashes recursive sorted keys, preserves array order and uses sha256', () => {
  const base: TempleEvidence = { groups: [], lines: [], reviews: [], checks: {}, scripts: [], dropped: [] };
  expect(evidenceHashOf(base)).toBe(
    createHash('sha256')
      .update('{"checks":{},"dropped":[],"groups":[],"lines":[],"reviews":[],"scripts":[]}')
      .digest('hex'),
  );
  const z = TerritoryIdSchema.parse('z');
  const a = TerritoryIdSchema.parse('a');
  const checks = [CheckIdSchema.parse('b'), CheckIdSchema.parse('a')];
  const first: TempleEvidence = { ...base, checks: { [z]: checks, [a]: [] } };
  expect(evidenceHashOf(first)).toBe(evidenceHashOf({ ...base, checks: { [a]: [], [z]: checks } }));
  const changed = evidenceHashOf({ ...first, checks: { [z]: [...checks].reverse(), [a]: [] } });
  expect(evidenceHashOf(first)).not.toBe(changed);
});
