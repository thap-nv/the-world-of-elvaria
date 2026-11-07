import { describe, expect, it } from 'vitest';

import { VerdictSchema } from '../schema/quest/verdict.ts';
import { scriptCheckId, scriptVerdictOf } from './script-verdict.ts';
import type { QuestId, RitualId, ScriptId } from '../core/ids.ts';
import type { ScriptReview } from './script-verdict.ts';

const QUEST = 'q_20261107_s1c7p0' as QuestId;
const LOG = `.runs/${QUEST}-1/script.log`;

const review = (fields: Partial<ScriptReview> = {}): ScriptReview => ({
  quest: { id: QUEST },
  n: 1,
  ritual: 'unit_tally' as RitualId,
  script: { id: 'link-check' as ScriptId },
  result: { kind: 'result', pass: true, summary: '2 units: 2 done' },
  duration_ms: 812,
  log_path: LOG,
  at: '2026-11-07T10:00:00+07:00',
  ...fields,
});

describe('scriptCheckId', () => {
  it('names the check after the script, in snake case', () => {
    expect(scriptCheckId('link-check' as ScriptId)).toBe('link_check');
    expect(scriptCheckId('count-files' as ScriptId)).toBe('count_files');
  });
});

describe('scriptVerdictOf', () => {
  it('passes a run whose result passes: the machine judges, one check, the summary after it', () => {
    const made = scriptVerdictOf(review());
    expect(made).toEqual({
      ok: true,
      value: {
        version: 1,
        id: `${QUEST}-1`,
        quest_id: QUEST,
        attempt: 1,
        verifier_id: 'machine',
        ritual: 'unit_tally',
        checks: [{ id: 'link_check', pass: true, duration_ms: 812, log_path: LOG }],
        result: 'pass',
        notes: `✓ link_check: ${LOG}\n\n2 units: 2 done`,
        by_human: false,
        created_at: '2026-11-07T10:00:00+07:00',
      },
    });
    expect(made.ok && VerdictSchema.safeParse(made.value).success).toBe(true);
  });

  it('fails a run whose result fails, with the failing check first, then what is left', () => {
    const result = {
      kind: 'result',
      pass: false,
      summary: '2 units: 1 done, 1 not_done\n- b (not_done): b.md',
    } as const;
    const made = scriptVerdictOf(review({ result }));
    expect(made).toMatchObject({
      ok: true,
      value: {
        result: 'fail',
        fail_kind: 'tests_fail',
        notes: `✗ link_check: ${LOG}\n\n${result.summary}`,
      },
    });
    expect(made.ok && VerdictSchema.safeParse(made.value).success).toBe(true);
  });

  it('refuses inputs the verdict schema refuses', () => {
    expect(scriptVerdictOf(review({ at: 'yesterday' }))).toEqual({
      ok: false,
      error: { code: 'invalid_verdict' },
    });
  });
});
